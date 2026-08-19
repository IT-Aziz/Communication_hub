/**
 * Small, dependency-free helpers shared by every page.
 *
 * Plain classic scripts throughout, not ES modules. SharePoint serves these pages as ordinary
 * files rather than from a build pipeline, and <script type="module"> brings CORS rules and
 * strict MIME-type checking that document-library hosting does not reliably satisfy. Every file
 * attaches its functions to the shared window.CH namespace instead of using import/export, and
 * pages load them with plain <script src="..."> tags in dependency order.
 */
window.CH = window.CH || {};

/** Prevents user-entered text from being interpreted as HTML when it's inserted into the page. */
CH.escapeHtml = function escapeHtml(value) {
  const container = document.createElement("div");
  container.textContent = value ?? "";
  return container.innerHTML;
};

CH.formatDate = function formatDate(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

CH.getInitial = function getInitial(name) {
  const trimmed = (name ?? "").trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
};

const GRADIENT_COUNT = 6;

/** Cycles a fixed 6-color gradient palette across however many categories exist. */
CH.getGradientClassName = function getGradientClassName(positionIndex) {
  const gradientNumber = (positionIndex % GRADIENT_COUNT) + 1;
  return `category-card__banner--gradient-${gradientNumber}`;
};

let toastRegion = null;

function getToastRegion() {
  if (!toastRegion) {
    toastRegion = document.createElement("div");
    toastRegion.className = "toast-region";
    toastRegion.setAttribute("role", "status");
    toastRegion.setAttribute("aria-live", "polite");
    document.body.appendChild(toastRegion);
  }
  return toastRegion;
}

/**
 * The one banner across the top of each page (#appStatus). Unlike a toast, this stays put -
 * it's for the conditions that stop the page working at all, such as a missing list or an
 * expired SharePoint session, where a message that fades after three seconds would be worse
 * than useless.
 */
CH.showAppStatus = function showAppStatus(message) {
  const banner = document.getElementById("appStatus");
  if (!banner) return;
  const target = banner.querySelector("[data-status-message]");
  if (target) target.textContent = message;
  banner.hidden = false;
};

CH.clearAppStatus = function clearAppStatus() {
  const banner = document.getElementById("appStatus");
  if (banner) banner.hidden = true;
};

/** Shows a short-lived success/error message in the corner of the screen. */
CH.showToast = function showToast(message, tone = "success") {
  const region = getToastRegion();
  const toast = document.createElement("div");
  toast.className = `toast toast--${tone}`;
  toast.textContent = message;
  region.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
};

/** Converts an <input type="file"> selection into a base64 data URL the API accepts. */
CH.readFileAsDataUrl = function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
};

// Stroke-based icon set (24x24, matching the admin/hero UI's visual language). Every entry here is
// referenced - the first group by CH.icon() calls, the rest by the category icon picker.
const ICON_PATHS = {
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
  fileText:
    '<path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M15 3v5h5"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  trash:
    '<path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
  arrowUp: '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
  arrowDown: '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>',
  chevronLeft: '<polyline points="15 18 9 12 15 6"/>',
  chevronRight: '<polyline points="9 18 15 12 9 6"/>',
  pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  // Thematic set for the category icon picker - one per common internal-comms topic.
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="3" y1="13" x2="21" y2="13"/>',
  users:
    '<circle cx="8.5" cy="7.5" r="3.5"/><path d="M2 20c0-3.6 2.9-6.5 6.5-6.5S15 16.4 15 20"/><path d="M16 4.7a3.3 3.3 0 0 1 0 6.6"/><path d="M17.5 13.5c2.5.7 4.5 3.2 4.5 6.5"/>',
  shield: '<path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3Z"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><line x1="8" y1="20" x2="16" y2="20"/><line x1="12" y1="16" x2="12" y2="20"/>',
  building:
    '<rect x="5" y="3" width="14" height="18" rx="1"/><line x1="9" y1="7" x2="9" y2="7.01"/><line x1="15" y1="7" x2="15" y2="7.01"/><line x1="9" y1="11" x2="9" y2="11.01"/><line x1="15" y1="11" x2="15" y2="11.01"/><path d="M10 21v-4h4v4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="3" y1="10" x2="21" y2="10"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z"/><path d="M10 19a2 2 0 0 0 4 0"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z"/><line x1="4" y1="19" x2="20" y2="19"/>',
  heart:
    '<path d="M12 21s-7.5-4.9-9.9-9.4C.6 8.2 2.4 4.5 6.2 4.5c2 0 3.7 1.1 5.8 3.3 2.1-2.2 3.8-3.3 5.8-3.3 3.8 0 5.6 3.7 4.1 7.1C19.5 16.1 12 21 12 21Z"/>',
  megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6l-4 4H4a1 1 0 0 0-1 1Z"/><path d="M14 8a4 4 0 0 1 0 8"/><path d="M18 5a8 8 0 0 1 0 14"/>',
  globe: '<circle cx="12" cy="12" r="9"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M12 3c2.5 2.5 4 6 4 9s-1.5 6.5-4 9c-2.5-2.5-4-6-4-9s1.5-6.5 4-9Z"/>',
  wrench: '<path d="M20 7a5 5 0 0 1-6.8 4.7L7 18l-3-3 6.3-6.2A5 5 0 1 1 20 7Z"/>',
};

/** Returns inline SVG markup for a named icon - no icon-font or library dependency. */
CH.icon = function icon(name, { size = 20, className = "" } = {}) {
  const paths = ICON_PATHS[name];
  if (!paths) return "";
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon ${className}" aria-hidden="true">${paths}</svg>`;
};
