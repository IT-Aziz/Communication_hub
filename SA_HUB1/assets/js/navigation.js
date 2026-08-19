/**
 * Shared navbar behavior for all three pages: highlights the active link and
 * wires the mobile menu toggle. Runs itself on load, so pages only need to include the script.
 *
 * Plain classic script, not an ES module - see utils.js for why. Wrapped in an IIFE so its
 * private helpers don't leak into the shared global scope (other page scripts load alongside it).
 */
(function () {
  function highlightActiveLink() {
    const pageAliases = {
      "": "user.html",
      user: "user.html",
      "user.html": "user.html",
      "userpage.html": "user.html",
      supervisor: "supervisor.html",
      "supervisor.html": "supervisor.html",
      admin: "admin.html",
      "admin.html": "admin.html",
      "adminpage.html": "admin.html",
    };
    const requestedPage = window.location.pathname.split("/").pop().toLowerCase();
    const currentPage = pageAliases[requestedPage] ?? requestedPage;
    document.querySelectorAll("[data-nav-link]").forEach((link) => {
      const requestedHref = link.getAttribute("href").split("?")[0].toLowerCase();
      const normalizedHref = pageAliases[requestedHref] ?? requestedHref;
      const isActive = normalizedHref === currentPage;
      link.classList.toggle("navbar__link--active", isActive);
      if (isActive) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  function setupMobileMenuToggle() {
    const toggleButton = document.querySelector("[data-nav-toggle]");
    const linksContainer = document.querySelector("[data-nav-links]");
    if (!toggleButton || !linksContainer) return;

    toggleButton.addEventListener("click", () => {
      const isOpen = linksContainer.classList.toggle("navbar__links--open");
      toggleButton.setAttribute("aria-expanded", String(isOpen));
    });
  }

  function initializeNavigation() {
    highlightActiveLink();
    setupMobileMenuToggle();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeNavigation, { once: true });
  } else {
    initializeNavigation();
  }
})();
