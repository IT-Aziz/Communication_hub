/**
 * Admin "Posts" section: the shared post create/edit form dialog (also opened from
 * admin-categories.js's "New Post" inside a category) plus the all-posts grid + search.
 *
 * Plain classic script, not an ES module - see utils.js for why. Wrapped in an IIFE so its
 * private state (categories, allPosts, form element refs, etc.) doesn't leak into the shared
 * global scope - other admin page scripts declare same-named locals of their own. Exposes
 * CH.openNewPostForm / CH.openEditPostForm for admin-categories.js and admin-home.js, so this
 * file must load before both.
 */
window.CH = window.CH || {};

(function () {
  const CREATOR_ROLE = "Admin";

  const allPostsGrid = document.getElementById("allPostsGrid");
  const allPostsEmptyState = document.getElementById("allPostsEmptyState");
  const postsSearchInput = document.getElementById("postsSearchInput");
  const newPostButton = document.getElementById("newPostButton");

  const postFormDialog = document.getElementById("postFormDialog");
  const postForm = document.getElementById("postForm");
  const postFormTitle = document.getElementById("postFormTitle");
  const postFormSubmitButton = document.getElementById("postFormSubmitButton");
  const postCategorySelect = document.getElementById("postCategory");
  const postImageInput = document.getElementById("postImage");
  const postImagePreview = document.getElementById("postImagePreview");
  const removePostImageButton = document.getElementById("removePostImageButton");
  const postPreviewContent = document.getElementById("postPreviewContent");

  let categories = [];
  let allPosts = [];
  let currentImageValue = "";
  let searchQuery = "";

  CH.setupDialogDismissal(postFormDialog);

  function loadingMarkup(message) {
    return `<div class="loading-state"><span class="spinner" aria-hidden="true"></span><span>${message}</span></div>`;
  }

  async function loadCategoriesForSelect() {
    categories = await CH.categoryService.getAll();
    postCategorySelect.innerHTML = categories
      .map((category) => `<option value="${CH.escapeHtml(category.categoryId)}">${CH.escapeHtml(category.categoryName)}</option>`)
      .join("");
  }

  function categoriesById() {
    return Object.fromEntries(categories.map((category) => [category.categoryId, category]));
  }

  function renderAllPosts() {
    const byId = categoriesById();
    const query = searchQuery.trim().toLowerCase();
    const filtered = allPosts.filter((post) => {
      if (!query) return true;
      return post.title.toLowerCase().includes(query) || (post.shortDescription || "").toLowerCase().includes(query);
    });

    if (filtered.length === 0) {
      allPostsGrid.innerHTML = "";
      allPostsEmptyState.hidden = false;
      allPostsEmptyState.textContent = allPosts.length === 0 ? "No posts yet." : "No posts match your search.";
      return;
    }
    allPostsEmptyState.hidden = true;
    allPostsGrid.innerHTML = filtered
      .map((post) =>
        CH.renderPostCard(post, { categoryName: byId[post.categoryId]?.categoryName ?? "Uncategorized", showActions: true }),
      )
      .join("");
  }

  async function loadAllPosts() {
    allPostsGrid.innerHTML = loadingMarkup("Loading posts…");
    allPostsEmptyState.hidden = true;
    try {
      const [postsResult] = await Promise.all([CH.postService.getAll(), loadCategoriesForSelect()]);
      allPosts = postsResult;
      renderAllPosts();
    } catch (error) {
      allPostsGrid.innerHTML = "";
      allPostsEmptyState.hidden = false;
      allPostsEmptyState.textContent = error.message;
    }
  }

  postsSearchInput.addEventListener("input", () => {
    searchQuery = postsSearchInput.value;
    renderAllPosts();
  });

  // ---------- Shared post form (also used by admin-categories.js's "New Post" inside a category) ----------

  function updatePreview() {
    const categoryName = categories.find((category) => category.categoryId === postCategorySelect.value)?.categoryName ?? "";
    const previewPost = {
      title: postForm.elements.title.value || "Untitled post",
      shortDescription: postForm.elements.shortDescription.value,
      fullDescription: postForm.elements.fullDescription.value || "Nothing written yet.",
      image: currentImageValue,
      postDate: postForm.elements.postDate.value,
    };
    postPreviewContent.innerHTML = CH.renderPostCard(previewPost, { categoryName });
  }

  function resetPostForm() {
    postForm.reset();
    CH.applyFieldErrors(postForm, {});
    currentImageValue = "";
    postImagePreview.hidden = true;
    postImagePreview.src = "";
    removePostImageButton.hidden = true;
  }

  CH.openNewPostForm = function openNewPostForm(defaultCategoryId) {
    resetPostForm();
    postForm.elements.postId.value = "";
    if (defaultCategoryId) postCategorySelect.value = defaultCategoryId;
    postFormTitle.textContent = "New Post";
    postFormSubmitButton.textContent = "Publish Post";
    updatePreview();
    CH.openModal(postFormDialog);
  };

  CH.openEditPostForm = function openEditPostForm(post) {
    resetPostForm();
    postForm.elements.postId.value = post.postId;
    postCategorySelect.value = post.categoryId;
    postForm.elements.title.value = post.title;
    postForm.elements.shortDescription.value = post.shortDescription;
    postForm.elements.fullDescription.value = post.fullDescription;
    postForm.elements.postDate.value = (post.postDate || "").slice(0, 10);
    currentImageValue = post.image || "";
    if (currentImageValue) {
      postImagePreview.src = currentImageValue;
      postImagePreview.hidden = false;
      removePostImageButton.hidden = false;
    }
    postFormTitle.textContent = "Edit Post";
    postFormSubmitButton.textContent = "Save Changes";
    updatePreview();
    CH.openModal(postFormDialog);
  };

  postImageInput.addEventListener("change", async () => {
    const file = postImageInput.files[0];
    if (!file) return;
    currentImageValue = await CH.readFileAsDataUrl(file);
    postImagePreview.src = currentImageValue;
    postImagePreview.hidden = false;
    removePostImageButton.hidden = false;
    updatePreview();
  });

  removePostImageButton.addEventListener("click", () => {
    currentImageValue = "";
    postImageInput.value = "";
    postImagePreview.hidden = true;
    postImagePreview.src = "";
    removePostImageButton.hidden = true;
    updatePreview();
  });

  postForm.addEventListener("input", updatePreview);
  postCategorySelect.addEventListener("change", updatePreview);

  postForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formValues = {
      postId: postForm.elements.postId.value,
      categoryId: postCategorySelect.value,
      title: postForm.elements.title.value.trim(),
      shortDescription: postForm.elements.shortDescription.value.trim(),
      fullDescription: postForm.elements.fullDescription.value.trim(),
      postDate: postForm.elements.postDate.value,
      image: currentImageValue,
    };

    const errors = CH.validatePostForm(formValues);
    CH.applyFieldErrors(postForm, errors);
    if (CH.hasErrors(errors)) return;

    const isEditing = Boolean(formValues.postId);
    postFormSubmitButton.disabled = true;
    postFormSubmitButton.textContent = "Saving…";

    try {
      if (isEditing) {
        await CH.postService.update(formValues.postId, { ...formValues, createdByRole: CREATOR_ROLE });
        CH.showToast("Post updated successfully.");
      } else {
        await CH.postService.create({ ...formValues, createdByRole: CREATOR_ROLE });
        CH.showToast("Post published successfully.");
      }
      CH.closeModal(postFormDialog);
      await loadAllPosts();
      window.dispatchEvent(new CustomEvent("posts:changed"));
    } catch (error) {
      CH.showToast(error.message, "error");
    } finally {
      postFormSubmitButton.disabled = false;
      postFormSubmitButton.textContent = isEditing ? "Save Changes" : "Publish Post";
    }
  });

  // ---------- Grid interactions ----------

  allPostsGrid.addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-post]");
    const deleteButton = event.target.closest("[data-delete-post]");
    const card = event.target.closest("[data-post-id]");

    if (editButton) {
      const post = allPosts.find((item) => item.postId === editButton.dataset.editPost);
      if (post) CH.openEditPostForm(post);
      return;
    }

    if (deleteButton) {
      const post = allPosts.find((item) => item.postId === deleteButton.dataset.deletePost);
      if (!post) return;
      const confirmed = await CH.confirmAction({
        title: "Delete this post?",
        message: `"${post.title}" will be permanently deleted.`,
      });
      if (!confirmed) return;
      try {
        await CH.postService.remove(post.postId);
        CH.showToast("Post deleted successfully.");
        await loadAllPosts();
        window.dispatchEvent(new CustomEvent("posts:changed"));
      } catch (error) {
        CH.showToast(error.message, "error");
      }
      return;
    }

    if (card) {
      const post = allPosts.find((item) => item.postId === card.dataset.postId);
      if (post) CH.openEditPostForm(post);
    }
  });

  allPostsGrid.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest("[data-post-id]");
    if (card && event.target === card) {
      event.preventDefault();
      const post = allPosts.find((item) => item.postId === card.dataset.postId);
      if (post) CH.openEditPostForm(post);
    }
  });

  newPostButton.addEventListener("click", () => CH.openNewPostForm());

  window.addEventListener("categories:changed", loadCategoriesForSelect);
  window.addEventListener("hashchange", () => {
    if (window.location.hash === "#posts") loadAllPosts();
  });

  loadAllPosts();
})();
