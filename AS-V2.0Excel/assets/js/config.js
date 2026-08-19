/**
 * The only file you edit to point this app at your SharePoint site.
 *
 * There is nothing sensitive in here, and nothing sensitive anywhere else in the app either.
 * The app talks to SharePoint from a page served by SharePoint itself, so the browser already
 * holds the signed-in user's session - there is no token to fetch, no client secret, no API key,
 * and no app registration. Whoever is looking at the page is who SharePoint thinks they are.
 *
 * Plain classic script, not an ES module - see utils.js for why. Loads first, before sp-rest.js.
 */
window.CH = window.CH || {};

CH.config = {
  /**
   * Leave this empty and the app works out which site it lives in from its own URL - so the same
   * files can be copied between a test site and a live one with no edits at all. Set it only if
   * the pages are ever served from somewhere other than the site holding the lists.
   *
   * Example if you do set it: "https://contoso.sharepoint.com/sites/CommunicationHub"
   */
  siteUrl: "",

  /** Display titles of the three lists, exactly as they appear in SharePoint. */
  lists: {
    categories: "CommunicationHub Categories",
    posts: "CommunicationHub Posts",
    heroSlides: "CommunicationHub HeroSlides",
  },

  /** Document library holding category/post/slide pictures. */
  imageLibrary: "CommunicationHubImages",

  sync: {
    /**
     * How often to ask SharePoint whether anything changed, in milliseconds. The check is
     * deliberately cheap - item IDs and their Modified stamps only - so the full records are
     * re-read just when something actually differs.
     * Set to 0 to switch the timer off and rely on page load, tab focus and the Refresh button.
     */
    pollIntervalMs: 30000,

    /** Also check the moment the tab regains focus, so coming back to it is never stale. */
    refreshOnFocus: true,
  },
};

/**
 * Works out which SharePoint web the app is running in.
 *
 * Hosted inside SharePoint the page URL already contains the answer, so nothing needs
 * configuring. Managed metadata about the current page is also published by SharePoint itself as
 * _spPageContextInfo on classic pages and in SPFx, which is more reliable than parsing a path
 * when it is there - so that is checked first, and the path is the fallback.
 */
CH.getWebUrl = function getWebUrl() {
  if (CH.config.siteUrl) return CH.config.siteUrl.replace(/\/+$/, "");

  if (window._spPageContextInfo && window._spPageContextInfo.webAbsoluteUrl) {
    return window._spPageContextInfo.webAbsoluteUrl.replace(/\/+$/, "");
  }

  // /sites/Something/... and /teams/Something/... are the two managed-path shapes SharePoint
  // Online uses; anything else means the app sits at the root web.
  const match = window.location.pathname.match(/^\/(sites|teams)\/[^/]+/i);
  return window.location.origin + (match ? match[0] : "");
};

/** Server-relative form ("/sites/CommunicationHub"), which is what the file APIs expect. */
CH.getWebServerRelativeUrl = function getWebServerRelativeUrl() {
  const path = new URL(CH.getWebUrl(), window.location.origin).pathname.replace(/\/+$/, "");
  return path;
};
