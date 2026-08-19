/**
 * Hero carousel rendering + the heroSlideService wrapper around sp-data.js.
 *
 * Plain classic script, not an ES module - see utils.js for why. Attaches to window.CH.
 */
window.CH = window.CH || {};

CH.heroSlideService = {
  getAll: () => CH.getAllHeroSlides(),
  getActive: () => CH.getActiveHeroSlides(),
  create: (slideData) => CH.createHeroSlide(slideData),
  update: (sliderId, slideData) => CH.updateHeroSlideById(sliderId, slideData),
  toggleActive: (sliderId, isActive) => CH.toggleHeroSlideActive(sliderId, isActive),
  reorder: (orderedSliderIds) => CH.reorderHeroSlides(orderedSliderIds),
  remove: (sliderId) => CH.deleteHeroSlideById(sliderId),
};

const AUTOPLAY_MS = 6000;

/**
 * Renders an auto-advancing hero carousel into `container` and wires up its interactions.
 * Reused on Userpage.html (public display) and the Admin Hero Slider live preview.
 *
 * @param {HTMLElement} container
 * @param {Array<{sliderId:string,title:string,description:string,image:string,linkedPostId:string}>} slides
 * @param {{
 *   resolvePostHref?: (postId: string) => string,
 *   resolveLinkedPostMeta?: (postId: string) => {categoryName: string, publishDate: string} | null,
 *   browseAllHref?: string,
 * }} [options]
 */
CH.renderHeroSlider = function renderHeroSlider(container, slides, options = {}) {
  const { resolvePostHref, resolveLinkedPostMeta, browseAllHref = "#categoriesView" } = options;

  if (!slides || slides.length === 0) {
    container.innerHTML = "";
    container.hidden = true;
    return;
  }
  container.hidden = false;

  let index = 0;
  let autoplayId = null;

  function renderCurrentSlide() {
    const slide = slides[index];
    const hasImage = Boolean(slide.image);
    const postHref = slide.linkedPostId && resolvePostHref ? resolvePostHref(slide.linkedPostId) : null;
    const linkedMeta =
      slide.linkedPostId && resolveLinkedPostMeta ? resolveLinkedPostMeta(slide.linkedPostId) : null;

    container.innerHTML = `
      <div class="hero-slider" tabindex="0" role="region" aria-roledescription="carousel" aria-label="Featured announcements">
        <div class="hero-slider__decoration hero-slider__decoration--one" aria-hidden="true"></div>
        <div class="hero-slider__decoration hero-slider__decoration--two" aria-hidden="true"></div>
        <div class="hero-slider__slide ${hasImage ? "hero-slider__slide--with-image" : ""}">
          <div class="hero-slider__content">
            <h2 class="hero-slider__title">${CH.escapeHtml(slide.title)}</h2>
            <p class="hero-slider__description">${CH.escapeHtml(slide.description)}</p>
            <div class="hero-slider__actions">
              ${postHref ? `<a class="btn hero-slider__btn-primary" href="${CH.escapeHtml(postHref)}">View announcement</a>` : ""}
              <a class="btn hero-slider__btn-secondary" href="${CH.escapeHtml(browseAllHref)}">Browse all</a>
            </div>
          </div>
          ${
            hasImage
              ? `
            <div class="hero-slider__image-card">
              <div class="hero-slider__image-shadow" aria-hidden="true"></div>
              <div class="hero-slider__image-frame">
                <img src="${CH.escapeHtml(slide.image)}" alt="" class="hero-slider__image">
                <div class="hero-slider__image-caption">
                  ${linkedMeta ? `<span class="hero-slider__image-category">${CH.escapeHtml(linkedMeta.categoryName)}</span>` : ""}
                  <p class="hero-slider__image-title">${CH.escapeHtml(slide.title)}</p>
                  ${linkedMeta ? `<p class="hero-slider__image-date">${CH.formatDate(linkedMeta.publishDate)}</p>` : ""}
                </div>
              </div>
            </div>
          `
              : ""
          }
        </div>
        ${
          slides.length > 1
            ? `
          <div class="hero-slider__controls">
            <div class="hero-slider__indicators" role="tablist" aria-label="Slides">
              ${slides
                .map(
                  (_, slideIndex) => `
                <button
                  type="button"
                  role="tab"
                  aria-selected="${slideIndex === index}"
                  aria-label="Go to slide ${slideIndex + 1}"
                  class="hero-slider__dot ${slideIndex === index ? "hero-slider__dot--active" : ""}"
                  data-goto="${slideIndex}"
                ></button>
              `,
                )
                .join("")}
            </div>
            <div class="hero-slider__nav">
              <button type="button" class="hero-slider__nav-button" data-prev aria-label="Previous slide">${CH.icon("chevronLeft")}</button>
              <button type="button" class="hero-slider__nav-button" data-next aria-label="Next slide">${CH.icon("chevronRight")}</button>
            </div>
          </div>
        `
            : ""
        }
      </div>
    `;

    container.querySelectorAll("[data-goto]").forEach((dot) => {
      dot.addEventListener("click", () => goTo(Number(dot.dataset.goto)));
    });
    container.querySelector("[data-prev]")?.addEventListener("click", () => goTo(index - 1));
    container.querySelector("[data-next]")?.addEventListener("click", () => goTo(index + 1));
  }

  function goTo(newIndex) {
    index = ((newIndex % slides.length) + slides.length) % slides.length;
    renderCurrentSlide();
  }

  function startAutoplay() {
    if (slides.length <= 1) return;
    stopAutoplay();
    autoplayId = setInterval(() => goTo(index + 1), AUTOPLAY_MS);
  }

  function stopAutoplay() {
    if (autoplayId) clearInterval(autoplayId);
    autoplayId = null;
  }

  container.addEventListener("mouseenter", stopAutoplay);
  container.addEventListener("mouseleave", startAutoplay);
  container.addEventListener("focusin", stopAutoplay);
  container.addEventListener("focusout", startAutoplay);
  container.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(index - 1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      goTo(index + 1);
    }
  });

  renderCurrentSlide();
  startAutoplay();
};
