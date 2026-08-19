/**
 * Admin "Hero Slider" section: ordered list of slides (reorder/toggle/edit/delete) + a live
 * preview of the carousel, plus the add/edit slide form.
 *
 * Plain classic script, not an ES module - see utils.js for why. Wrapped in an IIFE so its
 * private state doesn't leak into the shared global scope.
 */
window.CH = window.CH || {};

(function () {
  const slidesList = document.getElementById("slidesList");
  const slidesEmptyState = document.getElementById("slidesEmptyState");
  const newSlideButton = document.getElementById("newSlideButton");
  const sliderPreviewContainer = document.getElementById("sliderPreviewContainer");
  const sliderPreviewEmptyState = document.getElementById("sliderPreviewEmptyState");

  const slideFormDialog = document.getElementById("slideFormDialog");
  const slideForm = document.getElementById("slideForm");
  const slideFormTitle = document.getElementById("slideFormTitle");
  const slideFormSubmitButton = document.getElementById("slideFormSubmitButton");
  const slideLinkedPostSelect = document.getElementById("slideLinkedPost");
  const slideImageInput = document.getElementById("slideImage");
  const slideImagePreview = document.getElementById("slideImagePreview");
  const removeSlideImageButton = document.getElementById("removeSlideImageButton");
  const slidePreviewContent = document.getElementById("slidePreviewContent");
  const slideActiveInput = document.getElementById("slideActive");

  let slides = [];
  let posts = [];
  let categories = [];
  let currentImageValue = "";
  const publicUserPageHref = "Userpage.html";

  CH.setupDialogDismissal(slideFormDialog);

  function loadingMarkup(message) {
    return `<div class="loading-state"><span class="spinner" aria-hidden="true"></span><span>${message}</span></div>`;
  }

  function isActiveValue(slide) {
    return slide.isActive === "true" || slide.isActive === "TRUE";
  }

  /** Hero slides link to a post by ID; Userpage.html reads ?post= on load to jump straight to it. */
  function resolvePostHref(postId) {
    return `${publicUserPageHref}?post=${encodeURIComponent(postId)}`;
  }

  /** Looks up the category name and publish date for a linked post, for the floating preview card. */
  function resolveLinkedPostMeta(postId) {
    const post = posts.find((item) => item.postId === postId);
    if (!post) return null;
    const category = categories.find((item) => item.categoryId === post.categoryId);
    return { categoryName: category?.categoryName ?? "", publishDate: post.postDate };
  }

  function populateLinkedPostSelect() {
    // The post assigned to the Supervisor is private, so it can't be picked as a hero slide link.
    const linkablePosts = posts.filter((post) => post.assignedToSupervisor !== "true");
    const options = linkablePosts
      .map((post) => `<option value="${CH.escapeHtml(post.postId)}">${CH.escapeHtml(post.title)}</option>`)
      .join("");
    slideLinkedPostSelect.innerHTML = `<option value="">No link</option>${options}`;
  }

  async function loadSlides() {
    slidesList.innerHTML = loadingMarkup("Loading hero slider…");
    slidesEmptyState.hidden = true;
    try {
      const [slidesResult, postsResult, categoriesResult] = await Promise.all([
        CH.heroSlideService.getAll(),
        CH.postService.getAll(),
        CH.categoryService.getAll(),
      ]);
      slides = slidesResult;
      posts = postsResult;
      categories = categoriesResult;
      populateLinkedPostSelect();
      renderSlidesList();
      renderLivePreview();
    } catch (error) {
      slidesList.innerHTML = "";
      slidesEmptyState.hidden = false;
      slidesEmptyState.textContent = error.message;
    }
  }

  function renderSlidesList() {
    if (slides.length === 0) {
      slidesList.innerHTML = "";
      slidesEmptyState.hidden = false;
      return;
    }
    slidesEmptyState.hidden = true;
    slidesList.innerHTML = slides
      .map((slide, index) => {
        const linkedPost = posts.find((post) => post.postId === slide.linkedPostId);
        const thumbMarkup = slide.image
          ? `<img class="slide-row__thumb" src="${CH.escapeHtml(slide.image)}" alt="">`
          : `<span class="slide-row__thumb" aria-hidden="true"></span>`;

        return `
          <div class="slide-row" data-slide-id="${CH.escapeHtml(slide.sliderId)}">
            <div class="slide-row__reorder">
              <button type="button" class="icon-button" data-move-up="${CH.escapeHtml(slide.sliderId)}" aria-label="Move up" ${index === 0 ? "disabled" : ""}>${CH.icon("arrowUp", { size: 16 })}</button>
              <button type="button" class="icon-button" data-move-down="${CH.escapeHtml(slide.sliderId)}" aria-label="Move down" ${index === slides.length - 1 ? "disabled" : ""}>${CH.icon("arrowDown", { size: 16 })}</button>
            </div>
            ${thumbMarkup}
            <div class="slide-row__info">
              <p class="slide-row__title">${CH.escapeHtml(slide.title)}</p>
              <p class="slide-row__meta">${linkedPost ? `Linked to "${CH.escapeHtml(linkedPost.title)}"` : "No linked post"}</p>
            </div>
            <div class="slide-row__actions">
              <label class="switch">
                <input type="checkbox" data-toggle-active="${CH.escapeHtml(slide.sliderId)}" ${isActiveValue(slide) ? "checked" : ""} aria-label="Toggle slide active">
                <span class="switch__track"></span>
                <span class="switch__thumb"></span>
              </label>
              <button type="button" class="icon-button" data-edit-slide="${CH.escapeHtml(slide.sliderId)}" aria-label="Edit slide">${CH.icon("pencil", { size: 16 })}</button>
              <button type="button" class="icon-button" data-delete-slide="${CH.escapeHtml(slide.sliderId)}" aria-label="Delete slide">${CH.icon("trash", { size: 16 })}</button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderLivePreview() {
    const activeSlides = slides.filter(isActiveValue);
    if (activeSlides.length === 0) {
      sliderPreviewContainer.hidden = true;
      sliderPreviewEmptyState.hidden = false;
      return;
    }
    sliderPreviewEmptyState.hidden = true;
    CH.renderHeroSlider(sliderPreviewContainer, activeSlides, {
      resolvePostHref,
      resolveLinkedPostMeta,
      browseAllHref: publicUserPageHref,
    });
  }

  async function moveSlide(sliderId, direction) {
    const index = slides.findIndex((slide) => slide.sliderId === sliderId);
    const swapIndex = index + direction;
    if (index === -1 || swapIndex < 0 || swapIndex >= slides.length) return;
    const reordered = [...slides];
    [reordered[index], reordered[swapIndex]] = [reordered[swapIndex], reordered[index]];
    try {
      await CH.heroSlideService.reorder(reordered.map((slide) => slide.sliderId));
      await loadSlides();
      window.dispatchEvent(new CustomEvent("heroslides:changed"));
    } catch (error) {
      CH.showToast(error.message, "error");
    }
  }

  slidesList.addEventListener("click", async (event) => {
    const moveUpButton = event.target.closest("[data-move-up]");
    const moveDownButton = event.target.closest("[data-move-down]");
    const editButton = event.target.closest("[data-edit-slide]");
    const deleteButton = event.target.closest("[data-delete-slide]");

    if (moveUpButton && !moveUpButton.disabled) {
      await moveSlide(moveUpButton.dataset.moveUp, -1);
      return;
    }
    if (moveDownButton && !moveDownButton.disabled) {
      await moveSlide(moveDownButton.dataset.moveDown, 1);
      return;
    }
    if (editButton) {
      const slide = slides.find((item) => item.sliderId === editButton.dataset.editSlide);
      if (slide) openEditSlideForm(slide);
      return;
    }
    if (deleteButton) {
      const slide = slides.find((item) => item.sliderId === deleteButton.dataset.deleteSlide);
      if (!slide) return;
      const confirmed = await CH.confirmAction({
        title: "Remove this slide?",
        message: `"${slide.title}" will be removed from the hero slider.`,
      });
      if (!confirmed) return;
      try {
        await CH.heroSlideService.remove(slide.sliderId);
        CH.showToast("Slide removed from the hero slider.");
        await loadSlides();
        window.dispatchEvent(new CustomEvent("heroslides:changed"));
      } catch (error) {
        CH.showToast(error.message, "error");
      }
    }
  });

  slidesList.addEventListener("change", async (event) => {
    const toggle = event.target.closest("[data-toggle-active]");
    if (!toggle) return;
    try {
      await CH.heroSlideService.toggleActive(toggle.dataset.toggleActive, toggle.checked);
      await loadSlides();
      window.dispatchEvent(new CustomEvent("heroslides:changed"));
    } catch (error) {
      CH.showToast(error.message, "error");
      toggle.checked = !toggle.checked;
    }
  });

  // ---------- New / edit slide form ----------

  function updateSlideFormPreview() {
    const previewSlide = {
      sliderId: "preview",
      title: slideForm.elements.title.value || "Slide title",
      description: slideForm.elements.description.value || "A short description of this announcement.",
      image: currentImageValue,
      linkedPostId: slideLinkedPostSelect.value,
    };
    CH.renderHeroSlider(slidePreviewContent, [previewSlide], { resolveLinkedPostMeta, browseAllHref: publicUserPageHref });
  }

  function resetSlideForm() {
    slideForm.reset();
    CH.applyFieldErrors(slideForm, {});
    currentImageValue = "";
    slideImagePreview.hidden = true;
    slideImagePreview.src = "";
    removeSlideImageButton.hidden = true;
    slideActiveInput.checked = true;
  }

  function openNewSlideForm() {
    resetSlideForm();
    slideForm.elements.sliderId.value = "";
    slideFormTitle.textContent = "Add Slide";
    slideFormSubmitButton.textContent = "Add Slide";
    updateSlideFormPreview();
    CH.openModal(slideFormDialog);
  }

  function openEditSlideForm(slide) {
    resetSlideForm();
    slideForm.elements.sliderId.value = slide.sliderId;
    slideForm.elements.title.value = slide.title;
    slideForm.elements.description.value = slide.description;
    slideLinkedPostSelect.value = slide.linkedPostId || "";
    currentImageValue = slide.image || "";
    if (currentImageValue) {
      slideImagePreview.src = currentImageValue;
      slideImagePreview.hidden = false;
      removeSlideImageButton.hidden = false;
    }
    slideActiveInput.checked = isActiveValue(slide);
    slideFormTitle.textContent = "Edit Slide";
    slideFormSubmitButton.textContent = "Save Changes";
    updateSlideFormPreview();
    CH.openModal(slideFormDialog);
  }

  slideImageInput.addEventListener("change", async () => {
    const file = slideImageInput.files[0];
    if (!file) return;
    currentImageValue = await CH.readFileAsDataUrl(file);
    slideImagePreview.src = currentImageValue;
    slideImagePreview.hidden = false;
    removeSlideImageButton.hidden = false;
    updateSlideFormPreview();
  });

  removeSlideImageButton.addEventListener("click", () => {
    currentImageValue = "";
    slideImageInput.value = "";
    slideImagePreview.hidden = true;
    slideImagePreview.src = "";
    removeSlideImageButton.hidden = true;
    updateSlideFormPreview();
  });

  /**
   * Picking a post is meant to be enough on its own - fill the slide's title, description, and
   * image straight from that post so there's nothing left to retype. Choosing "No link" leaves
   * whatever's already typed alone (it isn't a "clear the form" action).
   */
  slideLinkedPostSelect.addEventListener("change", () => {
    const post = posts.find((item) => item.postId === slideLinkedPostSelect.value);
    if (!post) return;

    slideForm.elements.title.value = post.title;
    slideForm.elements.description.value = post.shortDescription || post.fullDescription;
    currentImageValue = post.image || "";
    slideImagePreview.src = currentImageValue;
    slideImagePreview.hidden = !currentImageValue;
    removeSlideImageButton.hidden = !currentImageValue;
    CH.applyFieldErrors(slideForm, {});
    updateSlideFormPreview();
  });

  slideForm.addEventListener("input", updateSlideFormPreview);

  slideForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formValues = {
      sliderId: slideForm.elements.sliderId.value,
      title: slideForm.elements.title.value.trim(),
      description: slideForm.elements.description.value.trim(),
      linkedPostId: slideLinkedPostSelect.value,
      image: currentImageValue,
      isActive: slideActiveInput.checked,
    };

    const errors = CH.validateHeroSlideForm(formValues);
    CH.applyFieldErrors(slideForm, errors);
    if (CH.hasErrors(errors)) return;

    const isEditing = Boolean(formValues.sliderId);
    slideFormSubmitButton.disabled = true;
    slideFormSubmitButton.textContent = "Saving…";

    try {
      if (isEditing) {
        await CH.heroSlideService.update(formValues.sliderId, formValues);
        CH.showToast("Slide updated successfully.");
      } else {
        await CH.heroSlideService.create(formValues);
        CH.showToast("Slide added to the hero slider.");
      }
      CH.closeModal(slideFormDialog);
      await loadSlides();
      window.dispatchEvent(new CustomEvent("heroslides:changed"));
    } catch (error) {
      CH.showToast(error.message, "error");
    } finally {
      slideFormSubmitButton.disabled = false;
      slideFormSubmitButton.textContent = isEditing ? "Save Changes" : "Add Slide";
    }
  });

  newSlideButton.addEventListener("click", openNewSlideForm);

  window.addEventListener("posts:changed", () => {
    CH.postService.getAll().then((result) => {
      posts = result;
      populateLinkedPostSelect();
    });
  });

  window.addEventListener("hashchange", () => {
    if (window.location.hash === "#hero-slider") loadSlides();
  });

  loadSlides();
})();
