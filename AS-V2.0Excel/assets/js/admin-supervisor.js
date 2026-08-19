/**
 * Admin "Supervisor" section: create/edit the single post assigned to the Supervisor, or
 * unassign it entirely.
 *
 * Plain classic script, not an ES module - see utils.js for why. Wrapped in an IIFE so its
 * private state doesn't leak into the shared global scope.
 */
window.CH = window.CH || {};

(function () {
  const supervisorPostForm = document.getElementById("supervisorPostForm");
  const supervisorPostCategorySelect = document.getElementById("supervisorPostCategory");
  const supervisorPostImageInput = document.getElementById("supervisorPostImage");
  const supervisorPostImagePreview = document.getElementById("supervisorPostImagePreview");
  const removeSupervisorPostImageButton = document.getElementById("removeSupervisorPostImageButton");
  const supervisorPostPreviewContent = document.getElementById("supervisorPostPreviewContent");
  const supervisorPostSubmitButton = document.getElementById("supervisorPostSubmitButton");
  const unassignSupervisorButton = document.getElementById("unassignSupervisorButton");

  let categories = [];
  let currentImageValue = "";

  function populateCategorySelect() {
    const options = categories
      .map((category) => `<option value="${CH.escapeHtml(category.categoryId)}">${CH.escapeHtml(category.categoryName)}</option>`)
      .join("");
    supervisorPostCategorySelect.innerHTML = `<option value="">No category</option>${options}`;
  }

  function updatePreview() {
    const categoryName = categories.find((c) => c.categoryId === supervisorPostCategorySelect.value)?.categoryName ?? "Uncategorized";
    const previewPost = {
      title: supervisorPostForm.elements.title.value || "Untitled post",
      shortDescription: supervisorPostForm.elements.shortDescription.value,
      fullDescription: supervisorPostForm.elements.fullDescription.value || "Nothing written yet.",
      image: currentImageValue,
      postDate: supervisorPostForm.elements.postDate.value,
    };
    supervisorPostPreviewContent.innerHTML = CH.renderPostCard(previewPost, { categoryName });
  }

  function resetForm() {
    supervisorPostForm.reset();
    CH.applyFieldErrors(supervisorPostForm, {});
    supervisorPostForm.elements.postId.value = "";
    currentImageValue = "";
    supervisorPostImagePreview.hidden = true;
    supervisorPostImagePreview.src = "";
    removeSupervisorPostImageButton.hidden = true;
    supervisorPostSubmitButton.textContent = "Create & Assign";
    unassignSupervisorButton.hidden = true;
    updatePreview();
  }

  function fillForm(post) {
    supervisorPostForm.elements.postId.value = post.postId;
    supervisorPostCategorySelect.value = post.categoryId;
    supervisorPostForm.elements.title.value = post.title;
    supervisorPostForm.elements.shortDescription.value = post.shortDescription;
    supervisorPostForm.elements.fullDescription.value = post.fullDescription;
    supervisorPostForm.elements.postDate.value = (post.postDate || "").slice(0, 10);
    currentImageValue = post.image || "";
    supervisorPostImagePreview.src = currentImageValue;
    supervisorPostImagePreview.hidden = !currentImageValue;
    removeSupervisorPostImageButton.hidden = !currentImageValue;
    CH.applyFieldErrors(supervisorPostForm, {});
    supervisorPostSubmitButton.textContent = "Save Changes";
    unassignSupervisorButton.hidden = false;
    updatePreview();
  }

  supervisorPostImageInput.addEventListener("change", async () => {
    const file = supervisorPostImageInput.files[0];
    if (!file) return;
    currentImageValue = await CH.readFileAsDataUrl(file);
    supervisorPostImagePreview.src = currentImageValue;
    supervisorPostImagePreview.hidden = false;
    removeSupervisorPostImageButton.hidden = false;
    updatePreview();
  });

  removeSupervisorPostImageButton.addEventListener("click", () => {
    currentImageValue = "";
    supervisorPostImageInput.value = "";
    supervisorPostImagePreview.hidden = true;
    supervisorPostImagePreview.src = "";
    removeSupervisorPostImageButton.hidden = true;
    updatePreview();
  });

  supervisorPostForm.addEventListener("input", updatePreview);
  supervisorPostCategorySelect.addEventListener("change", updatePreview);

  supervisorPostForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formValues = {
      categoryId: supervisorPostCategorySelect.value,
      title: supervisorPostForm.elements.title.value.trim(),
      shortDescription: supervisorPostForm.elements.shortDescription.value.trim(),
      fullDescription: supervisorPostForm.elements.fullDescription.value.trim(),
      postDate: supervisorPostForm.elements.postDate.value,
      image: currentImageValue,
    };

    const errors = CH.validatePostForm(formValues);
    CH.applyFieldErrors(supervisorPostForm, errors);
    if (CH.hasErrors(errors)) return;

    const postId = supervisorPostForm.elements.postId.value;
    const isEditing = Boolean(postId);
    supervisorPostSubmitButton.disabled = true;
    supervisorPostSubmitButton.textContent = isEditing ? "Saving…" : "Creating…";

    try {
      if (isEditing) {
        await CH.postService.update(postId, formValues);
        CH.showToast("Post updated successfully.");
      } else {
        const created = await CH.postService.create({ ...formValues, createdByRole: "Admin" });
        await CH.postService.assignToSupervisor(created.postId);
        CH.showToast("Post created and assigned to the Supervisor.");
      }
      window.dispatchEvent(new CustomEvent("posts:changed"));
      await loadData(); // repopulates the form (via fillForm/resetForm) with the correct button label for the new state
    } catch (error) {
      CH.showToast(error.message, "error");
      supervisorPostSubmitButton.textContent = isEditing ? "Save Changes" : "Create & Assign";
    } finally {
      supervisorPostSubmitButton.disabled = false;
    }
  });

  async function handleUnassign() {
    const confirmed = await CH.confirmAction({
      title: "Unassign this post?",
      message: "The Supervisor will have nothing to see until you create or assign a new one.",
      confirmLabel: "Unassign",
    });
    if (!confirmed) return;
    try {
      await CH.postService.unassignSupervisor();
      CH.showToast("Supervisor assignment cleared.");
      window.dispatchEvent(new CustomEvent("posts:changed"));
      await loadData();
    } catch (error) {
      CH.showToast(error.message, "error");
    }
  }

  unassignSupervisorButton.addEventListener("click", handleUnassign);

  async function loadData() {
    try {
      const [categoriesResult, assignedResult] = await Promise.all([CH.categoryService.getAll(), CH.postService.getAssigned()]);
      categories = categoriesResult;
      populateCategorySelect();
      if (assignedResult) {
        fillForm(assignedResult);
      } else {
        resetForm();
      }
    } catch (error) {
      CH.showToast(error.message, "error");
    }
  }

  window.addEventListener("posts:changed", loadData);
  window.addEventListener("categories:changed", loadData);
  window.addEventListener("hashchange", () => {
    if (window.location.hash === "#supervisor") loadData();
  });

  loadData();
})();
