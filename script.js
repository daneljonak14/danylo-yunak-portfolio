const persistentProjects = Array.isArray(window.publishedProjects)
  ? window.publishedProjects
  : [];

const DB_NAME = "motion-portfolio-db";
const DB_VERSION = 1;
const STORE_NAME = "uploads";
const PROJECT_OVERRIDES_KEY = "motion-portfolio-project-overrides";
const PROJECT_HIDDEN_KEY = "motion-portfolio-project-hidden";
const QUICK_TAGS_KEY = "motion-portfolio-quick-tags";
const PUBLISHED_PROJECTS_KEY = "motion-portfolio-published-projects";

const galleryGrid = document.getElementById("galleryGrid");
const emptyStateTemplate = document.getElementById("emptyStateTemplate");
const mediaInput = document.getElementById("mediaInput");
const uploadZone = document.getElementById("uploadZone");
const uploadForm = document.getElementById("uploadForm");
const titleInput = document.getElementById("projectTitle");
const descriptionInput = document.getElementById("projectDescription");
const tagsInput = document.getElementById("projectTags");
const filterBar = document.getElementById("filterBar");
const storageNote = document.getElementById("storageNote");
const tagSuggestions = document.getElementById("tagSuggestions");
const restoreButton = document.getElementById("restoreButton");
const newQuickTagInput = document.getElementById("newQuickTag");
const addQuickTagButton = document.getElementById("addQuickTagButton");
const publishOutput = document.getElementById("publishOutput");
const publishNote = document.getElementById("publishNote");
const copyPublishButton = document.getElementById("copyPublishButton");
const publishAllButton = document.getElementById("publishAllButton");

const state = {
  uploadedItems: [],
  activeTag: "All",
  editingId: null,
  projectOverrides: loadProjectOverrides(),
  hiddenProjectIds: loadHiddenProjectIds(),
  publishSnippet: "",
  quickTags: loadQuickTags(),
};

init();

async function init() {
  state.uploadedItems = await loadUploadsFromDb();
  bindEvents();
  render();
}

function bindEvents() {
  mediaInput.addEventListener("change", (event) => {
    const files = Array.from(event.target.files || []);
    updateUploadZoneLabel(files);
  });

  uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const files = Array.from(mediaInput.files || []);
    await handleFiles(files);
  });

  restoreButton.addEventListener("click", async () => {
    await restoreDeletedItems();
  });

  addQuickTagButton.addEventListener("click", () => {
    addQuickTag(newQuickTagInput.value);
  });

  newQuickTagInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addQuickTag(newQuickTagInput.value);
    }
  });

  copyPublishButton.addEventListener("click", async () => {
    if (!state.publishSnippet) {
      return;
    }

    try {
      await navigator.clipboard.writeText(state.publishSnippet);
      publishNote.textContent = "Snippet copied. Paste it into published-projects.js.";
    } catch (error) {
      console.error(error);
      publishNote.textContent = "Copy failed. Select the snippet manually and paste it into published-projects.js.";
    }
  });

  publishAllButton.addEventListener("click", () => {
    const visibleProjects = getAllProjects().filter(matchesActiveTag);
    if (visibleProjects.length === 0) {
      state.publishSnippet = "";
      publishNote.textContent = "No visible projects to publish right now.";
      render();
      return;
    }

    savePublishedProjects(visibleProjects.map(toPublishedProject));
    state.publishSnippet = visibleProjects.map((project) => buildPublishSnippet(project)).join("\n");
    publishNote.textContent =
      "All visible projects published locally for the share page. Paste the full block into published-projects.js when you want the same result on GitHub Pages.";
    render();
    publishOutput.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    uploadZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      uploadZone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    uploadZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      uploadZone.classList.remove("dragover");
    });
  });

  uploadZone.addEventListener("drop", async (event) => {
    const files = Array.from(event.dataTransfer?.files || []);
    mediaInput.files = event.dataTransfer.files;
    updateUploadZoneLabel(files);
    await handleFiles(files);
  });
}

async function handleFiles(files) {
  const supportedFiles = files.filter(isSupportedFile);
  if (supportedFiles.length === 0) {
    storageNote.textContent = "Choose at least one GIF, MP4, or MOV file.";
    return;
  }

  const title = titleInput.value.trim();
  const description = descriptionInput.value.trim();
  const tags = parseTags(tagsInput.value);

  const uploadedItems = await Promise.all(
    supportedFiles.map(async (file, index) => {
      const id = `${Date.now()}-${index}-${file.name}`;
      return {
        id,
        title: title || file.name.replace(/\.[^.]+$/, ""),
        description:
          description || "Saved in this browser for preview and portfolio review.",
        type: getMediaType(file.name, file.type),
        src: URL.createObjectURL(file),
        format: getFormatLabel(file.name),
        tags: tags.length > 0 ? tags : ["General"],
        storage: "browser",
        blob: file,
      };
    }),
  );

  for (const item of uploadedItems) {
    await saveUploadToDb(item);
  }

  state.uploadedItems = [...uploadedItems, ...state.uploadedItems];
  resetUploadForm();
  storageNote.textContent =
    "Saved in this browser. For recruiter-ready permanent files, also place them in the media folder and keep them in the project.";
  render();
}

function render() {
  const allProjects = getAllProjects();
  const availableTags = getAllTags(allProjects);
  if (!availableTags.includes(state.activeTag)) {
    state.activeTag = "All";
  }
  const visibleProjects = allProjects.filter(matchesActiveTag);

  galleryGrid.innerHTML = "";
  renderFilters(allProjects);
  renderQuickTags();
  restoreButton.disabled = state.hiddenProjectIds.length === 0;
  copyPublishButton.disabled = !state.publishSnippet;
  publishOutput.textContent = state.publishSnippet;

  let renderedProjects = 0;

  for (const project of visibleProjects) {
    const card = createProjectCard(project);
    if (card) {
      galleryGrid.append(card);
      renderedProjects += 1;
    }
  }

  if (renderedProjects === 0) {
    galleryGrid.append(emptyStateTemplate.content.cloneNode(true));
  }
}

function renderFilters(projects) {
  const tags = getAllTags(projects);

  filterBar.innerHTML = "";

  for (const tag of tags) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = tag === state.activeTag ? "filter-chip active" : "filter-chip";
    button.textContent = tag;
    button.addEventListener("click", () => {
      state.activeTag = tag;
      render();
    });
    filterBar.append(button);
  }
}

function matchesActiveTag(project) {
  if (state.activeTag === "All") {
    return true;
  }
  return (project.tags || []).includes(state.activeTag);
}

function createProjectCard(project) {
  const card = document.createElement("article");
  card.className = "project-card";

  const media = createMediaElement(project);
  if (!media) {
    return null;
  }

  const copy = document.createElement("div");
  copy.className = "card-copy";
  const isEditing = state.editingId === project.id;

  const tagsMarkup = (project.tags || [])
    .map((tag) => `<button type="button" class="pill" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`)
    .join("");

  copy.innerHTML = `
    <div class="card-meta">
      ${tagsMarkup}
      <span class="filetype">${escapeHtml(project.format || "MEDIA")}</span>
    </div>
    <h3>${escapeHtml(project.title)}</h3>
    <p>${escapeHtml(project.description)}</p>
    <p class="storage-label">${project.storage === "browser" ? "Saved in browser" : "Stored in project"}</p>
    <div class="card-actions">
      <button type="button" class="mini-button" data-action="edit">
        ${isEditing ? "Close" : "Edit"}
      </button>
      <button type="button" class="mini-button" data-action="publish">Publish to share page</button>
      <button type="button" class="mini-button danger" data-action="delete">Delete</button>
    </div>
    <form class="edit-form${isEditing ? " is-open" : ""}" data-edit-form>
      <label class="field">
        <span>Title</span>
        <input type="text" name="title" value="${escapeHtml(project.title)}" />
      </label>
      <label class="field">
        <span>Description</span>
        <textarea name="description" rows="3">${escapeHtml(project.description)}</textarea>
      </label>
      <label class="field">
        <span>Tags</span>
        <input type="text" name="tags" value="${escapeHtml((project.tags || []).join(", "))}" />
      </label>
      <div class="tag-suggestions">
        ${renderEditTagButtons(project.tags || [])}
      </div>
      <div class="card-actions">
        <button type="submit" class="mini-button primary-mini">Save</button>
        <button type="button" class="mini-button" data-action="cancel">Cancel</button>
      </div>
    </form>
  `;

  copy.querySelectorAll("[data-tag]").forEach((tagButton) => {
    tagButton.addEventListener("click", () => {
      state.activeTag = tagButton.dataset.tag || "All";
      render();
    });
  });

  copy.querySelector('[data-action="edit"]').addEventListener("click", () => {
    state.editingId = isEditing ? null : project.id;
    render();
  });

  copy.querySelector('[data-action="delete"]').addEventListener("click", async () => {
    const confirmed = window.confirm(`Delete "${project.title}" from the portfolio?`);
    if (!confirmed) {
      return;
    }
    await deleteProject(project.id);
  });

  copy.querySelector('[data-action="publish"]').addEventListener("click", () => {
    savePublishedProjects([toPublishedProject(project)]);
    state.publishSnippet = buildPublishSnippet(project);
    publishNote.textContent =
      project.storage === "browser"
        ? "Published locally for preview. Update the src path after you place the file in the media folder, then paste the snippet into published-projects.js for GitHub Pages."
        : "Published locally for the share page. Paste the snippet into published-projects.js when you want the same result on GitHub Pages.";
    render();
    publishOutput.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  copy.querySelector('[data-action="cancel"]').addEventListener("click", () => {
    state.editingId = null;
    render();
  });

  copy.querySelector("[data-edit-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await updateProject(project.id, {
      title: String(formData.get("title") || "").trim() || project.title,
      description:
        String(formData.get("description") || "").trim() || project.description,
      tags: parseTags(String(formData.get("tags") || "")),
    });
  });

  copy.querySelectorAll("[data-edit-tag]").forEach((button) => {
    button.addEventListener("click", () => {
      const form = copy.querySelector("[data-edit-form]");
      const tagsField = form.querySelector('input[name="tags"]');
      addTagToInput(tagsField, button.dataset.editTag || "");
    });
  });

  card.append(media, copy);
  return card;
}

function createMediaElement(project) {
  const wrapper = document.createElement("div");
  wrapper.className = "card-media";

  if (project.type === "gif") {
    const image = document.createElement("img");
    image.src = project.src;
    image.alt = project.title;
    image.loading = "lazy";
    image.onerror = () => wrapper.replaceChildren(createPlaceholder());
    wrapper.append(image);
    return wrapper;
  }

  if (project.type === "video") {
    const video = document.createElement("video");
    video.src = project.src;
    video.autoplay = true;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.setAttribute("aria-label", project.title);
    video.onerror = () => wrapper.replaceChildren(createPlaceholder());
    wrapper.append(video);
    return wrapper;
  }

  return null;
}

function createPlaceholder() {
  const placeholder = document.createElement("div");
  placeholder.className = "media-placeholder";
  placeholder.textContent = "Media file not found yet. Add the real file to the media folder or upload it again.";
  return placeholder;
}

function updateUploadZoneLabel(files) {
  const title = uploadZone.querySelector(".upload-title");
  if (!title) {
    return;
  }
  title.textContent =
    files.length > 0
      ? `${files.length} file${files.length > 1 ? "s" : ""} selected`
      : "Drop GIF / MP4 / MOV files here";
}

function resetUploadForm() {
  uploadForm.reset();
  updateUploadZoneLabel([]);
}

function isSupportedFile(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  return ["gif", "mp4", "mov"].includes(extension || "");
}

function getMediaType(fileName, mimeType) {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "gif" || mimeType === "image/gif") {
    return "gif";
  }
  return "video";
}

function getFormatLabel(fileName) {
  return fileName.split(".").pop()?.toUpperCase() || "MEDIA";
}

function buildPublishSnippet(project) {
  const publishedProject = toPublishedProject(project);
  return `{
  id: "${escapeForJs(publishedProject.id)}",
  title: "${escapeForJs(publishedProject.title)}",
  description: "${escapeForJs(publishedProject.description)}",
  type: "${escapeForJs(publishedProject.type)}",
  src: "${escapeForJs(publishedProject.src)}",
  format: "${escapeForJs(publishedProject.format)}",
  tags: [${publishedProject.tags.map((tag) => `"${escapeForJs(tag)}"`).join(", ")}],
  storage: "project",
},`;
}

function toPublishedProject(project) {
  const extension = String(project.format || "mp4").toLowerCase();
  const safeId = toSlug(project.title || project.id || "project");
  const isBrowserUpload = project.storage === "browser" && Boolean(project.id);
  const src =
    project.storage === "project" && String(project.src || "").startsWith("./media/")
      ? project.src
      : `./media/${safeId}.${extension}`;

  return {
    id: safeId,
    title: project.title,
    description: project.description,
    type: project.type,
    src,
    format: project.format || extension.toUpperCase(),
    tags: normalizeTags(project.tags),
    storage: "project",
    sourceStorage: isBrowserUpload ? "browser" : "project",
    sourceId: isBrowserUpload ? project.id : project.id || safeId,
  };
}

function parseTags(value) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function renderQuickTags() {
  tagSuggestions.innerHTML = "";

  for (const tag of state.quickTags) {
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "suggestion-chip";
    addButton.textContent = tag;
    addButton.addEventListener("click", () => {
      addTagToInput(tagsInput, tag);
    });

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "suggestion-chip remove-chip";
    removeButton.textContent = `Remove ${tag}`;
    removeButton.addEventListener("click", () => {
      removeQuickTag(tag);
    });

    tagSuggestions.append(addButton, removeButton);
  }
}

function addTagToInput(input, tag) {
  if (!input || !tag) {
    return;
  }

  const currentTags = parseTags(input.value);
  if (currentTags.includes(tag)) {
    return;
  }

  input.value = [...currentTags, tag].join(", ");
}

function renderEditTagButtons(tags) {
  const suggestions = new Set(state.quickTags);
  for (const tag of tags) {
    suggestions.add(tag);
  }

  return [...suggestions]
    .map(
      (tag) =>
        `<button type="button" class="suggestion-chip" data-edit-tag="${escapeHtml(tag)}">+ ${escapeHtml(tag)}</button>`,
    )
    .join("");
}

function addQuickTag(tag) {
  const normalizedTag = String(tag || "").trim();
  if (!normalizedTag) {
    return;
  }

  if (state.quickTags.includes(normalizedTag)) {
    newQuickTagInput.value = "";
    return;
  }

  state.quickTags = [...state.quickTags, normalizedTag];
  saveQuickTags();
  newQuickTagInput.value = "";
  render();
}

function removeQuickTag(tag) {
  state.quickTags = state.quickTags.filter((item) => item !== tag);
  saveQuickTags();
  render();
}

function toSlug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "project";
}

function getAllProjects() {
  const visiblePersistentProjects = persistentProjects
    .filter((project) => !state.hiddenProjectIds.includes(project.id))
    .map((project) => ({
      ...project,
      ...(state.projectOverrides[project.id] || {}),
    }));

  return [...state.uploadedItems, ...visiblePersistentProjects];
}

function getAllTags(projects) {
  const tags = new Set(["All"]);
  for (const project of projects) {
    for (const tag of project.tags || []) {
      tags.add(tag);
    }
  }
  return [...tags];
}

async function updateProject(projectId, updates) {
  if (state.uploadedItems.some((item) => item.id === projectId)) {
    state.uploadedItems = state.uploadedItems.map((item) =>
      item.id === projectId ? { ...item, ...updates, tags: normalizeTags(updates.tags) } : item,
    );
    const updatedItem = state.uploadedItems.find((item) => item.id === projectId);
    await saveUploadToDb(updatedItem);
  } else {
    state.projectOverrides[projectId] = {
      ...(state.projectOverrides[projectId] || {}),
      ...updates,
      tags: normalizeTags(updates.tags),
    };
    saveProjectOverrides();
  }

  state.editingId = null;
  render();
}

async function deleteProject(projectId) {
  if (state.uploadedItems.some((item) => item.id === projectId)) {
    const itemToRemove = state.uploadedItems.find((item) => item.id === projectId);
    if (itemToRemove?.src?.startsWith("blob:")) {
      URL.revokeObjectURL(itemToRemove.src);
    }
    state.uploadedItems = state.uploadedItems.filter((item) => item.id !== projectId);
    await deleteUploadFromDb(projectId);
  } else if (!state.hiddenProjectIds.includes(projectId)) {
    state.hiddenProjectIds.push(projectId);
    saveHiddenProjectIds();
  }

  state.editingId = null;
  render();
}

async function restoreDeletedItems() {
  state.hiddenProjectIds = [];
  saveHiddenProjectIds();
  state.activeTag = "All";
  render();
}

function normalizeTags(tags) {
  return tags && tags.length > 0 ? tags : ["General"];
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeForJs(value) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"');
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveUploadToDb(item) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put({
      id: item.id,
      title: item.title,
      description: item.description,
      type: item.type,
      format: item.format,
      tags: item.tags,
      storage: item.storage,
      blob: item.blob,
    });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function loadUploadsFromDb() {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const items = request.result.map((item) => ({
          ...item,
          src: URL.createObjectURL(item.blob),
        }));
        resolve(items.reverse());
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error(error);
    return [];
  }
}

async function deleteUploadFromDb(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function loadProjectOverrides() {
  try {
    return JSON.parse(localStorage.getItem(PROJECT_OVERRIDES_KEY) || "{}");
  } catch (error) {
    console.error(error);
    return {};
  }
}

function saveProjectOverrides() {
  localStorage.setItem(PROJECT_OVERRIDES_KEY, JSON.stringify(state.projectOverrides));
}

function loadHiddenProjectIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROJECT_HIDDEN_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error(error);
    return [];
  }
}

function saveHiddenProjectIds() {
  localStorage.setItem(PROJECT_HIDDEN_KEY, JSON.stringify(state.hiddenProjectIds));
}

function loadQuickTags() {
  try {
    const parsed = JSON.parse(localStorage.getItem(QUICK_TAGS_KEY) || "null");
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (error) {
    console.error(error);
  }

  return ["Spine", "Character", "UI", "VFX", "FX", "Gameplay"];
}

function saveQuickTags() {
  localStorage.setItem(QUICK_TAGS_KEY, JSON.stringify(state.quickTags));
}

function savePublishedProjects(projects) {
  localStorage.setItem(PUBLISHED_PROJECTS_KEY, JSON.stringify(projects));
}
