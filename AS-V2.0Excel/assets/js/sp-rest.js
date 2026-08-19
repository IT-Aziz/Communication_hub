/**
 * The SharePoint REST client. Every request the app makes goes through here, using jQuery's
 * $.ajax - the same shape as most SharePoint REST examples you'll find, so anything you copy
 * from a tutorial drops in without translation.
 *
 * Authentication is the interesting part, precisely because there isn't any code for it. The
 * pages are served by SharePoint, so requests to /_api/... are same-origin and the browser
 * attaches the user's existing SharePoint session cookie by itself. That means no sign-in
 * screen, no token handling, no app registration - and, more importantly, nothing secret that
 * could be read out of the page source, because nothing secret exists.
 *
 * It also means SharePoint's own permissions are the app's permissions. A user with Read access
 * on a list can browse announcements and physically cannot create one: the POST comes back 403
 * from SharePoint. That boundary is enforced on the server, not by a check in this file that a
 * determined person could step over in the dev console.
 *
 * Three SharePoint quirks are handled here so nothing above has to think about them:
 *
 *   1. Writes need a form digest - a short-lived per-session token SharePoint hands out from
 *      /_api/contextinfo to prove the request came from a real page rather than a forged
 *      cross-site POST. It expires, so it's cached with its own stated lifetime and re-fetched
 *      before it lapses rather than after a write has already failed.
 *
 *   2. Reads ask for odata=nometadata, which strips SharePoint's verbose type wrappers and
 *      returns plain JSON. Writes use odata=verbose instead, because creating an item that way
 *      requires naming the list's entity type - which SharePoint will tell us, once per list.
 *
 *   3. Everything asks jQuery for `dataType: "text"` and parses the JSON by hand. That looks
 *      like extra work and isn't: a successful DELETE returns 204 with an empty body, and
 *      jQuery's own JSON parsing treats an empty body as a parse error, so a perfectly good
 *      delete would arrive in the failure handler.
 *
 * Plain classic script, not an ES module - see utils.js for why. Loads after config.js and
 * vendor/jquery.min.js.
 */
window.CH = window.CH || {};

(function ($) {
  const MAX_RETRIES = 3;
  const BACKOFF_MS = 1500;
  const DIGEST_SAFETY_MARGIN_MS = 60000;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function apiUrl(path) {
    return `${CH.getWebUrl()}${path}`;
  }

  /** SharePoint puts single quotes round list titles in URLs, so a quote in a title must double up. */
  function quote(value) {
    return String(value).replace(/'/g, "''");
  }

  // ---------- Demo mode (no SharePoint context on this page) ----------
  //
  // _spPageContextInfo is a global SharePoint stamps onto every page it actually serves - the
  // same signal config.js already relies on. Its absence means this file is running somewhere
  // SharePoint never touched: localhost, a GitHub Pages/raw.githack preview, a plain file://
  // open. Rather than let every read/write fail with "Couldn't reach SharePoint" there, demo
  // mode swaps in a small in-memory store seeded with sample rows, so the app has something to
  // show and its create/edit/delete flows still work for the length of the tab. None of this
  // runs, or is even reachable, once the page is actually hosted by SharePoint.
  const DEMO_MODE = typeof _spPageContextInfo === "undefined";

  if (DEMO_MODE) {
    console.info("[CH] No SharePoint context detected - using sample data instead of live lists.");
  }

  let demoStore = null;
  let demoIdCounter = 1000;

  function nextDemoId() {
    demoIdCounter += 1;
    return demoIdCounter;
  }

  function seedDemoItems(rows) {
    const now = new Date().toISOString();
    return rows.map((fields) => ({ Id: nextDemoId(), Modified: now, CHCreatedAt: now, CHUpdatedAt: now, ...fields }));
  }

  function buildDemoStore() {
    const lists = CH.config.lists;
    const now = new Date().toISOString();
    return {
      [lists.categories]: seedDemoItems([
        { CHCategoryID: "cat-001", Title: "Announcements", CHDescription: "Official updates from campus administration.", CHImageRef: "", CHIcon: "📢" },
        { CHCategoryID: "cat-002", Title: "Events", CHDescription: "Upcoming activities and campus events.", CHImageRef: "", CHIcon: "🎉" },
        { CHCategoryID: "cat-003", Title: "Facilities", CHDescription: "Maintenance notices and facility updates.", CHImageRef: "", CHIcon: "🏢" },
      ]),
      [lists.posts]: seedDemoItems([
        { CHPostID: "post-001", CHCategoryID: "cat-001", Title: "Fall Semester Registration Opens", CHShortDescription: "Registration begins Monday for all returning students.", CHFullDescription: "Registration for the fall semester opens Monday at 8:00 AM. Make sure your account is in good standing before you register.", CHImageRef: "", CHPostDate: now, CHCreatedByRole: "Admin", CHAssignedToSupervisor: "false" },
        { CHPostID: "post-002", CHCategoryID: "cat-002", Title: "Annual Sports Day", CHShortDescription: "Join us for a full day of sports and activities.", CHFullDescription: "The Annual Sports Day will be held on the main field, featuring team sports, prizes, and food trucks.", CHImageRef: "", CHPostDate: now, CHCreatedByRole: "Admin", CHAssignedToSupervisor: "true" },
        { CHPostID: "post-003", CHCategoryID: "cat-003", Title: "Elevator Maintenance in Building C", CHShortDescription: "Elevators will be offline for scheduled maintenance.", CHFullDescription: "Building C's elevators will be under maintenance this weekend. Please use the stairs or the Building D elevators.", CHImageRef: "", CHPostDate: now, CHCreatedByRole: "Supervisor", CHAssignedToSupervisor: "false" },
      ]),
      [lists.heroSlides]: seedDemoItems([
        { CHSliderID: "slide-001", Title: "Welcome Back!", CHDescription: "A new semester starts now.", CHImageRef: "", CHLinkedPostID: "", CHDisplayOrder: 1, CHIsActive: "true" },
        { CHSliderID: "slide-002", Title: "Sports Day is Coming", CHDescription: "Don't miss the Annual Sports Day.", CHImageRef: "", CHLinkedPostID: "post-002", CHDisplayOrder: 2, CHIsActive: "true" },
      ]),
    };
  }

  function ensureDemoStore() {
    if (!demoStore) demoStore = buildDemoStore();
    return demoStore;
  }

  /** SharePoint doubles a literal quote inside getbytitle('...') - undo that to get the real title. */
  function listTitleFromPath(path) {
    const match = path.match(/getbytitle\('([^']+)'\)/);
    return match ? match[1].replace(/''/g, "'") : null;
  }

  function demoRead(path) {
    const store = ensureDemoStore();
    if (path.includes("ListItemEntityTypeFullName")) {
      return { ListItemEntityTypeFullName: "SP.Data.DemoListItem" };
    }
    const title = listTitleFromPath(path);
    return { value: title && store[title] ? store[title].map((item) => ({ ...item })) : [] };
  }

  function demoWrite(path, { body, httpMethod, rawBody } = {}) {
    const store = ensureDemoStore();

    // Image upload/delete go through the file APIs, not a list - an object URL makes an uploaded
    // picture preview correctly for the rest of the session, with nothing real to store it in.
    if (rawBody && path.includes("/Files/add(")) {
      return { d: { ServerRelativeUrl: URL.createObjectURL(rawBody) } };
    }
    if (path.includes("GetFileByServerRelativeUrl")) {
      return null;
    }

    const single = path.match(/getbytitle\('([^']+)'\)\/items\((\d+)\)/);
    if (single) {
      const title = single[1].replace(/''/g, "'");
      const id = Number(single[2]);
      const items = store[title] || [];
      const index = items.findIndex((item) => item.Id === id);
      if (index === -1) return null;
      if (httpMethod === "DELETE") {
        items.splice(index, 1);
        return null;
      }
      const { __metadata, ...fields } = body || {};
      Object.assign(items[index], fields, { Modified: new Date().toISOString() });
      return null;
    }

    const title = listTitleFromPath(path);
    if (title) {
      if (!store[title]) store[title] = [];
      const { __metadata, ...fields } = body || {};
      const id = nextDemoId();
      store[title].push({ Id: id, Modified: new Date().toISOString(), ...fields });
      return { d: { Id: id } };
    }

    return null;
  }

  /**
   * jQuery reports a failure as (jqXHR, textStatus, errorThrown), with the useful sentence
   * buried in the response body - and SharePoint writes that sentence in two different shapes
   * depending on the odata mode requested. Digging it out is the difference between telling
   * someone "Couldn't save (400)" and "Invalid data has been used to update the list item."
   */
  function describeFailure(jqXHR) {
    let detail = "";
    try {
      const body = JSON.parse(jqXHR.responseText);
      detail =
        body?.error?.message?.value ||        // odata=verbose
        body?.["odata.error"]?.message?.value || // odata=nometadata / minimalmetadata
        body?.error?.message ||
        "";
    } catch {
      // A proxy or a sign-in redirect can return HTML here - fall through to the status code.
    }
    if (jqXHR.status === 403) return detail || "You don't have permission to do that in SharePoint.";
    if (jqXHR.status === 404) return detail || "That item no longer exists in SharePoint - it may have just been deleted.";
    if (jqXHR.status === 401) return "Your SharePoint session has expired. Refresh the page to sign in again.";
    if (jqXHR.status === 0) return "Couldn't reach SharePoint. Check your network connection.";
    return detail || `SharePoint request failed (${jqXHR.status}).`;
  }

  /**
   * One $.ajax call, wrapped so it settles with the jqXHR either way. jQuery's own promise
   * rejects with the jqXHR as the *first* argument rather than an Error, so normalising here
   * keeps every caller from having to remember that.
   */
  function ajax(settings) {
    return new Promise((resolve, reject) => {
      $.ajax({ ...settings, dataType: "text" })
        .done((text, _status, jqXHR) => resolve({ text, jqXHR }))
        .fail((jqXHR) => reject(jqXHR));
    });
  }

  function parse(text) {
    if (!text) return null; // 204 No Content, which DELETE and some MERGEs return
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  // ---------- Form digest ----------

  let digestValue = null;
  let digestExpiresAt = 0;
  let digestPromise = null;

  async function fetchDigest() {
    let result;
    try {
      result = await ajax({
        url: apiUrl("/_api/contextinfo"),
        method: "POST",
        headers: { Accept: "application/json;odata=nometadata" },
        xhrFields: { withCredentials: true },
      });
    } catch (jqXHR) {
      throw new Error(describeFailure(jqXHR));
    }
    const body = parse(result.text) || {};
    const value = body.FormDigestValue || body.GetContextWebInformation?.FormDigestValue;
    const lifetimeSeconds =
      body.FormDigestTimeoutSeconds || body.GetContextWebInformation?.FormDigestTimeoutSeconds || 1800;
    if (!value) throw new Error("SharePoint didn't return a form digest - is the app hosted on the SharePoint site?");
    digestValue = value;
    digestExpiresAt = Date.now() + lifetimeSeconds * 1000 - DIGEST_SAFETY_MARGIN_MS;
    return value;
  }

  async function getDigest(force = false) {
    if (!force && digestValue && Date.now() < digestExpiresAt) return digestValue;
    if (!digestPromise) {
      digestPromise = fetchDigest().finally(() => {
        digestPromise = null;
      });
    }
    return digestPromise;
  }

  function retryDelay(jqXHR, attempt) {
    const retryAfter = Number(jqXHR.getResponseHeader("Retry-After"));
    return Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : BACKOFF_MS * 2 ** attempt;
  }

  // ---------- Requests ----------

  async function read(path) {
    if (DEMO_MODE) return demoRead(path);
    for (let attempt = 0; ; attempt += 1) {
      try {
        const { text } = await ajax({
          url: apiUrl(path),
          method: "GET",
          headers: { Accept: "application/json;odata=nometadata" },
          xhrFields: { withCredentials: true },
        });
        return parse(text);
      } catch (jqXHR) {
        // status 0 is jQuery's way of saying the request never completed - offline, a proxy
        // hiccup, a laptop waking from sleep. Those recover on their own, so retry quietly
        // rather than turning a two-second blip into an error message.
        const transient = jqXHR.status === 0 || jqXHR.status === 429 || jqXHR.status === 503;
        if (transient && attempt < MAX_RETRIES) {
          await sleep(jqXHR.status === 0 ? BACKOFF_MS * (attempt + 1) : retryDelay(jqXHR, attempt));
          continue;
        }
        throw new Error(describeFailure(jqXHR));
      }
    }
  }

  /**
   * A collection read, following odata.nextLink to the end. SharePoint caps a page well below
   * whatever $top asks for, and a silently truncated list looks like missing data rather than an
   * error - which is a far worse bug to chase than a slow request.
   */
  async function readAll(path) {
    const items = [];
    let next = path;
    let guard = 0;
    while (next && guard < 50) {
      const page = await read(next);
      if (page && Array.isArray(page.value)) items.push(...page.value);
      const nextLink = page?.["odata.nextLink"] || page?.["@odata.nextLink"] || null;
      // The next link comes back absolute; strip the web prefix so apiUrl() doesn't double it.
      next = nextLink ? nextLink.replace(CH.getWebUrl(), "") : null;
      guard += 1;
    }
    return items;
  }

  /**
   * A write. `httpMethod` is SharePoint's X-HTTP-Method override - "MERGE" to update an existing
   * item (a partial update, so untouched columns keep their values) and "DELETE" to remove one.
   * Both are sent as POSTs, which is how the SharePoint REST API expects them.
   */
  async function write(path, { body, httpMethod, rawBody = null, contentType } = {}) {
    if (DEMO_MODE) return demoWrite(path, { body, httpMethod, rawBody });
    for (let attempt = 0; ; attempt += 1) {
      const digest = await getDigest(attempt > 0);
      const headers = { Accept: "application/json;odata=verbose", "X-RequestDigest": digest };
      if (httpMethod) {
        headers["X-HTTP-Method"] = httpMethod;
        headers["IF-MATCH"] = "*"; // last write wins, rather than failing on a version mismatch
      }

      const settings = {
        url: apiUrl(path),
        method: "POST",
        headers,
        xhrFields: { withCredentials: true },
      };

      if (rawBody !== null) {
        // A Blob (an image upload). processData must be off or jQuery would try to serialise it
        // into a query string, which turns the file into the text "[object Blob]".
        settings.data = rawBody;
        settings.processData = false;
        settings.contentType = contentType || false;
      } else if (body !== undefined) {
        settings.data = JSON.stringify(body);
        settings.contentType = "application/json;odata=verbose";
      } else {
        settings.contentType = false;
        settings.processData = false;
      }

      try {
        const { text } = await ajax(settings);
        return parse(text);
      } catch (jqXHR) {
        // 403 on a write is ambiguous: it's either a genuinely read-only user or a digest that
        // went stale early. One retry with a fresh digest tells the two apart without pestering
        // someone who simply doesn't have permission.
        if (jqXHR.status === 403 && attempt === 0) continue;

        const transient = jqXHR.status === 0 || jqXHR.status === 429 || jqXHR.status === 503;
        if (transient && attempt < MAX_RETRIES) {
          await sleep(jqXHR.status === 0 ? BACKOFF_MS * (attempt + 1) : retryDelay(jqXHR, attempt));
          continue;
        }
        throw new Error(describeFailure(jqXHR));
      }
    }
  }

  // ---------- List helpers ----------

  const entityTypePromises = new Map();

  /**
   * Creating an item with odata=verbose means telling SharePoint the list's entity type name
   * (something like "SP.Data.CommunicationHub_x0020_PostsListItem"). It is derived from the
   * list's original name in a way that is genuinely awkward to predict - spaces become _x0020_,
   * later renames don't change it - so it gets asked for once per list and cached, instead of
   * being guessed.
   */
  function getListItemEntityType(listTitle) {
    if (!entityTypePromises.has(listTitle)) {
      const promise = read(`/_api/web/lists/getbytitle('${quote(listTitle)}')?$select=ListItemEntityTypeFullName`)
        .then((list) => {
          if (!list?.ListItemEntityTypeFullName) {
            throw new Error(`SharePoint list "${listTitle}" wasn't found. Check the names in assets/js/config.js.`);
          }
          return list.ListItemEntityTypeFullName;
        })
        .catch((error) => {
          entityTypePromises.delete(listTitle);
          if (String(error.message).includes("does not exist")) {
            throw new Error(
              `SharePoint list "${listTitle}" wasn't found on this site. Create it (see setup/provision.html) or correct the name in assets/js/config.js.`,
            );
          }
          throw error;
        });
      entityTypePromises.set(listTitle, promise);
    }
    return entityTypePromises.get(listTitle);
  }

  function listItemsPath(listTitle, query) {
    return `/_api/web/lists/getbytitle('${quote(listTitle)}')/items${query ? `?${query}` : ""}`;
  }

  function listItemPath(listTitle, itemId) {
    return `/_api/web/lists/getbytitle('${quote(listTitle)}')/items(${Number(itemId)})`;
  }

  async function createListItem(listTitle, fields) {
    const type = await getListItemEntityType(listTitle);
    return write(listItemsPath(listTitle), { body: { __metadata: { type }, ...fields } });
  }

  async function updateListItem(listTitle, itemId, fields) {
    const type = await getListItemEntityType(listTitle);
    return write(listItemPath(listTitle, itemId), {
      body: { __metadata: { type }, ...fields },
      httpMethod: "MERGE",
    });
  }

  function deleteListItem(listTitle, itemId) {
    return write(listItemPath(listTitle, itemId), { httpMethod: "DELETE" });
  }

  CH.sp = {
    read,
    readAll,
    write,
    listItemsPath,
    createListItem,
    updateListItem,
    deleteListItem,
    quote,
  };
})(jQuery);
