/**
 * The data layer: every read and write in the app goes through the CH.* functions defined here,
 * and three SharePoint lists are the only place any of it lives.
 *
 * The controllers - category-service.js, post-service.js, hero-slider.js and every admin-*.js /
 * user-page.js / supervisor-page.js - call these functions and know nothing about SharePoint.
 *
 *   Categories  -> cache.categories
 *   Posts       -> cache.posts
 *   HeroSlides  -> cache.heroSlides
 *
 * Each record carries two extra fields the controllers ignore: `spItemId`, the list item ID used
 * to address the row for an update or a delete, and `imageRef`, the stored pointer that `image`
 * is the display URL for.
 *
 * Writes go to SharePoint first and update the in-memory cache only once the server has agreed,
 * so nothing on screen can claim to be saved when it isn't. Where an operation genuinely spans
 * several rows - assigning the Supervisor's post, reordering slides - a failure part-way through
 * re-reads everything rather than guessing which half landed.
 *
 * Plain classic script, not an ES module - see utils.js for why. Loads after sp-rest.js and
 * image-store.js.
 */
window.CH = window.CH || {};

(function () {
  // ---------- Field mapping ----------
  //
  // `field` is the SharePoint *internal* column name, which is what REST speaks. Custom columns
  // are prefixed CH so they can never collide with a built-in or inherited site column; their
  // display names in the SharePoint UI are the readable ones an admin sees ("Category ID",
  // "Created At"). Title is the exception - every list has one, and it is the natural home for
  // each record's human-readable name.

  const CATEGORY_FIELDS = [
    { key: "categoryId", field: "CHCategoryID", type: "text" },
    { key: "categoryName", field: "Title", type: "text" },
    { key: "description", field: "CHDescription", type: "text" },
    { key: "imageRef", field: "CHImageRef", type: "text" },
    { key: "icon", field: "CHIcon", type: "text" },
    { key: "createdAt", field: "CHCreatedAt", type: "date" },
    { key: "updatedAt", field: "CHUpdatedAt", type: "date" },
  ];

  const POST_FIELDS = [
    { key: "postId", field: "CHPostID", type: "text" },
    { key: "categoryId", field: "CHCategoryID", type: "text" },
    { key: "title", field: "Title", type: "text" },
    { key: "shortDescription", field: "CHShortDescription", type: "text" },
    { key: "fullDescription", field: "CHFullDescription", type: "text" },
    { key: "imageRef", field: "CHImageRef", type: "text" },
    { key: "postDate", field: "CHPostDate", type: "date" },
    { key: "createdByRole", field: "CHCreatedByRole", type: "text" },
    { key: "assignedToSupervisor", field: "CHAssignedToSupervisor", type: "boolText" },
    { key: "createdAt", field: "CHCreatedAt", type: "date" },
    { key: "updatedAt", field: "CHUpdatedAt", type: "date" },
  ];

  const HERO_SLIDE_FIELDS = [
    { key: "sliderId", field: "CHSliderID", type: "text" },
    { key: "title", field: "Title", type: "text" },
    { key: "description", field: "CHDescription", type: "text" },
    { key: "imageRef", field: "CHImageRef", type: "text" },
    { key: "linkedPostId", field: "CHLinkedPostID", type: "text" },
    { key: "displayOrder", field: "CHDisplayOrder", type: "number" },
    { key: "isActive", field: "CHIsActive", type: "boolText" },
    { key: "createdAt", field: "CHCreatedAt", type: "date" },
    { key: "updatedAt", field: "CHUpdatedAt", type: "date" },
  ];

  const COLLECTIONS = {
    categories: { fields: CATEGORY_FIELDS, listKey: "categories", imagePrefix: "category" },
    posts: { fields: POST_FIELDS, listKey: "posts", imagePrefix: "post" },
    heroSlides: { fields: HERO_SLIDE_FIELDS, listKey: "heroSlides", imagePrefix: "slide" },
  };

  function listTitle(collectionName) {
    return CH.config.lists[COLLECTIONS[collectionName].listKey];
  }

  // ---------- Type conversion ----------

  /**
   * SharePoint returns real types - booleans for Yes/No, numbers for Number, ISO strings for
   * Date - while the controllers expect strings throughout and compare flags with === "true".
   * Normalising in one place here keeps that difference out of a dozen call sites.
   */
  function fromSharePoint(definition, raw) {
    if (raw === null || raw === undefined) {
      return definition.type === "boolText" ? "false" : "";
    }
    switch (definition.type) {
      case "boolText":
        return raw === true || raw === "true" || raw === 1 ? "true" : "false";
      case "number":
        return Number.isFinite(Number(raw)) ? Number(raw) : 0;
      case "date": {
        const date = new Date(raw);
        return Number.isNaN(date.getTime()) ? "" : date.toISOString();
      }
      default:
        return String(raw);
    }
  }

  function toSharePoint(definition, value) {
    switch (definition.type) {
      case "boolText":
        return value === true || value === "true";
      case "number":
        return Number(value) || 0;
      case "date": {
        if (!value) return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
      }
      default:
        return value === null || value === undefined ? "" : String(value);
    }
  }

  function recordFromItem(item, fields) {
    const record = { spItemId: item.Id };
    fields.forEach((definition) => {
      record[definition.key] = fromSharePoint(definition, item[definition.field]);
    });
    record.image = CH.imageStore.resolve(record.imageRef);
    return record;
  }

  /** Builds the write payload, skipping any key the caller didn't supply. */
  function fieldsFromRecord(record, fields) {
    const payload = {};
    fields.forEach((definition) => {
      if (!(definition.key in record)) return;
      payload[definition.field] = toSharePoint(definition, record[definition.key]);
    });
    return payload;
  }

  // ---------- Loading ----------

  let cache = null;
  let loadPromise = null;

  async function fetchCollection(collectionName) {
    const { fields } = COLLECTIONS[collectionName];
    const select = ["Id", ...fields.map((definition) => definition.field)].join(",");
    const items = await CH.sp.readAll(
      CH.sp.listItemsPath(listTitle(collectionName), `$select=${select}&$top=5000`),
    );
    return items.map((item) => recordFromItem(item, fields));
  }

  async function loadAll() {
    const [categories, posts, heroSlides] = await Promise.all([
      fetchCollection("categories"),
      fetchCollection("posts"),
      fetchCollection("heroSlides"),
    ]);
    cache = { categories, posts, heroSlides };
    CH.clearAppStatus();
  }

  async function ensureLoaded() {
    if (cache) return;
    if (!loadPromise) {
      loadPromise = loadAll().catch((error) => {
        loadPromise = null;
        CH.showAppStatus(error.message);
        throw error;
      });
    }
    await loadPromise;
  }

  /**
   * Throws the cached copy away and re-reads everything. This is what an admin's edit in
   * SharePoint ultimately triggers in every open browser (via sync.js), and what a partially
   * applied multi-row write falls back to.
   */
  async function reloadAll() {
    const previous = cache;
    try {
      await loadAll();
    } catch (error) {
      cache = previous; // a failed refresh keeps the last good data on screen rather than blanking it
      throw error;
    }
  }

  // ---------- Writing ----------

  /** Tells sync.js this tab caused the change, so it re-baselines instead of re-fetching. */
  function announceLocalWrite() {
    window.dispatchEvent(new CustomEvent("data:localwrite"));
  }

  async function createItem(collectionName, record) {
    const { fields } = COLLECTIONS[collectionName];
    const created = await CH.sp.createListItem(listTitle(collectionName), fieldsFromRecord(record, fields));
    announceLocalWrite();
    const spItemId = created?.d?.Id ?? created?.Id;
    return { ...record, spItemId, image: CH.imageStore.resolve(record.imageRef) };
  }

  async function patchItem(collectionName, spItemId, changes) {
    const { fields } = COLLECTIONS[collectionName];
    await CH.sp.updateListItem(listTitle(collectionName), spItemId, fieldsFromRecord(changes, fields));
    announceLocalWrite();
  }

  async function deleteItem(collectionName, spItemId) {
    await CH.sp.deleteListItem(listTitle(collectionName), spItemId);
    announceLocalWrite();
  }

  // ---------- Image plumbing shared by the create/update paths ----------

  /**
   * A form hands back whatever was in `record.image` when the user didn't pick a new file - a
   * URL that already points at the stored file - so "unchanged" needs recognising rather than
   * re-uploading. Only a data: URL means a genuinely new picture.
   */
  async function resolveIncomingImage(incomingImage, imagePrefix) {
    if (!incomingImage) return "";
    if (typeof incomingImage === "string" && incomingImage.startsWith("data:")) {
      return CH.imageStore.upload(incomingImage, imagePrefix);
    }
    return String(incomingImage).trim();
  }

  /** The hero slider can copy a post's picture onto a slide, so one file can have two owners. */
  function isImageRefStillInUse(ref, excluding) {
    if (!ref) return false;
    const resolved = CH.imageStore.resolve(ref);
    return [...cache.categories, ...cache.posts, ...cache.heroSlides].some(
      (record) => record !== excluding && record.imageRef && CH.imageStore.resolve(record.imageRef) === resolved,
    );
  }

  async function discardUnusedImage(previousRef, nextRef, owningRecord) {
    if (!previousRef || previousRef === nextRef) return;
    if (CH.imageStore.resolve(previousRef) === CH.imageStore.resolve(nextRef)) return;
    if (isImageRefStillInUse(previousRef, owningRecord)) return;
    await CH.imageStore.remove(previousRef);
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

  CH.getAllCategories = async function getAllCategories() {
    await ensureLoaded();
    return cache.categories;
  };

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
    const imageRef = await resolveIncomingImage(image, COLLECTIONS.categories.imagePrefix);
    const category = await createItem("categories", {
      categoryId: generateId("cat"),
      categoryName: categoryName.trim(),
      description: description.trim(),
      imageRef,
      icon: icon || "",
      createdAt: now,
      updatedAt: now,
    });
    cache.categories = [...cache.categories, category];
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

    const imageRef = await resolveIncomingImage(image, COLLECTIONS.categories.imagePrefix);
    const changes = {
      categoryName: categoryName.trim(),
      description: description.trim(),
      imageRef,
      icon: icon || "",
      updatedAt: nowIso(),
    };
    await patchItem("categories", existing.spItemId, changes);

    const updated = { ...existing, ...changes, image: CH.imageStore.resolve(imageRef) };
    cache.categories = cache.categories.map((category) => (category.categoryId === categoryId ? updated : category));
    await discardUnusedImage(existing.imageRef, imageRef, updated);
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
    await deleteItem("categories", existing.spItemId);
    cache.categories = cache.categories.filter((category) => category.categoryId !== categoryId);
    await discardUnusedImage(existing.imageRef, "", existing);
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

  CH.getAllPosts = async function getAllPosts() {
    await ensureLoaded();
    return cache.posts;
  };

  CH.getPostsByCategoryId = async function getPostsByCategoryId(categoryId) {
    await ensureLoaded();
    return cache.posts.filter((post) => post.categoryId === categoryId);
  };

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
    const imageRef = await resolveIncomingImage(image, COLLECTIONS.posts.imagePrefix);
    const post = await createItem("posts", {
      postId: generateId("post"),
      categoryId: categoryId || "",
      title: title.trim(),
      shortDescription: (shortDescription ?? "").trim(),
      fullDescription: fullDescription.trim(),
      imageRef,
      postDate: postDate || now,
      createdByRole: ALLOWED_CREATOR_ROLES.has(createdByRole) ? createdByRole : "Admin",
      assignedToSupervisor: "false",
      createdAt: now,
      updatedAt: now,
    });
    cache.posts = [...cache.posts, post];
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

    const imageRef = await resolveIncomingImage(image, COLLECTIONS.posts.imagePrefix);
    const changes = {
      categoryId: categoryId || "",
      title: title.trim(),
      shortDescription: (shortDescription ?? "").trim(),
      fullDescription: fullDescription.trim(),
      imageRef,
      postDate: postDate || existing.postDate,
      updatedAt: nowIso(),
    };
    await patchItem("posts", existing.spItemId, changes);

    const updated = { ...existing, ...changes, image: CH.imageStore.resolve(imageRef) };
    cache.posts = cache.posts.map((post) => (post.postId === postId ? updated : post));
    await discardUnusedImage(existing.imageRef, imageRef, updated);
    return updated;
  };

  CH.deletePostById = async function deletePostById(postId) {
    await ensureLoaded();
    const existing = cache.posts.find((post) => post.postId === postId);
    if (!existing) throw new Error("Post not found.");
    await deleteItem("posts", existing.spItemId);
    cache.posts = cache.posts.filter((post) => post.postId !== postId);
    await discardUnusedImage(existing.imageRef, "", existing);
  };

  CH.getAssignedSupervisorPost = async function getAssignedSupervisorPost() {
    await ensureLoaded();
    return cache.posts.find((post) => post.assignedToSupervisor === "true") ?? null;
  };

  /**
   * Exclusive, like a single radio button: assigning one post clears the flag from every other
   * post. That spans several rows, so each write is applied in turn and a failure part-way
   * through re-reads the list rather than leaving the cache describing a state SharePoint isn't
   * actually in.
   */
  CH.setAssignedSupervisorPost = async function setAssignedSupervisorPost(postId) {
    await ensureLoaded();
    if (postId && !cache.posts.some((post) => post.postId === postId)) {
      throw new Error("Post not found.");
    }
    const now = nowIso();
    const toClear = cache.posts.filter((post) => post.assignedToSupervisor === "true" && post.postId !== postId);
    const toAssign = postId ? cache.posts.find((post) => post.postId === postId) : null;

    try {
      for (const post of toClear) {
        await patchItem("posts", post.spItemId, { assignedToSupervisor: "false" });
      }
      if (toAssign) {
        await patchItem("posts", toAssign.spItemId, { assignedToSupervisor: "true", updatedAt: now });
      }
    } catch (error) {
      await reloadAll();
      throw error;
    }

    let assignedRecord = null;
    cache.posts = cache.posts.map((post) => {
      if (post.postId === postId) {
        assignedRecord = { ...post, assignedToSupervisor: "true", updatedAt: now };
        return assignedRecord;
      }
      if (post.assignedToSupervisor === "true") return { ...post, assignedToSupervisor: "false" };
      return post;
    });
    return assignedRecord;
  };

  // ---------- Hero slider ----------

  function validateHeroSlideInput({ title, description }) {
    const errors = [];
    if (!title || !title.trim()) errors.push("Title is required.");
    if (!description || !description.trim()) errors.push("Short description is required.");
    return errors;
  }

  CH.getAllHeroSlides = async function getAllHeroSlides() {
    await ensureLoaded();
    return [...cache.heroSlides].sort((a, b) => Number(a.displayOrder) - Number(b.displayOrder));
  };

  CH.getActiveHeroSlides = async function getActiveHeroSlides() {
    const slides = await CH.getAllHeroSlides();
    return slides.filter((slide) => slide.isActive === "true");
  };

  CH.createHeroSlide = async function createHeroSlide({ title, description, image, linkedPostId, isActive }) {
    await ensureLoaded();
    const errors = validateHeroSlideInput({ title, description });
    if (linkedPostId && !(await CH.getPostById(linkedPostId))) {
      errors.push("The linked post does not exist.");
    }
    if (errors.length > 0) throw new Error(errors[0]);

    const now = nowIso();
    const imageRef = await resolveIncomingImage(image, COLLECTIONS.heroSlides.imagePrefix);
    const slide = await createItem("heroSlides", {
      sliderId: generateId("slide"),
      title: title.trim(),
      description: description.trim(),
      imageRef,
      linkedPostId: linkedPostId || "",
      displayOrder: cache.heroSlides.length + 1,
      isActive: isActive === false ? "false" : "true",
      createdAt: now,
      updatedAt: now,
    });
    cache.heroSlides = [...cache.heroSlides, slide];
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

    const imageRef = await resolveIncomingImage(image, COLLECTIONS.heroSlides.imagePrefix);
    const changes = {
      title: title.trim(),
      description: description.trim(),
      imageRef,
      linkedPostId: linkedPostId || "",
      isActive: isActive === false ? "false" : "true",
      updatedAt: nowIso(),
    };
    await patchItem("heroSlides", existing.spItemId, changes);

    const updated = { ...existing, ...changes, image: CH.imageStore.resolve(imageRef) };
    cache.heroSlides = cache.heroSlides.map((slide) => (slide.sliderId === sliderId ? updated : slide));
    await discardUnusedImage(existing.imageRef, imageRef, updated);
    return updated;
  };

  CH.toggleHeroSlideActive = async function toggleHeroSlideActive(sliderId, isActive) {
    await ensureLoaded();
    const existing = cache.heroSlides.find((slide) => slide.sliderId === sliderId);
    if (!existing) throw new Error("Slide not found.");
    const changes = { isActive: isActive ? "true" : "false", updatedAt: nowIso() };
    await patchItem("heroSlides", existing.spItemId, changes);
    const updated = { ...existing, ...changes };
    cache.heroSlides = cache.heroSlides.map((slide) => (slide.sliderId === sliderId ? updated : slide));
    return updated;
  };

  CH.deleteHeroSlideById = async function deleteHeroSlideById(sliderId) {
    await ensureLoaded();
    const existing = cache.heroSlides.find((slide) => slide.sliderId === sliderId);
    if (!existing) throw new Error("Slide not found.");
    await deleteItem("heroSlides", existing.spItemId);
    cache.heroSlides = cache.heroSlides.filter((slide) => slide.sliderId !== sliderId);
    await discardUnusedImage(existing.imageRef, "", existing);
  };

  /** Applies a new relative order to every listed slide in one pass (the up/down controls). */
  CH.reorderHeroSlides = async function reorderHeroSlides(orderedSliderIds) {
    await ensureLoaded();
    const now = nowIso();
    const bySliderId = new Map(cache.heroSlides.map((slide) => [slide.sliderId, slide]));

    try {
      for (let index = 0; index < orderedSliderIds.length; index += 1) {
        const existing = bySliderId.get(orderedSliderIds[index]);
        if (!existing || Number(existing.displayOrder) === index + 1) continue;
        await patchItem("heroSlides", existing.spItemId, { displayOrder: index + 1, updatedAt: now });
      }
    } catch (error) {
      await reloadAll();
      throw error;
    }

    orderedSliderIds.forEach((sliderId, index) => {
      const existing = bySliderId.get(sliderId);
      if (existing) bySliderId.set(sliderId, { ...existing, displayOrder: index + 1, updatedAt: now });
    });
    cache.heroSlides = Array.from(bySliderId.values());
  };

  // ---------- Exposed for sync.js ----------

  CH.db = {
    reloadAll,
    isLoaded: () => cache !== null,
    listTitles: () => Object.keys(COLLECTIONS).reduce((all, name) => ({ ...all, [name]: listTitle(name) }), {}),
  };
})();
