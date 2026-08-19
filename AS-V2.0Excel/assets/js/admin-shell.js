/**
 * Admin section switching. The URL hash decides which .admin-section is visible, keeps the
 * sidebar link and the mobile <select> in sync, and defaults to the Dashboard when no
 * recognized hash is present. Each section's own script (admin-dashboard.js, etc.) listens
 * for "hashchange" itself to refresh its data when it becomes the active section.
 *
 * Plain classic script, not an ES module - see utils.js for why. Wrapped in an IIFE so its
 * private helpers don't leak into the shared global scope (other admin page scripts load alongside it).
 */
(function () {
  const VALID_SECTIONS = ["home", "dashboard", "categories", "posts", "hero-slider", "supervisor"];
  const DEFAULT_SECTION = "home";

  function getCurrentSection() {
    const hash = window.location.hash.replace("#", "");
    return VALID_SECTIONS.includes(hash) ? hash : DEFAULT_SECTION;
  }

  function showSection(sectionName) {
    document.querySelectorAll(".admin-section").forEach((section) => {
      section.classList.toggle("admin-section--active", section.id === `section-${sectionName}`);
    });
    document.querySelectorAll("[data-admin-nav-link]").forEach((link) => {
      link.classList.toggle("admin-sidebar__link--active", link.dataset.section === sectionName);
    });
    const mobileSelect = document.getElementById("adminMobileNav");
    if (mobileSelect) mobileSelect.value = sectionName;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function applyCurrentSection() {
    showSection(getCurrentSection());
  }

  function initializeAdminShell() {
    applyCurrentSection();

    const mobileSelect = document.getElementById("adminMobileNav");
    mobileSelect?.addEventListener("change", () => {
      window.location.hash = mobileSelect.value;
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeAdminShell, { once: true });
  } else {
    initializeAdminShell();
  }

  window.addEventListener("hashchange", applyCurrentSection);
})();
