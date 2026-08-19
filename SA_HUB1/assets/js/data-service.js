/**
 * The data layer - every category/post/hero slide read and write goes through here.
 *
 * Where the data starts: assets/data/categories.json, posts.json, and hero-slider.json. This
 * tries fetch()-ing those files first, which only works if this project is ever hosted on a real
 * server - fetch() to a local file from a file:// page is blocked by Chrome/Edge's Same-Origin
 * Policy by default, the same "works over http, silently fails when double-clicked" trap as the
 * ES-module restriction documented in utils.js. Confirmed by testing, not assumed: fetch()
 * succeeds in this app's automated dev/preview tooling (which runs Chrome with permissive file
 * flags for its own convenience) and fails in a plain, unmodified Chrome/Edge install opened the
 * normal way. So when the fetch fails, this falls back to assets/data/seed-data.js - a plain
 * classic script (always loads fine under file://) with the exact same data, kept in sync by
 * hand. Either way, the very first thing that happens is converting each record's PascalCase JSON
 * keys (CategoryID, CategoryName, ...) into the camelCase shape every other file in this app
 * already expects (categoryId, categoryName, ...) - see CATEGORY_KEY_MAP etc. below.
 *
 * Where changes actually go: once loaded, everything lives in localStorage for the rest of that
 * browser's use of the app - creating/editing/deleting writes there, not back into the JSON
 * files (a webpage can't write an arbitrary local file without a server, full stop). Reopening
 * the same browser later reads back whatever's in localStorage, not the original JSON again, so
 * admin changes persist across reloads. Clearing this site's browser data resets it back to
 * the original JSON/seed-data.js content.
 *
 * Exposes the exact same CH.* function names the rest of the app already calls
 * (CH.getAllCategories, CH.createPost, CH.setAssignedSupervisorPost, etc.) - category-service.js,
 * post-service.js, hero-slider.js, and every admin-*.js/user-page.js/supervisor-page.js
 * controller are unchanged from every earlier storage backend this app has had. Also exposes
 * CH.loadCategories / CH.loadPosts / CH.loadHeroSlides / CH.getPostsByCategory as the primary
 * read API, with the getAllCategories/getAllPosts/getAllHeroSlides/getPostsByCategoryId names
 * used elsewhere in this app kept as aliases pointing at the same functions.
 *
 * Plain classic script, not an ES module - see utils.js for why. Must load after utils.js
 * (CH.showToast - unused here directly, but keeps load order predictable) and
 * assets/data/seed-data.js (window.CH_SEED_DATA), before category-service.js/post-service.js/
 * hero-slider.js.
 */
window.CH = window.CH || {};

const STORAGE_PREFIX = "communicationhub:";
const CATEGORIES_KEY = `${STORAGE_PREFIX}categories`;
const POSTS_KEY = `${STORAGE_PREFIX}posts`;
const HERO_SLIDES_KEY = `${STORAGE_PREFIX}heroSlides`;

// ---------- JSON <-> internal record shape ----------

const CATEGORY_KEY_MAP = [
  ["categoryId", "CategoryID"],
  ["categoryName", "CategoryName"],
  ["description", "Description"],
  ["image", "Image"],
  ["icon", "Icon"],
  ["createdAt", "CreatedAt"],
  ["updatedAt", "UpdatedAt"],
];
const POST_KEY_MAP = [
  ["postId", "PostID"],
  ["categoryId", "CategoryID"],
  ["title", "Title"],
  ["shortDescription", "ShortDescription"],
  ["fullDescription", "FullDescription"],
  ["image", "Image"],
  ["postDate", "PostDate"],
  ["createdByRole", "CreatedByRole"],
  ["assignedToSupervisor", "AssignedToSupervisor"],
  ["createdAt", "CreatedAt"],
  ["updatedAt", "UpdatedAt"],
];
const HERO_SLIDER_KEY_MAP = [
  ["sliderId", "SliderID"],
  ["title", "Title"],
  ["description", "Description"],
  ["image", "Image"],
  ["linkedPostId", "LinkedPostID"],
  ["displayOrder", "DisplayOrder"],
  ["isActive", "IsActive"],
  ["createdAt", "CreatedAt"],
  ["updatedAt", "UpdatedAt"],
];

function fromJsonShape(record, keyMap) {
  const out = {};
  keyMap.forEach(([camelKey, jsonKey]) => {
    out[camelKey] = record[jsonKey] ?? "";
  });
  return out;
}

// ---------- Loading the starting data (once per page load) ----------

async function fetchJsonFile(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} responded with ${response.status}`);
  return response.json();
}

async function loadStartingRecords() {
  try {
    const [categoriesJson, postsJson, heroSlidesJson] = await Promise.all([
      fetchJsonFile("./assets/data/categories.json"),
      fetchJsonFile("./assets/data/posts.json"),
      fetchJsonFile("./assets/data/hero-slider.json"),
    ]);
    return { categoriesJson, postsJson, heroSlidesJson };
  } catch {
    if (!window.CH_SEED_DATA) {
      throw new Error("No data source available - assets/data/seed-data.js failed to load.");
    }
    return {
      categoriesJson: window.CH_SEED_DATA.categories,
      postsJson: window.CH_SEED_DATA.posts,
      heroSlidesJson: window.CH_SEED_DATA.heroSlides,
    };
  }
}

// ---------- localStorage read/write ----------

function assertStorageAvailable() {
  if (!window.localStorage) {
    throw new Error("This browser has no local storage available for this page. Try a different browser, such as Chrome or Edge.");
  }
}

function readLocalTable(key) {
  assertStorageAvailable();
  const raw = localStorage.getItem(key);
  if (!raw) return null; // null = never seeded yet; [] would mean "seeded, and emptied since"
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeLocalTable(key, records) {
  assertStorageAvailable();
  try {
    localStorage.setItem(key, JSON.stringify(records));
  } catch (error) {
    if (error.name === "QuotaExceededError") {
      throw new Error("Local storage is full. Try removing an image or using a smaller one, then save again.");
    }
    throw error;
  }
}

let cache = null;
let loadPromise = null;

async function ensureLoaded() {
  if (cache) return;
  if (!loadPromise) {
    loadPromise = (async () => {
      const existingCategories = readLocalTable(CATEGORIES_KEY);
      const existingPosts = readLocalTable(POSTS_KEY);
      const existingHeroSlides = readLocalTable(HERO_SLIDES_KEY);

      if (existingCategories && existingPosts && existingHeroSlides) {
        // Already seeded (and possibly edited) in this browser before - use that, not the
        // original JSON again, so admin changes actually stick across reloads.
        cache = { categories: existingCategories, posts: existingPosts, heroSlides: existingHeroSlides };
        return;
      }

      const { categoriesJson, postsJson, heroSlidesJson } = await loadStartingRecords();
      cache = {
        categories: categoriesJson.map((record) => fromJsonShape(record, CATEGORY_KEY_MAP)),
        posts: postsJson.map((record) => fromJsonShape(record, POST_KEY_MAP)),
        heroSlides: heroSlidesJson.map((record) => fromJsonShape(record, HERO_SLIDER_KEY_MAP)),
      };
      writeLocalTable(CATEGORIES_KEY, cache.categories);
      writeLocalTable(POSTS_KEY, cache.posts);
      writeLocalTable(HERO_SLIDES_KEY, cache.heroSlides);
    })().catch((error) => {
      loadPromise = null;
      throw error;
    });
  }
  await loadPromise;
}

function generateId(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}
function nowIso() {
  return new Date().toISOString();
}

// ---------- Categories ----------

function validateCategoryInput({ categoryName, description }) {
  const errors = [];
  if (!categoryName || !categoryName.trim()) errors.push("Category name is required.");
  if (!description || !description.trim()) errors.push("Description is required.");
  return errors;
}
function isDuplicateCategoryName(categories, candidateName, excludeCategoryId) {
  const normalized = candidateName.trim().toLowerCase();
  return categories.some(
    (category) => category.categoryId !== excludeCategoryId && category.categoryName.trim().toLowerCase() === normalized,
  );
}

CH.loadCategories = async function loadCategories() {
  await ensureLoaded();
  return cache.categories;
};
CH.getAllCategories = CH.loadCategories;

CH.getCategoryById = async function getCategoryById(categoryId) {
  await ensureLoaded();
  return cache.categories.find((category) => category.categoryId === categoryId) ?? null;
};

CH.createCategory = async function createCategory({ categoryName, description, image, icon }) {
  await ensureLoaded();
  const errors = validateCategoryInput({ categoryName, description });
  if (!errors.length && isDuplicateCategoryName(cache.categories, categoryName, null)) {
    errors.push("A category with this name already exists.");
  }
  if (errors.length > 0) throw new Error(errors[0]);

  const now = nowIso();
  const category = {
    categoryId: generateId("cat"),
    categoryName: categoryName.trim(),
    description: description.trim(),
    image: image || "",
    icon: icon || "",
    createdAt: now,
    updatedAt: now,
  };
  cache.categories = [...cache.categories, category];
  writeLocalTable(CATEGORIES_KEY, cache.categories);
  return category;
};

CH.updateCategoryById = async function updateCategoryById(categoryId, { categoryName, description, image, icon }) {
  await ensureLoaded();
  const existing = cache.categories.find((category) => category.categoryId === categoryId);
  if (!existing) throw new Error("Category not found.");

  const errors = validateCategoryInput({ categoryName, description });
  if (!errors.length && isDuplicateCategoryName(cache.categories, categoryName, categoryId)) {
    errors.push("A category with this name already exists.");
  }
  if (errors.length > 0) throw new Error(errors[0]);

  const updated = {
    ...existing,
    categoryName: categoryName.trim(),
    description: description.trim(),
    image: image || "",
    icon: icon || "",
    updatedAt: nowIso(),
  };
  cache.categories = cache.categories.map((category) => (category.categoryId === categoryId ? updated : category));
  writeLocalTable(CATEGORIES_KEY, cache.categories);
  return updated;
};

CH.deleteCategoryById = async function deleteCategoryById(categoryId) {
  await ensureLoaded();
  const existing = cache.categories.find((category) => category.categoryId === categoryId);
  if (!existing) throw new Error("Category not found.");

  const posts = await CH.getPostsByCategoryId(categoryId);
  if (posts.length > 0) {
    throw new Error(`This category still has ${posts.length} post(s). Delete them first, then delete the category.`);
  }
  cache.categories = cache.categories.filter((category) => category.categoryId !== categoryId);
  writeLocalTable(CATEGORIES_KEY, cache.categories);
};

// ---------- Posts ----------

const ALLOWED_CREATOR_ROLES = new Set(["Supervisor", "Admin"]);

function validatePostInput({ title, fullDescription, postDate }) {
  const errors = [];
  if (!title || !title.trim()) errors.push("Title is required.");
  if (!fullDescription || !fullDescription.trim()) errors.push("Full description is required.");
  if (postDate && Number.isNaN(Date.parse(postDate))) errors.push("Post date is invalid.");
  return errors;
}

CH.loadPosts = async function loadPosts() {
  await ensureLoaded();
  return cache.posts;
};
CH.getAllPosts = CH.loadPosts;

CH.getPostsByCategory = async function getPostsByCategory(categoryId) {
  await ensureLoaded();
  return cache.posts.filter((post) => post.categoryId === categoryId);
};
CH.getPostsByCategoryId = CH.getPostsByCategory;

CH.getPostById = async function getPostById(postId) {
  await ensureLoaded();
  return cache.posts.find((post) => post.postId === postId) ?? null;
};

CH.createPost = async function createPost({ categoryId, title, shortDescription, fullDescription, image, postDate, createdByRole }) {
  await ensureLoaded();
  const errors = validatePostInput({ title, fullDescription, postDate });
  if (!errors.length && categoryId && !(await CH.getCategoryById(categoryId))) {
    errors.push("The selected category does not exist.");
  }
  if (errors.length > 0) throw new Error(errors[0]);

  const now = nowIso();
  const post = {
    postId: generateId("post"),
    categoryId: categoryId || "",
    title: title.trim(),
    shortDescription: (shortDescription ?? "").trim(),
    fullDescription: fullDescription.trim(),
    image: image || "",
    postDate: postDate || now,
    createdByRole: ALLOWED_CREATOR_ROLES.has(createdByRole) ? createdByRole : "Admin",
    assignedToSupervisor: "false",
    createdAt: now,
    updatedAt: now,
  };
  cache.posts = [...cache.posts, post];
  writeLocalTable(POSTS_KEY, cache.posts);
  return post;
};

CH.updatePostById = async function updatePostById(postId, { categoryId, title, shortDescription, fullDescription, image, postDate }) {
  await ensureLoaded();
  const existing = cache.posts.find((post) => post.postId === postId);
  if (!existing) throw new Error("Post not found.");

  const errors = validatePostInput({ title, fullDescription, postDate });
  if (!errors.length && categoryId && !(await CH.getCategoryById(categoryId))) {
    errors.push("The selected category does not exist.");
  }
  if (errors.length > 0) throw new Error(errors[0]);

  const updated = {
    ...existing,
    categoryId: categoryId || "",
    title: title.trim(),
    shortDescription: (shortDescription ?? "").trim(),
    fullDescription: fullDescription.trim(),
    image: image || "",
    postDate: postDate || existing.postDate,
    updatedAt: nowIso(),
  };
  cache.posts = cache.posts.map((post) => (post.postId === postId ? updated : post));
  writeLocalTable(POSTS_KEY, cache.posts);
  return updated;
};

CH.deletePostById = async function deletePostById(postId) {
  await ensureLoaded();
  const existing = cache.posts.find((post) => post.postId === postId);
  if (!existing) throw new Error("Post not found.");
  cache.posts = cache.posts.filter((post) => post.postId !== postId);
  writeLocalTable(POSTS_KEY, cache.posts);
};

CH.getAssignedSupervisorPost = async function getAssignedSupervisorPost() {
  await ensureLoaded();
  return cache.posts.find((post) => post.assignedToSupervisor === "true") ?? null;
};

/** Exclusive, like a single radio button: assigning one post clears the flag from every other post. */
CH.setAssignedSupervisorPost = async function setAssignedSupervisorPost(postId) {
  await ensureLoaded();
  if (postId && !cache.posts.some((post) => post.postId === postId)) {
    throw new Error("Post not found.");
  }
  const now = nowIso();
  let assignedRecord = null;
  cache.posts = cache.posts.map((post) => {
    if (post.postId === postId) {
      const record = { ...post, assignedToSupervisor: "true", updatedAt: now };
      assignedRecord = record;
      return record;
    }
    if (post.assignedToSupervisor === "true") {
      return { ...post, assignedToSupervisor: "false" };
    }
    return post;
  });
  writeLocalTable(POSTS_KEY, cache.posts);
  return assignedRecord;
};

// ---------- Hero slider ----------

function validateHeroSlideInput({ title, description }) {
  const errors = [];
  if (!title || !title.trim()) errors.push("Title is required.");
  if (!description || !description.trim()) errors.push("Short description is required.");
  return errors;
}

CH.loadHeroSlides = async function loadHeroSlides() {
  await ensureLoaded();
  return [...cache.heroSlides].sort((a, b) => Number(a.displayOrder) - Number(b.displayOrder));
};
CH.getAllHeroSlides = CH.loadHeroSlides;

CH.getActiveHeroSlides = async function getActiveHeroSlides() {
  const slides = await CH.loadHeroSlides();
  return slides.filter((slide) => slide.isActive === "true" || slide.isActive === "TRUE");
};

CH.getHeroSlideById = async function getHeroSlideById(sliderId) {
  await ensureLoaded();
  return cache.heroSlides.find((slide) => slide.sliderId === sliderId) ?? null;
};

CH.createHeroSlide = async function createHeroSlide({ title, description, image, linkedPostId, isActive }) {
  await ensureLoaded();
  const errors = validateHeroSlideInput({ title, description });
  if (linkedPostId && !(await CH.getPostById(linkedPostId))) {
    errors.push("The linked post does not exist.");
  }
  if (errors.length > 0) throw new Error(errors[0]);

  const now = nowIso();
  const slide = {
    sliderId: generateId("slide"),
    title: title.trim(),
    description: description.trim(),
    image: image || "",
    linkedPostId: linkedPostId || "",
    displayOrder: cache.heroSlides.length + 1,
    isActive: isActive === false ? "false" : "true",
    createdAt: now,
    updatedAt: now,
  };
  cache.heroSlides = [...cache.heroSlides, slide];
  writeLocalTable(HERO_SLIDES_KEY, cache.heroSlides);
  return slide;
};

CH.updateHeroSlideById = async function updateHeroSlideById(sliderId, { title, description, image, linkedPostId, isActive }) {
  await ensureLoaded();
  const existing = cache.heroSlides.find((slide) => slide.sliderId === sliderId);
  if (!existing) throw new Error("Slide not found.");

  const errors = validateHeroSlideInput({ title, description });
  if (linkedPostId && !(await CH.getPostById(linkedPostId))) {
    errors.push("The linked post does not exist.");
  }
  if (errors.length > 0) throw new Error(errors[0]);

  const updated = {
    ...existing,
    title: title.trim(),
    description: description.trim(),
    image: image || "",
    linkedPostId: linkedPostId || "",
    isActive: isActive === false ? "false" : "true",
    updatedAt: nowIso(),
  };
  cache.heroSlides = cache.heroSlides.map((slide) => (slide.sliderId === sliderId ? updated : slide));
  writeLocalTable(HERO_SLIDES_KEY, cache.heroSlides);
  return updated;
};

CH.toggleHeroSlideActive = async function toggleHeroSlideActive(sliderId, isActive) {
  await ensureLoaded();
  const existing = cache.heroSlides.find((slide) => slide.sliderId === sliderId);
  if (!existing) throw new Error("Slide not found.");
  const updated = { ...existing, isActive: isActive ? "true" : "false", updatedAt: nowIso() };
  cache.heroSlides = cache.heroSlides.map((slide) => (slide.sliderId === sliderId ? updated : slide));
  writeLocalTable(HERO_SLIDES_KEY, cache.heroSlides);
  return updated;
};

CH.deleteHeroSlideById = async function deleteHeroSlideById(sliderId) {
  await ensureLoaded();
  const existing = cache.heroSlides.find((slide) => slide.sliderId === sliderId);
  if (!existing) throw new Error("Slide not found.");
  cache.heroSlides = cache.heroSlides.filter((slide) => slide.sliderId !== sliderId);
  writeLocalTable(HERO_SLIDES_KEY, cache.heroSlides);
};

/** Applies a new relative order to every listed slide in one pass (used by the up/down reorder controls). */
CH.reorderHeroSlides = async function reorderHeroSlides(orderedSliderIds) {
  await ensureLoaded();
  const now = nowIso();
  const bySliderId = new Map(cache.heroSlides.map((slide) => [slide.sliderId, slide]));
  orderedSliderIds.forEach((sliderId, index) => {
    const existing = bySliderId.get(sliderId);
    if (existing) bySliderId.set(sliderId, { ...existing, displayOrder: index + 1, updatedAt: now });
  });
  cache.heroSlides = Array.from(bySliderId.values());
  writeLocalTable(HERO_SLIDES_KEY, cache.heroSlides);
};
