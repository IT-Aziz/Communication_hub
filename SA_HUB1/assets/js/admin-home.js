/**
 * Admin "Home" section: live public-site preview (hero slider + category grid) plus quick
 * "New Post"/"New Category" shortcuts.
 *
 * Plain classic script, not an ES module - see utils.js for why. Wrapped in an IIFE so its
 * private state doesn't leak into the shared global scope. Uses CH.openNewPostForm (admin-posts.js)
 * and CH.openNewCategoryForm (admin-categories.js), so must load after both.
 */
window.CH = window.CH || {};

(function () {
  const homeHeroSliderContainer = document.getElementById("homeHeroSliderContainer");
  const homeCategoriesGrid = document.getElementById("homeCategoriesGrid");
  const homeCategoriesEmptyState = document.getElementById("homeCategoriesEmptyState");
  const homeNewPostButton = document.getElementById("homeNewPostButton");
  const homeNewCategoryButton = document.getElementById("homeNewCategoryButton");

  let categories = [];
  let publicPosts = []; // what a visitor actually sees - excludes the post assigned to the Supervisor
  const publicUserPageHref = "Userpage.html";

  function loadingMarkup(message) {
    return `<div class="loading-state"><span class="spinner" aria-hidden="true"></span><span>${message}</span></div>`;
  }

  function renderCategoriesGrid() {
    if (categories.length === 0) {
      homeCategoriesGrid.innerHTML = "";
      homeCategoriesEmptyState.hidden = false;
      return;
    }
    homeCategoriesEmptyState.hidden = true;
    homeCategoriesGrid.innerHTML = categories
      .map((category, index) =>
        CH.renderCategoryCard(category, {
          positionIndex: index,
          postCount: publicPosts.filter((post) => post.categoryId === category.categoryId).length,
        }),
      )
      .join("");
  }

  function resolveLinkedPostMeta(postId) {
    const post = publicPosts.find((item) => item.postId === postId);
    if (!post) return null;
    const category = categories.find((item) => item.categoryId === post.categoryId);
    return { categoryName: category?.categoryName ?? "", publishDate: post.postDate };
  }

  /** Mirrors user-page.js: a slide only links out if its post is actually public. */
  function resolvePostHref(postId) {
    const isPublic = publicPosts.some((item) => item.postId === postId);
    return isPublic ? `${publicUserPageHref}?post=${encodeURIComponent(postId)}` : null;
  }

  async function loadHome() {
    homeCategoriesGrid.innerHTML = loadingMarkup("Loading…");
    homeCategoriesEmptyState.hidden = true;
    try {
      const [categoriesResult, postsResult, activeSlides] = await Promise.all([
        CH.categoryService.getAll(),
        CH.postService.getAll(),
        CH.heroSlideService.getActive(),
      ]);
      categories = categoriesResult;
      publicPosts = postsResult.filter((post) => post.assignedToSupervisor !== "true");
      renderCategoriesGrid();
      CH.renderHeroSlider(homeHeroSliderContainer, activeSlides, {
        resolvePostHref,
        resolveLinkedPostMeta,
        browseAllHref: publicUserPageHref,
      });
    } catch (error) {
      homeCategoriesGrid.innerHTML = "";
      homeCategoriesEmptyState.hidden = false;
      homeCategoriesEmptyState.textContent = error.message;
    }
  }

  homeCategoriesGrid.addEventListener("click", (event) => {
    const card = event.target.closest("[data-category-id]");
    if (card) window.location.href = `${publicUserPageHref}?category=${encodeURIComponent(card.dataset.categoryId)}`;
  });

  homeNewPostButton.addEventListener("click", () => CH.openNewPostForm());
  homeNewCategoryButton.addEventListener("click", () => CH.openNewCategoryForm());

  window.addEventListener("posts:changed", loadHome);
  window.addEventListener("categories:changed", loadHome);
  window.addEventListener("hashchange", () => {
    if (window.location.hash === "#home" || window.location.hash === "") loadHome();
  });

  loadHome();
})();
