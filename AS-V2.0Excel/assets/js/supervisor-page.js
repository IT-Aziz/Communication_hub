/**
 * Supervisor.html controller: shows whichever post the Admin has currently assigned (or an
 * empty state if none).
 *
 * Plain classic script, not an ES module - see utils.js for why. Wrapped in an IIFE so its
 * private state doesn't leak into the shared global scope.
 */
window.CH = window.CH || {};

(function () {
  const loadingState = document.getElementById("supervisorLoadingState");
  const emptyState = document.getElementById("supervisorEmptyState");
  const postContent = document.getElementById("supervisorPostContent");

  function showState(state) {
    loadingState.hidden = state !== "loading";
    emptyState.hidden = state !== "empty";
    postContent.hidden = state !== "post";
  }

  async function loadAssignedPost() {
    showState("loading");
    try {
      const [post, categories] = await Promise.all([CH.postService.getAssigned(), CH.categoryService.getAll()]);
      if (!post) {
        showState("empty");
        return;
      }
      const categoryName = categories.find((item) => item.categoryId === post.categoryId)?.categoryName ?? "Uncategorized";
      postContent.innerHTML = CH.renderPostDetail(post, { categoryName });
      showState("post");
    } catch (error) {
      emptyState.textContent = error.message;
      showState("empty");
    }
  }

  /**
   * The Supervisor's page is the one most likely to be left open on a second monitor all day,
   * so picking up a reassignment without a manual reload matters more here than anywhere else.
   * Re-showing the loading spinner for a background refresh would flicker, hence the quiet path.
   */
  async function refreshFromServer() {
    try {
      const [post, categories] = await Promise.all([CH.postService.getAssigned(), CH.categoryService.getAll()]);
      if (!post) {
        showState("empty");
        return;
      }
      const categoryName = categories.find((item) => item.categoryId === post.categoryId)?.categoryName ?? "Uncategorized";
      postContent.innerHTML = CH.renderPostDetail(post, { categoryName });
      showState("post");
    } catch {
      // Keep whatever is already on screen - a transient network blip shouldn't wipe the post.
    }
  }

  window.addEventListener("data:refreshed", refreshFromServer);

  loadAssignedPost();
})();
