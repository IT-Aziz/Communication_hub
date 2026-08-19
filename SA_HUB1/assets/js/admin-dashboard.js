/**
 * Admin "Dashboard" section: summary stat cards + recent posts/categories panels.
 *
 * Plain classic script, not an ES module - see utils.js for why. Wrapped in an IIFE so its
 * private state doesn't leak into the shared global scope.
 */
window.CH = window.CH || {};

(function () {
  const statsContainer = document.getElementById("dashboardStats");
  const recentPostsList = document.getElementById("recentPostsList");
  const recentCategoriesList = document.getElementById("recentCategoriesList");

  function statCardMarkup(iconName, value, label) {
    return `
      <div class="stat-card">
        <span class="stat-card__icon stat-card__icon--accent">${CH.icon(iconName, { size: 22 })}</span>
        <div class="stat-card__body">
          <p class="stat-card__value">${value}</p>
          <p class="stat-card__label">${CH.escapeHtml(label)}</p>
        </div>
      </div>
    `;
  }

  function emptyPanelMarkup(message) {
    return `<p class="text-muted">${CH.escapeHtml(message)}</p>`;
  }

  function renderRecentPosts(posts, categoriesById) {
    const recent = [...posts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
    if (recent.length === 0) {
      recentPostsList.innerHTML = emptyPanelMarkup("No posts yet.");
      return;
    }
    recentPostsList.innerHTML = recent
      .map(
        (post) => `
        <div class="dashboard-panel__item">
          <span class="dashboard-panel__item-title">${CH.escapeHtml(post.title)}</span>
          <span class="dashboard-panel__item-meta">${CH.escapeHtml(categoriesById[post.categoryId]?.categoryName ?? "")}</span>
        </div>
      `,
      )
      .join("");
  }

  function renderRecentCategories(categories) {
    const recent = [...categories].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
    if (recent.length === 0) {
      recentCategoriesList.innerHTML = emptyPanelMarkup("No categories yet.");
      return;
    }
    recentCategoriesList.innerHTML = recent
      .map(
        (category) => `
        <div class="dashboard-panel__item">
          <span class="dashboard-panel__item-title">${CH.escapeHtml(category.categoryName)}</span>
          <span class="dashboard-panel__item-meta">${CH.formatDate(category.createdAt)}</span>
        </div>
      `,
      )
      .join("");
  }

  async function loadDashboard() {
    statsContainer.innerHTML = `<div class="loading-state"><span class="spinner" aria-hidden="true"></span><span>Loading dashboard…</span></div>`;
    try {
      const [categories, posts, slides] = await Promise.all([
        CH.categoryService.getAll(),
        CH.postService.getAll(),
        CH.heroSlideService.getAll(),
      ]);

      statsContainer.innerHTML = [
        statCardMarkup("folder", categories.length, "Total categories"),
        statCardMarkup("fileText", posts.length, "Total posts"),
        statCardMarkup("image", slides.length, "Hero slider items"),
      ].join("");

      const categoriesById = Object.fromEntries(categories.map((category) => [category.categoryId, category]));
      renderRecentPosts(posts, categoriesById);
      renderRecentCategories(categories);
    } catch (error) {
      statsContainer.innerHTML = `<p class="empty-state">${CH.escapeHtml(error.message)}</p>`;
    }
  }

  function isDashboardHash() {
    return window.location.hash.replace("#", "") === "dashboard";
  }

  window.addEventListener("hashchange", () => {
    if (isDashboardHash()) loadDashboard();
  });

  loadDashboard();
})();
