/**
 * Userpage.html controller: public categories grid -> category posts -> post detail, plus the
 * hero slider on the top-level categories view. Reads/writes ?category=/?post= in the URL so
 * links and back/forward work.
 *
 * Plain classic script, not an ES module - see utils.js for why. Wrapped in an IIFE so its
 * private state doesn't leak into the shared global scope.
 */
window.CH = window.CH || {};

(function () {
  const heroSliderContainer = document.getElementById("heroSliderContainer");
  const categoriesGrid = document.getElementById("categoriesGrid");
  const categoriesEmptyState = document.getElementById("categoriesEmptyState");
  const postsGrid = document.getElementById("postsGrid");
  const postsEmptyState = document.getElementById("postsEmptyState");
  const postsCategoryTitle = document.getElementById("postsCategoryTitle");
  const postsCategoryDescription = document.getElementById("postsCategoryDescription");
  const postDetailContent = document.getElementById("postDetailContent");
  const backToCategoriesButton = document.getElementById("backToCategoriesButton");
  const backToPostsButton = document.getElementById("backToPostsButton");

  const views = {
    categories: document.getElementById("categoriesView"),
    posts: document.getElementById("postsView"),
    postDetail: document.getElementById("postDetailView"),
  };

  let categories = [];
  let allPosts = [];
  let categoryPosts = [];
  let selectedCategory = null;
  let hasActiveHeroSlides = false;
  const userPageHref = "Userpage.html";

  /** The hero slider only ever shows on the top-level categories view - never while inside a category or a post. */
  function updateHeroSliderVisibility() {
    const isCategoriesView = views.categories.classList.contains("view--active");
    heroSliderContainer.hidden = !hasActiveHeroSlides || !isCategoriesView;
  }

  // A background refresh re-runs the same render path as a real navigation, and jumping the
  // reader back to the top of the page mid-sentence because an admin edited something elsewhere
  // would be worse than showing them slightly older text. Scrolling is therefore suppressed for
  // the duration of a sync-driven re-render only.
  let suppressScrollReset = false;

  function showView(viewName) {
    Object.entries(views).forEach(([name, element]) => {
      element.classList.toggle("view--active", name === viewName);
    });
    updateHeroSliderVisibility();
    if (!suppressScrollReset) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function loadingMarkup(message) {
    return `<div class="loading-state"><span class="spinner" aria-hidden="true"></span><span>${message}</span></div>`;
  }

  async function loadCategoriesView() {
    categoriesGrid.innerHTML = loadingMarkup("Loading categories…");
    categoriesEmptyState.hidden = true;
    try {
      const [categoriesResult, postsResult] = await Promise.all([CH.categoryService.getAll(), CH.postService.getAll()]);
      categories = categoriesResult;
      // The post assigned to the Supervisor is private - the public site never shows it.
      allPosts = postsResult.filter((post) => post.assignedToSupervisor !== "true");
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
        }),
      )
      .join("");
  }

  /** Renders a category's posts view. Pure render - callers decide whether the URL needs updating. */
  async function showCategoryPosts(category) {
    selectedCategory = category;
    postsCategoryTitle.textContent = category.categoryName;
    postsCategoryDescription.textContent = category.description;
    postsGrid.innerHTML = loadingMarkup("Loading posts…");
    postsEmptyState.hidden = true;
    showView("posts");

    try {
      const posts = await CH.categoryService.getPosts(category.categoryId);
      categoryPosts = posts.filter((post) => post.assignedToSupervisor !== "true");
      renderPostsGrid();
    } catch (error) {
      postsGrid.innerHTML = "";
      postsEmptyState.hidden = false;
      postsEmptyState.textContent = error.message;
    }
  }

  /** Scopes the page to one category: the URL becomes Userpage.html?category=<id>. */
  function navigateToCategory(categoryId) {
    const category = categories.find((item) => item.categoryId === categoryId);
    if (!category) return;
    history.pushState(null, "", `${userPageHref}?category=${encodeURIComponent(categoryId)}`);
    showCategoryPosts(category);
  }

  function renderPostsGrid() {
    if (categoryPosts.length === 0) {
      postsGrid.innerHTML = "";
      postsEmptyState.hidden = false;
      return;
    }
    postsEmptyState.hidden = true;
    postsGrid.innerHTML = categoryPosts
      .map((post) => CH.renderPostCard(post, { categoryName: selectedCategory.categoryName }))
      .join("");
  }

  /** Looks up the category name and publish date for a hero slide's linked post, for its floating card. */
  function resolveLinkedPostMeta(postId) {
    const post = allPosts.find((item) => item.postId === postId);
    if (!post) return null;
    const category = categories.find((item) => item.categoryId === post.categoryId);
    return { categoryName: category?.categoryName ?? "", publishDate: post.postDate };
  }

  /** A slide only links out to its post if that post is actually public (not the Supervisor's private post). */
  function resolvePostHref(postId) {
    const isPublic = allPosts.some((item) => item.postId === postId);
    return isPublic ? `${userPageHref}?post=${encodeURIComponent(postId)}` : null;
  }

  async function loadHeroSlider() {
    try {
      const activeSlides = await CH.heroSlideService.getActive();
      hasActiveHeroSlides = activeSlides.length > 0;
      CH.renderHeroSlider(heroSliderContainer, activeSlides, {
        resolvePostHref,
        resolveLinkedPostMeta,
        browseAllHref: userPageHref,
      });
      updateHeroSliderVisibility(); // renderHeroSlider() already unhid it if there are slides; re-apply the view gate on top
    } catch {
      hasActiveHeroSlides = false;
      heroSliderContainer.hidden = true;
    }
  }

  /** Renders a post's detail view. Pure render - callers decide whether the URL needs updating. */
  function showPostDetail(post) {
    postDetailContent.innerHTML = CH.renderPostDetail(post, { categoryName: selectedCategory.categoryName });
    showView("postDetail");
  }

  /** Opens a post from within the currently-loaded category posts grid; the URL becomes ?post=<id>. */
  function navigateToPost(postId) {
    const post = categoryPosts.find((item) => item.postId === postId);
    if (!post) return;
    history.pushState(null, "", `${userPageHref}?post=${encodeURIComponent(postId)}`);
    showPostDetail(post);
  }

  /**
   * Renders whichever view the current URL points to - ?post=<id>, ?category=<id>, or plain
   * Userpage.html for the categories grid. Used on first load and on browser back/forward.
   */
  function applyStateFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const postId = params.get("post");
    const categoryId = params.get("category");

    if (postId) {
      const post = allPosts.find((item) => item.postId === postId);
      const category = post ? categories.find((item) => item.categoryId === post.categoryId) : null;
      if (post && category) {
        selectedCategory = category;
        categoryPosts = allPosts.filter((item) => item.categoryId === category.categoryId);
        postsCategoryTitle.textContent = category.categoryName;
        postsCategoryDescription.textContent = category.description;
        renderPostsGrid();
        showPostDetail(post);
        return;
      }
    }

    if (categoryId) {
      const category = categories.find((item) => item.categoryId === categoryId);
      if (category) {
        showCategoryPosts(category);
        return;
      }
    }

    showView("categories");
  }

  categoriesGrid.addEventListener("click", (event) => {
    const card = event.target.closest("[data-category-id]");
    if (card) navigateToCategory(card.dataset.categoryId);
  });

  postsGrid.addEventListener("click", (event) => {
    const card = event.target.closest("[data-post-id]");
    if (card) navigateToPost(card.dataset.postId);
  });

  postsGrid.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest("[data-post-id]");
    if (card) {
      event.preventDefault();
      navigateToPost(card.dataset.postId);
    }
  });

  backToCategoriesButton.addEventListener("click", () => {
    history.pushState(null, "", userPageHref);
    showView("categories");
  });

  backToPostsButton.addEventListener("click", () => {
    if (selectedCategory) {
      history.pushState(null, "", `${userPageHref}?category=${encodeURIComponent(selectedCategory.categoryId)}`);
    }
    showView("posts");
  });

  window.addEventListener("popstate", applyStateFromUrl);

  /**
   * Raised by sync.js when SharePoint turned out to have newer data than this tab was showing.
   * Re-running the normal load path keeps one code path for "render the page", and going back
   * through applyStateFromUrl() means a visitor reading a post stays on that post - the URL is
   * already the source of truth for where they are.
   */
  async function refreshFromServer() {
    suppressScrollReset = true;
    try {
      await loadCategoriesView();
      applyStateFromUrl();
      await loadHeroSlider();
    } finally {
      suppressScrollReset = false;
    }
  }

  window.addEventListener("data:refreshed", refreshFromServer);

  // Hero slider waits on categories/posts so it can resolve each linked post's category + date.
  loadCategoriesView().then(() => {
    applyStateFromUrl();
    loadHeroSlider();
  });
})();
