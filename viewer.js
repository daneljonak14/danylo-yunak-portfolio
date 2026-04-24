const PUBLISHED_PROJECTS_KEY = "motion-portfolio-published-projects";
const DB_NAME = "motion-portfolio-db";
const DB_VERSION = 1;
const STORE_NAME = "uploads";

const galleryGrid = document.getElementById("galleryGrid");
const emptyStateTemplate = document.getElementById("emptyStateTemplate");
const filterBar = document.getElementById("filterBar");

const state = {
  activeTag: "All",
  publishedProjects: [],
};

init();

async function init() {
  state.publishedProjects = await loadPublishedProjects();
  render();
}

function render() {
  const allTags = getAllTags(state.publishedProjects);
  if (!allTags.includes(state.activeTag)) {
    state.activeTag = "All";
  }

  renderFilters(allTags);
  galleryGrid.innerHTML = "";

  const visibleProjects = state.publishedProjects.filter(matchesActiveTag);

  if (visibleProjects.length === 0) {
    galleryGrid.append(emptyStateTemplate.content.cloneNode(true));
    return;
  }

  for (const project of visibleProjects) {
    const card = createProjectCard(project);
    if (card) {
      galleryGrid.append(card);
    }
  }
}

function renderFilters(tags) {
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

function getAllTags(projects) {
  const tags = new Set(["All"]);
  for (const project of projects) {
    for (const tag of project.tags || []) {
      tags.add(tag);
    }
  }
  return [...tags];
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
  const tagsMarkup = (project.tags || [])
    .map((tag) => `<button type="button" class="pill" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`)
    .join("");

  copy.innerHTML = `
    <div class="card-meta">
      ${tagsMarkup}
    </div>
  `;

  copy.querySelectorAll("[data-tag]").forEach((tagButton) => {
    tagButton.addEventListener("click", () => {
      state.activeTag = tagButton.dataset.tag || "All";
      render();
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
  placeholder.textContent = "Published media file not found.";
  return placeholder;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function loadPublishedProjects() {
  try {
    const localProjects = JSON.parse(localStorage.getItem(PUBLISHED_PROJECTS_KEY) || "null");
    if (Array.isArray(localProjects) && localProjects.length > 0) {
      return await hydratePublishedProjects(localProjects);
    }
  } catch (error) {
    console.error(error);
  }

  return Array.isArray(window.publishedProjects) ? window.publishedProjects : [];
}

async function hydratePublishedProjects(projects) {
  const db = await openDb().catch(() => null);
  if (!db) {
    return projects;
  }

  const uploads = await loadAllUploadsFromDb(db).catch(() => []);
  const hydratedProjects = [];

  for (const project of projects) {
    if (project.sourceStorage === "browser" && project.sourceId) {
      const upload = await loadUploadFromDb(db, project.sourceId);
      if (upload?.blob) {
        hydratedProjects.push({
          ...project,
          src: URL.createObjectURL(upload.blob),
        });
        continue;
      }
    }

    const fallbackUpload = findMatchingUpload(project, uploads);
    if (fallbackUpload?.blob) {
      hydratedProjects.push({
        ...project,
        src: URL.createObjectURL(fallbackUpload.blob),
      });
      continue;
    }

    hydratedProjects.push(project);
  }

  return hydratedProjects;
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

function loadUploadFromDb(db, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function loadAllUploadsFromDb(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function findMatchingUpload(project, uploads) {
  const projectId = toSlug(project.id || "");
  const projectTitle = toSlug(project.title || "");
  const projectSrcName = toSlug(getFileStem(project.src || ""));

  return uploads.find((upload) => {
    const uploadId = String(upload.id || "");
    const uploadTitle = toSlug(upload.title || "");

    return (
      uploadId === project.sourceId ||
      uploadTitle === projectId ||
      uploadTitle === projectTitle ||
      uploadTitle === projectSrcName ||
      uploadId.includes(projectId)
    );
  });
}

function getFileStem(value) {
  const normalized = String(value).split("/").pop() || "";
  return normalized.replace(/\.[^.]+$/, "");
}

function toSlug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
