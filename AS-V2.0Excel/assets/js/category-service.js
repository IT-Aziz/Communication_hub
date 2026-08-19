/**
 * Category card rendering + the categoryService wrapper around sp-data.js.
 *
 * Plain classic script, not an ES module - see utils.js for why. Attaches to window.CH.
 */
window.CH = window.CH || {};

CH.categoryService = {
  getAll: () => CH.getAllCategories(),
  create: (categoryData) => CH.createCategory(categoryData),
  update: (categoryId, categoryData) => CH.updateCategoryById(categoryId, categoryData),
  remove: (categoryId) => CH.deleteCategoryById(categoryId),
  getPosts: (categoryId) => CH.getPostsByCategoryId(categoryId),
};

/** Icon choices offered when creating/editing a category - picked instead of the initial-letter default. */
CH.CATEGORY_ICON_OPTIONS = [
  "briefcase",
  "users",
  "shield",
  "monitor",
  "building",
  "calendar",
  "bell",
  "book",
  "heart",
  "megaphone",
  "globe",
  "wrench",
];

function renderBanner(category, positionIndex) {
  if (category.image) {
    return {
      className: "category-card__banner",
      content: `<img class="category-card__banner-image" src="${CH.escapeHtml(category.image)}" alt="">`,
    };
  }
  const badgeContent = category.icon
    ? CH.icon(category.icon, { size: 22 })
    : CH.escapeHtml(CH.getInitial(category.categoryName));
  return {
    className: `category-card__banner category-card__banner--placeholder ${CH.getGradientClassName(positionIndex)}`,
    content: `<span class="category-card__icon">${badgeContent}</span>`,
  };
}

/**
 * Builds one category card. On the User and Supervisor pages the whole card is a real <button>
 * (nothing else clickable lives inside it). On the Admin page it also carries Edit/Delete
 * buttons, so it renders as a div with role="button" instead - a <button> can't contain another.
 */
CH.renderCategoryCard = function renderCategoryCard(category, { positionIndex, postCount, showActions = false }) {
  const banner = renderBanner(category, positionIndex);
  const postCountLabel = `${postCount} post${postCount === 1 ? "" : "s"}`;

  const cardBody = `
    <div class="${banner.className}">${banner.content}</div>
    <div class="category-card__body">
      <h3 class="category-card__title">${CH.escapeHtml(category.categoryName)}</h3>
      <p class="category-card__description">${CH.escapeHtml(category.description)}</p>
      <div class="category-card__footer">
        <span class="category-card__count">${postCountLabel}</span>
        <span class="category-card__arrow" aria-hidden="true">&rarr;</span>
      </div>
    </div>
  `;

  if (!showActions) {
    return `
      <button
        type="button"
        class="category-card"
        data-category-id="${CH.escapeHtml(category.categoryId)}"
        aria-label="Open ${CH.escapeHtml(category.categoryName)}"
      >
        ${cardBody}
      </button>
    `;
  }

  return `
    <div
      class="category-card"
      data-category-id="${CH.escapeHtml(category.categoryId)}"
      role="button"
      tabindex="0"
      aria-label="Open ${CH.escapeHtml(category.categoryName)}"
    >
      ${cardBody}
      <div class="category-card__admin-actions">
        <button type="button" class="btn btn--secondary btn--small" data-edit-category="${CH.escapeHtml(category.categoryId)}">Edit</button>
        <button type="button" class="btn btn--danger btn--small" data-delete-category="${CH.escapeHtml(category.categoryId)}">Delete</button>
      </div>
    </div>
  `;
};
