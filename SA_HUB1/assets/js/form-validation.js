/**
 * Client-side mirrors of the storage layer's validation rules, for instant feedback before
 * submitting. data-service.js re-validates everything independently - this module only improves
 * the experience.
 *
 * Plain classic script, not an ES module - see utils.js for why. Attaches to window.CH.
 */
window.CH = window.CH || {};

CH.validateCategoryForm = function validateCategoryForm({ categoryName, description }) {
  const errors = {};
  if (!categoryName || !categoryName.trim()) {
    errors.categoryName = "Category name is required.";
  }
  if (!description || !description.trim()) {
    errors.description = "Description is required.";
  }
  return errors;
};

CH.validatePostForm = function validatePostForm({ title, fullDescription, postDate }) {
  const errors = {};
  if (!title || !title.trim()) {
    errors.title = "Title is required.";
  }
  if (!fullDescription || !fullDescription.trim()) {
    errors.fullDescription = "Full description is required.";
  }
  if (postDate && Number.isNaN(Date.parse(postDate))) {
    errors.postDate = "Enter a valid date.";
  }
  return errors;
};

CH.validateHeroSlideForm = function validateHeroSlideForm({ title, description }) {
  const errors = {};
  if (!title || !title.trim()) {
    errors.title = "Title is required.";
  }
  if (!description || !description.trim()) {
    errors.description = "Short description is required.";
  }
  return errors;
};

CH.hasErrors = function hasErrors(errors) {
  return Object.keys(errors).length > 0;
};

/** Applies (or clears, when errors is {}) field-level error messages and styling on a form. */
CH.applyFieldErrors = function applyFieldErrors(formElement, errors) {
  formElement.querySelectorAll("[data-field-error]").forEach((errorElement) => {
    errorElement.textContent = "";
  });
  formElement.querySelectorAll(".form-field__input--invalid, .form-field__textarea--invalid").forEach((field) => {
    field.classList.remove("form-field__input--invalid", "form-field__textarea--invalid");
  });

  Object.entries(errors).forEach(([fieldName, message]) => {
    const field = formElement.querySelector(`[name="${fieldName}"]`);
    const errorElement = formElement.querySelector(`[data-field-error="${fieldName}"]`);
    if (field) {
      const invalidClass = field.tagName === "TEXTAREA" ? "form-field__textarea--invalid" : "form-field__input--invalid";
      field.classList.add(invalidClass);
    }
    if (errorElement) {
      errorElement.textContent = message;
    }
  });
};
