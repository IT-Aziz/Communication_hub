/**
 * Pictures live in a document library, and the list row stores a link to one. They can't live in
 * the list itself: a multi-line text column stops at 63,999 characters, which is roughly a 45KB
 * photo, so anything bigger would silently fail to save.
 *
 * Because the app is served from SharePoint, that link can simply be the file's own
 * server-relative URL ("/sites/CommunicationHub/CommunicationHubImages/post-a1b2c3d4.jpg").
 * The browser is already authenticated to that origin, so the URL drops straight into an <img
 * src> and works - no lookup, no expiry, nothing to refresh. It's also readable, which matters:
 * an admin looking at the list sees a file name rather than an opaque ID.
 *
 * The Image Ref column accepts three things on purpose, because an admin is meant to be able to
 * work in SharePoint directly:
 *   1. a server-relative URL - what the app writes when someone uploads through its own form
 *   2. a bare file name        - "welcome-banner.jpg", i.e. what you'd type after dragging a file
 *                                into the library yourself
 *   3. a full https:// URL     - a picture hosted somewhere else entirely
 * Anything unrecognised resolves to no picture, and the cards already render cleanly without
 * one, so a typo degrades quietly instead of breaking a page.
 *
 * Plain classic script, not an ES module - see utils.js for why. Loads after sp-rest.js.
 */
window.CH = window.CH || {};

(function () {
  const MAX_IMAGE_DIMENSION = 1600; // px on the long edge
  const JPEG_QUALITY = 0.85;

  function libraryPath() {
    return `${CH.getWebServerRelativeUrl()}/${CH.config.imageLibrary}`;
  }

  function loadImageElement(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not decode image"));
      image.src = dataUrl;
    });
  }

  /**
   * Re-encodes an upload as a display-sized JPEG, for two reasons: it normalises formats the
   * rest of the app would otherwise have to special-case (WebP, GIF), and it stops a
   * 12-megapixel phone photo becoming the thing every visitor downloads to see a thumbnail.
   */
  async function encodeForUpload(dataUrl) {
    const image = await loadImageElement(dataUrl);
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff"; // JPEG has no alpha - flatten transparency onto white, not black
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode image"))),
        "image/jpeg",
        JPEG_QUALITY,
      );
    });
  }

  /** Stored reference -> something an <img src> can use. */
  function resolve(ref) {
    if (!ref) return "";
    const value = String(ref).trim();
    // blob: shows up only in demo mode (assets/js/sp-rest.js), for an image that was "uploaded"
    // with no real SharePoint to store it - already a usable <img src> on its own, like https:.
    if (/^(https?:|blob:)/i.test(value) || value.startsWith("/")) return value;
    return `${libraryPath()}/${value}`; // a bare file name typed by an admin
  }

  async function upload(dataUrl, namePrefix = "image") {
    const blob = await encodeForUpload(dataUrl);
    const fileName = `${namePrefix}-${crypto.randomUUID().slice(0, 8)}.jpg`;
    const path =
      `/_api/web/GetFolderByServerRelativeUrl('${CH.sp.quote(libraryPath())}')` +
      `/Files/add(url='${CH.sp.quote(fileName)}',overwrite=true)`;
    const created = await CH.sp.write(path, { rawBody: blob, contentType: "image/jpeg" });
    const serverRelativeUrl =
      created?.d?.ServerRelativeUrl || created?.ServerRelativeUrl || `${libraryPath()}/${fileName}`;
    return serverRelativeUrl;
  }

  /**
   * Deletes the underlying file. Callers must check nothing else still points at it first - the
   * hero slider can copy a post's picture onto a slide, so one file genuinely can have two
   * owners, and deleting on the first one's say-so would blank the other.
   */
  async function remove(ref) {
    if (!ref || /^https?:\/\//i.test(ref)) return; // never delete something we didn't upload
    try {
      const serverRelativeUrl = resolve(ref);
      await CH.sp.write(`/_api/web/GetFileByServerRelativeUrl('${CH.sp.quote(serverRelativeUrl)}')`, {
        httpMethod: "DELETE",
      });
    } catch (error) {
      // The record itself has already saved by this point. A leftover file in the library is
      // untidy; failing the user's save over it would be worse.
      console.warn("Couldn't delete the old image:", error.message);
    }
  }

  CH.imageStore = { resolve, upload, remove };
})();
