/**
 * Post card/detail rendering + the postService wrapper around sp-data.js.
 *
 * Plain classic script, not an ES module - see utils.js for why. Attaches to window.CH.
 */
window.CH = window.CH || {};

CH.postService = {
  getAll: () => CH.getAllPosts(),
  getAssigned: () => CH.getAssignedSupervisorPost(),
  create: (postData) => CH.createPost(postData),
  update: (postId, postData) => CH.updatePostById(postId, postData),
  remove: (postId) => CH.deletePostById(postId),
  assignToSupervisor: (postId) => CH.setAssignedSupervisorPost(postId),
  unassignSupervisor: () => CH.setAssignedSupervisorPost(null),
};

/**
 * Builds one post card. Renders as a clean text-only card when there's no image - no broken
 * image icon and no empty placeholder box ever get inserted into the markup.
 */
CH.renderPostCard = function renderPostCard(post, { categoryName, showActions = false }) {
  const imageMarkup = post.image ? `<img class="post-card__image" src="${CH.escapeHtml(post.image)}" alt="">` : "";
  const summary = post.shortDescription || post.fullDescription;

  const actionsMarkup = showActions
    ? `
      <div class="post-card__actions">
        <button type="button" class="btn btn--secondary btn--small" data-edit-post="${CH.escapeHtml(post.postId)}">Edit</button>
        <button type="button" class="btn btn--danger btn--small" data-delete-post="${CH.escapeHtml(post.postId)}">Delete</button>
      </div>
    `
    : "";

  return `
    <div
      class="post-card"
      data-post-id="${CH.escapeHtml(post.postId)}"
      role="button"
      tabindex="0"
      aria-label="View ${CH.escapeHtml(post.title)}"
    >
      ${imageMarkup}
      <div class="post-card__body">
        <h3 class="post-card__title">${CH.escapeHtml(post.title)}</h3>
        <p class="post-card__description">${CH.escapeHtml(summary)}</p>
        <div class="post-card__meta">
          <span class="badge">${CH.escapeHtml(categoryName)}</span>
          <span>${CH.formatDate(post.postDate)}</span>
        </div>
        ${actionsMarkup}
      </div>
    </div>
  `;
};

/** Renders the full post detail view (title, meta, image if present, full content). */
CH.renderPostDetail = function renderPostDetail(post, { categoryName }) {
  const imageMarkup = post.image
    ? `<img class="post-detail__image" src="${CH.escapeHtml(post.image)}" alt="">`
    : "";

  return `
    ${imageMarkup}
    <div class="post-detail__meta">
      <span class="badge">${CH.escapeHtml(categoryName)}</span>
      <span class="text-muted">${CH.formatDate(post.postDate)}</span>
    </div>
    <h1>${CH.escapeHtml(post.title)}</h1>
    <p class="post-detail__content">${CH.escapeHtml(post.fullDescription)}</p>
  `;
};
