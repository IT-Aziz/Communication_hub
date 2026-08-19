/**
 * Keeps every open browser in step with SharePoint. This is what makes the admin workflow work
 * end to end: an admin edits a row in the list, and within one poll interval everyone looking at
 * the site sees it - no reload, no file to replace, nothing to redeploy.
 *
 * The obvious implementation - re-download all three lists every 30 seconds - would work and
 * would also be wasteful enough to get throttled on a busy tenant. So each poll asks a much
 * cheaper question first: "for each list, what are the item IDs and when was each last
 * modified?" That is a few dozen bytes per row and it catches all three kinds of change that
 * matter - an added row (new ID), an edited row (newer stamp), a deleted row (missing ID). Only
 * when that signature differs does the full re-read happen, and only the collections that
 * actually changed are told to re-render. A quiet site costs three small requests a minute and
 * causes no DOM churn at all.
 *
 * Re-rendering needed no new wiring. The admin sections already dispatched "posts:changed" /
 * "categories:changed" / "heroslides:changed" to each other after a local edit, so a remote
 * change simply raises the same events and every controller that already knew how to refresh
 * itself keeps working untouched.
 *
 * Plain classic script, not an ES module - see utils.js for why. Loads last, after the page's
 * own controllers, so their listeners are registered before the first poll.
 */
window.CH = window.CH || {};

(function () {
  const COLLECTION_EVENTS = {
    categories: "categories:changed",
    posts: "posts:changed",
    heroSlides: "heroslides:changed",
  };

  const signatures = { categories: null, posts: null, heroSlides: null };
  let timerId = null;
  let inFlight = null;
  let deferredBecauseBusy = false;
  let lastSyncedAt = null;

  // ---------- The status strip ----------

  const syncBar = document.getElementById("syncBar");

  function setStatus(text) {
    const target = syncBar ? syncBar.querySelector("[data-sync-status]") : null;
    if (target) target.textContent = text;
  }

  function describeLastSync() {
    if (!lastSyncedAt) return "";
    return `Updated ${lastSyncedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }

  function showSyncBar() {
    if (!syncBar) return;
    syncBar.hidden = false;
    const refreshButton = syncBar.querySelector("[data-refresh-now]");
    if (refreshButton && !refreshButton.dataset.wired) {
      refreshButton.dataset.wired = "true";
      refreshButton.addEventListener("click", async () => {
        refreshButton.disabled = true;
        try {
          await CH.sync.refreshNow({ force: true });
        } finally {
          refreshButton.disabled = false;
        }
      });
    }
  }

  /**
   * A refresh in the middle of an edit would pull the ground out from under whoever is typing,
   * so while a dialog is open the cheap poll still runs but the re-render waits for it to close.
   */
  function isUserMidEdit() {
    return Boolean(document.querySelector("dialog[open]"));
  }

  // ---------- Change detection ----------

  async function fetchSignature(collectionName) {
    const title = CH.db.listTitles()[collectionName];
    const items = await CH.sp.readAll(CH.sp.listItemsPath(title, "$select=Id,Modified&$top=5000"));
    return items
      .map((item) => `${item.Id}:${item.Modified}`)
      .sort()
      .join("|");
  }

  async function readAllSignatures() {
    const [categories, posts, heroSlides] = await Promise.all([
      fetchSignature("categories"),
      fetchSignature("posts"),
      fetchSignature("heroSlides"),
    ]);
    return { categories, posts, heroSlides };
  }

  /** Records the current server state as "already seen", without re-rendering anything. */
  async function baseline() {
    try {
      Object.assign(signatures, await readAllSignatures());
      lastSyncedAt = new Date();
      setStatus(describeLastSync());
    } catch {
      // A failed baseline just means the next poll treats everything as changed and re-reads.
      // Correct, if mildly wasteful - not worth bothering the user about.
    }
  }

  async function check({ force = false } = {}) {
    if (inFlight) return inFlight;

    inFlight = (async () => {
      if (!CH.db.isLoaded()) return;

      let next;
      try {
        next = await readAllSignatures();
      } catch {
        setStatus("Offline");
        return;
      }

      const changed = Object.keys(signatures).filter(
        (collectionName) => force || signatures[collectionName] !== next[collectionName],
      );
      lastSyncedAt = new Date();

      if (changed.length === 0) {
        setStatus(describeLastSync());
        return;
      }

      if (isUserMidEdit()) {
        // Leave the stored signatures alone so the very next check still sees the change.
        deferredBecauseBusy = true;
        setStatus("Changes waiting");
        return;
      }

      setStatus("Updating…");
      try {
        await CH.db.reloadAll();
      } catch {
        setStatus("Offline");
        return;
      }

      Object.assign(signatures, next);
      changed.forEach((collectionName) => {
        window.dispatchEvent(new CustomEvent(COLLECTION_EVENTS[collectionName]));
      });
      // Pages that render more than one collection at once - the public home page, the admin
      // Home section - listen for this instead of juggling three separate handlers.
      window.dispatchEvent(new CustomEvent("data:refreshed", { detail: { changed } }));
      setStatus(describeLastSync());
    })().finally(() => {
      inFlight = null;
    });

    return inFlight;
  }

  function startTimer() {
    stopTimer();
    const interval = CH.config.sync.pollIntervalMs;
    if (!interval || interval <= 0) return;
    timerId = setInterval(() => {
      // No point polling a tab nobody is looking at; the visibility handler below fires an
      // immediate check the moment it comes back, so nothing is missed.
      if (document.visibilityState === "visible") check();
    }, interval);
  }

  function stopTimer() {
    if (timerId) clearInterval(timerId);
    timerId = null;
  }

  async function initialize() {
    // Wait for the controllers' own first load before taking a baseline, otherwise the first
    // poll compares against nothing and re-reads everything for no reason.
    try {
      await CH.getAllCategories();
    } catch {
      return; // the first load failed and already reported itself; nothing to keep in sync yet
    }

    showSyncBar();
    await baseline();
    startTimer();

    if (CH.config.sync.refreshOnFocus) {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
      window.addEventListener("focus", () => check());
    }

    // A local edit already updated the cache and re-rendered, so re-reading everything because
    // of it would be pure waste - re-baseline quietly instead. The short delay lets SharePoint
    // finish indexing the write before we snapshot it.
    let localWriteTimer = null;
    window.addEventListener("data:localwrite", () => {
      clearTimeout(localWriteTimer);
      localWriteTimer = setTimeout(baseline, 1200);
    });

    // Whatever was held back while a dialog was open lands as soon as it closes.
    document.addEventListener(
      "close",
      () => {
        if (!deferredBecauseBusy) return;
        deferredBecauseBusy = false;
        check();
      },
      true, // "close" doesn't bubble, so listen during the capture phase
    );
  }

  // The one public handle: the Refresh button uses it, and it's there for anything else that
  // ever needs to force a check.
  CH.sync = { refreshNow: (options) => check(options) };

  initialize();
})();
