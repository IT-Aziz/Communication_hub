/**
 * Admin "Categories" section: category grid (create/edit/delete) + drill-in view of one
 * category's posts.
 *
 * Plain classic script, not an ES module - see utils.js for why. Wrapped in an IIFE so its
 * private state doesn't leak into the shared global scope - other admin page scripts declare
 * same-named locals of their own. Uses CH.openNewPostForm / CH.openEditPostForm, so must load
 * after admin-posts.js. Exposes CH.openNewCategoryForm for admin-home.js, so must load before it.
 */
window.CH = window.CH || {};

(function () {
  const categoriesGrid = document.getElementById("categoriesGrid");
  const categoriesEmptyState = document.getElementById("categoriesEmptyState");
  const categoryPostsGrid = document.getElementById("categoryPostsGrid");
  const categoryPostsEmptyState = document.getElementById("categoryPostsEmptyState");
  const postsCategoryTitle = document.getElementById("postsCategoryTitle");
  const postsCategoryDescription = document.getElementById("postsCategoryDescription");
  const newCategoryButton = document.getElementById("newCategoryButton");
  const newPostInCategoryButton = document.getElementById("newPostInCategoryButton");
  const backToCategoriesButton = document.getElementById("backToCategoriesButton");
  const categoryGridView = document.getElementById("categoryGridView");
  const categoryPostsView = document.getElementById("categoryPostsView");

  const categoryFormDialog = document.getElementById("categoryFormDialog");
  const categoryForm = document.getElementById("categoryForm");
  const categoryFormTitle = document.getElementById("categoryFormTitle");
  const categoryFormSubmitButton = document.getElementById("categoryFormSubmitButton");
  const categoryIconPicker = document.getElementById("categoryIconPicker");
  const categoryImageInput = document.getElementById("categoryImage");
  const categoryImagePreview = document.getElementById("categoryImagePreview");
  const removeCategoryImageButton = document.getElementById("removeCategoryImageButton");
  const categoryPreviewContent = document.getElementById("categoryPreviewContent");

  let categories = [];
  let allPosts = [];
  let categoryPosts = [];
  let selectedCategory = null;
  let currentCategoryImageValue = "";
  let currentCategoryIconValue = "";

  CH.setupDialogDismissal(categoryFormDialog);

  function loadingMarkup(message) {
    return `<div class="loading-state"><span class="spinner" aria-hidden="true"></span><span>${message}</span></div>`;
  }

  function showCategoryView(viewName) {
    categoryGridView.classList.toggle("view--active", viewName === "grid");
    categoryPostsView.classList.toggle("view--active", viewName === "posts");
  }

  async function loadCategories() {
    categoriesGrid.innerHTML = loadingMarkup("Loading categories…");
    categoriesEmptyState.hidden = true;
    try {
      const [categoriesResult, postsResult] = await Promise.all([CH.categoryService.getAll(), CH.postService.getAll()]);
      categories = categoriesResult;
      allPosts = postsResult;
      renderCategoriesGrid();
    } catch (error) {
      categoriesGrid.innerHTML = "";
      categoriesEmptyState.hidden = false;
      categoriesEmptyState.textContent = error.message;
    }
  }

  function renderCategoriesGrid() {
    if (categories.length === 0) {
      categoriesGrid.innerHTML = "";
      categoriesEmptyState.hidden = false;
      return;
    }
    categoriesEmptyState.hidden = true;
    categoriesGrid.innerHTML = categories
      .map((category, index) =>
        CH.renderCategoryCard(category, {
          positionIndex: index,
          postCount: allPosts.filter((post) => post.categoryId === category.categoryId).length,
          showActions: true,
        }),
      )
      .join("");
  }

  // ---------- Drilling into one category's posts ----------

  async function openCategoryPosts(categoryId) {
    selectedCategory = categories.find((category) => category.categoryId === categoryId);
    if (!selectedCategory) return;

    postsCategoryTitle.textContent = selectedCategory.categoryName;
    postsCategoryDescription.textContent = selectedCategory.description;
    categoryPostsGrid.innerHTML = loadingMarkup("Loading posts…");
    categoryPostsEmptyState.hidden = true;
    showCategoryView("posts");

    await refreshCategoryPosts();
  }

  async function refreshCategoryPosts() {
    if (!selectedCategory) return;
    try {
      categoryPosts = await CH.categoryService.getPosts(selectedCategory.categoryId);
      if (categoryPosts.length === 0) {
        categoryPostsGrid.innerHTML = "";
        categoryPostsEmptyState.hidden = false;
        return;
      }
      categoryPostsEmptyState.hidden = true;
      categoryPostsGrid.innerHTML = categoryPosts
        .map((post) => CH.renderPostCard(post, { categoryName: selectedCategory.categoryName, showActions: true }))
        .join("");
    } catch (error) {
      categoryPostsGrid.innerHTML = "";
      categoryPostsEmptyState.hidden = false;
      categoryPostsEmptyState.textContent = error.message;
    }
  }

  categoryPostsGrid.addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-post]");
    const deleteButton = event.target.closest("[data-delete-post]");
    const card = event.target.closest("[data-post-id]");

    if (editButton) {
      const post = categoryPosts.find((item) => item.postId === editButton.dataset.editPost);
      if (post) CH.openEditPostForm(post);
      return;
    }

    if (deleteButton) {
      const post = categoryPosts.find((item) => item.postId === deleteButton.dataset.deletePost);
      if (!post) return;
      const confirmed = await CH.confirmAction({
        title: "Delete this post?",
        message: `"${post.title}" will be permanently deleted.`,
      });
      if (!confirmed) return;
      try {
        await CH.postService.remove(post.postId);
        CH.showToast("Post deleted successfully.");
        window.dispatchEvent(new CustomEvent("posts:changed"));
      } catch (error) {
        CH.showToast(error.message, "error");
      }
      return;
    }

    if (card) {
      const post = categoryPosts.find((item) => item.postId === card.dataset.postId);
      if (post) CH.openEditPostForm(post);
    }
  });

  categoryPostsGrid.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest("[data-post-id]");
    if (card && event.target === card) {
      event.preventDefault();
      const post = categoryPosts.find((item) => item.postId === card.dataset.postId);
      if (post) CH.openEditPostForm(post);
    }
  });

  window.addEventListener("posts:changed", () => {
    if (categoryPostsView.classList.contains("view--active")) {
      refreshCategoryPosts();
    } else {
      loadCategories(); // keeps the grid's post counts fresh
    }
  });

  // ---------- New / edit category form ----------

  function getPreviewPositionIndex() {
    const editingId = categoryForm.elements.categoryId.value;
    const index = categories.findIndex((category) => category.categoryId === editingId);
    return index === -1 ? categories.length : index;
  }

  function updateCategoryPreview() {
    const previewCategory = {
      categoryId: "preview",
      categoryName: categoryForm.elements.categoryName.value || "Category name",
      description: categoryForm.elements.description.value || "A short description of this category.",
      image: currentCategoryImageValue,
      icon: currentCategoryIconValue,
    };
    categoryPreviewContent.innerHTML = CH.renderCategoryCard(previewCategory, {
      positionIndex: getPreviewPositionIndex(),
      postCount: 0,
    });
  }

  /** Renders the icon choices as a grid of toggle buttons; "Aa" stands for the initial-letter default. */
  function renderIconPicker() {
    const noneButton = `
      <button
        type="button"
        class="icon-picker__option ${!currentCategoryIconValue ? "icon-picker__option--active" : ""}"
        data-icon-value=""
        aria-pressed="${!currentCategoryIconValue}"
        aria-label="Use the category's initial letter"
      ><span class="icon-picker__letter">Aa</span></button>
    `;
    const iconButtons = CH.CATEGORY_ICON_OPTIONS.map(
      (iconName) => `
        <button
          type="button"
          class="icon-picker__option ${currentCategoryIconValue === iconName ? "icon-picker__option--active" : ""}"
          data-icon-value="${iconName}"
          aria-pressed="${currentCategoryIconValue === iconName}"
          aria-label="${iconName}"
        >${CH.icon(iconName, { size: 20 })}</button>
      `,
    ).join("");
    categoryIconPicker.innerHTML = noneButton + iconButtons;
  }

  categoryIconPicker.addEventListener("click", (event) => {
    const button = event.target.closest("[data-icon-value]");
    if (!button) return;
    currentCategoryIconValue = button.dataset.iconValue;
    renderIconPicker();
    updateCategoryPreview();
  });

  function resetCategoryForm() {
    categoryForm.reset();
    CH.applyFieldErrors(categoryForm, {});
    currentCategoryImageValue = "";
    categoryImagePreview.hidden = true;
    categoryImagePreview.src = "";
    removeCategoryImageButton.hidden = true;
    currentCategoryIconValue = "";
    renderIconPicker();
  }

  CH.openNewCategoryForm = function openNewCategoryForm() {
    resetCategoryForm();
    categoryForm.elements.categoryId.value = "";
    categoryFormTitle.textContent = "New Category";
    categoryFormSubmitButton.textContent = "Create Category";
    updateCategoryPreview();
    CH.openModal(categoryFormDialog);
  };

  function openEditCategoryForm(category) {
    resetCategoryForm();
    categoryForm.elements.categoryId.value = category.categoryId;
    categoryForm.elements.categoryName.value = category.categoryName;
    categoryForm.elements.description.value = category.description;
    currentCategoryImageValue = category.image || "";
    if (currentCategoryImageValue) {
      categoryImagePreview.src = currentCategoryImageValue;
      categoryImagePreview.hidden = false;
      removeCategoryImageButton.hidden = false;
    }
    currentCategoryIconValue = category.icon || "";
    renderIconPicker();
    categoryFormTitle.textContent = "Edit Category";
    categoryFormSubmitButton.textContent = "Save Changes";
    updateCategoryPreview();
    CH.openModal(categoryFormDialog);
  }

  categoryImageInput.addEventListener("change", async () => {
    const file = categoryImageInput.files[0];
    if (!file) return;
    currentCategoryImageValue = await CH.readFileAsDataUrl(file);
    categoryImagePreview.src = currentCategoryImageValue;
    categoryImagePreview.hidden = false;
    removeCategoryImageButton.hidden = false;
    updateCategoryPreview();
  });

  removeCategoryImageButton.addEventListener("click", () => {
    currentCategoryImageValue = "";
    categoryImageInput.value = "";
    categoryImagePreview.hidden = true;
    categoryImagePreview.src = "";
    removeCategoryImageButton.hidden = true;
    updateCategoryPreview();
  });

  categoryForm.addEventListener("input", updateCategoryPreview);

  categoryForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formValues = {
      categoryId: categoryForm.elements.categoryId.value,
      categoryName: categoryForm.elements.categoryName.value.trim(),
      description: categoryForm.elements.description.value.trim(),
      image: currentCategoryImageValue,
      icon: currentCategoryIconValue,
    };

    const errors = CH.validateCategoryForm(formValues);
    CH.applyFieldErrors(categoryForm, errors);
    if (CH.hasErrors(errors)) return;

    const isEditing = Boolean(formValues.categoryId);
    categoryFormSubmitButton.disabled = true;
    categoryFormSubmitButton.textContent = "Saving…";

    try {
      if (isEditing) {
        await CH.categoryService.update(formValues.categoryId, formValues);
        CH.showToast("Category updated successfully.");
      } else {
        await CH.categoryService.create(formValues);
        CH.showToast("Category created successfully.");
      }
      CH.closeModal(categoryFormDialog);
      await loadCategories();
      window.dispatchEvent(new CustomEvent("categories:changed"));
    } catch (error) {
      CH.showToast(error.message, "error");
    } finally {
      categoryFormSubmitButton.disabled = false;
      categoryFormSubmitButton.textContent = isEditing ? "Save Changes" : "Create Category";
    }
  });

  // ---------- Category grid interactions ----------

  categoriesGrid.addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-category]");
    const deleteButton = event.target.closest("[data-delete-category]");
    const card = event.target.closest("[data-category-id]");

    if (editButton) {
      const category = categories.find((item) => item.categoryId === editButton.dataset.editCategory);
      if (category) openEditCategoryForm(category);
      return;
    }

    if (deleteButton) {
      const category = categories.find((item) => item.categoryId === deleteButton.dataset.deleteCategory);
      if (!category) return;
      const confirmed = await CH.confirmAction({
        title: "Delete this category?",
        message: `"${category.categoryName}" will be permanently deleted. This can't be undone.`,
      });
      if (!confirmed) return;
      try {
        await CH.categoryService.remove(category.categoryId);
        CH.showToast("Category deleted successfully.");
        await loadCategories();
        window.dispatchEvent(new CustomEvent("categories:changed"));
      } catch (error) {
        CH.showToast(error.message, "error");
      }
      return;
    }

    if (card) openCategoryPosts(card.dataset.categoryId);
  });

  categoriesGrid.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest("[data-category-id]");
    if (card && event.target === card) {
      event.preventDefault();
      openCategoryPosts(card.dataset.categoryId);
    }
  });

  backToCategoriesButton.addEventListener("click", () => showCategoryView("grid"));
  newCategoryButton.addEventListener("click", CH.openNewCategoryForm);
  newPostInCategoryButton.addEventListener("click", () => {
    if (selectedCategory) CH.openNewPostForm(selectedCategory.categoryId);
  });

  window.addEventListener("hashchange", () => {
    if (window.location.hash === "#categories") loadCategories();
  });

  loadCategories();
})();
