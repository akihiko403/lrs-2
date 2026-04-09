const app = document.getElementById("app");
const topbarActions = document.getElementById("topbarActions");
const publicNav = document.getElementById("publicNav");
const resourceCardTemplate = document.getElementById("resourceCardTemplate");

const state = {
  db: {
    categories: [],
    resources: [],
    users: []
  },
  session: null,
  route: parseRoute(),
  toastTimer: null,
  loading: true
};

const RESOURCE_STATUSES = ["Pending Review", "Active", "Inactive"];

function parseRoute() {
  const hash = window.location.hash.replace(/^#/, "") || "home";
  const [name, id] = hash.split("/");
  return { name, id };
}

function navigate(hash) {
  window.location.hash = hash;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function getLocalDateInputValue(date = new Date()) {
  const offsetDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return offsetDate.toISOString().slice(0, 10);
}

function showToast(message) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  if (state.toastTimer) clearTimeout(state.toastTimer);
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  state.toastTimer = setTimeout(() => toast.remove(), 2600);
}

async function apiRequest(action, options = {}) {
  const method = options.method || "GET";
  const fetchOptions = { method, credentials: "same-origin" };

  if (options.body) {
    fetchOptions.body = options.body;
  }

  const response = await fetch(`api.php?action=${encodeURIComponent(action)}`, fetchOptions);
  const payload = await response.json();

  if (!response.ok || payload.error) {
    throw new Error(payload.error || "Request failed.");
  }

  if (payload.db) {
    state.db = payload.db;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "session")) {
    state.session = payload.session;
  }

  return payload;
}

async function loadBootstrap() {
  state.loading = true;
  render();
  try {
    await apiRequest("bootstrap");
  } catch (error) {
    app.innerHTML = `
      <section class="empty-state">
        <h3>Unable to load the system</h3>
        <p>${escapeHtml(error.message)}</p>
      </section>
    `;
    return;
  } finally {
    state.loading = false;
  }
  render();
}

function getCategoryName(categoryId) {
  return state.db.categories.find((category) => Number(category.id) === Number(categoryId))?.name || "Uncategorized";
}

function getSearchParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    keyword: params.get("keyword") || "",
    category: params.get("category") || "",
    type: params.get("type") || ""
  };
}

function setSearchParams(values) {
  const params = new URLSearchParams();
  if (values.keyword) params.set("keyword", values.keyword);
  if (values.category) params.set("category", values.category);
  if (values.type) params.set("type", values.type);
  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ""}#home`;
  history.pushState({}, "", url);
  render();
}

function getActiveResources() {
  return state.db.resources.filter((resource) => resource.status === "Active");
}

function isAdministrator() {
  return state.session?.role === "Administrator";
}

function getResourceStatusClass(status) {
  if (status === "Active") return "pill--soft";
  if (status === "Pending Review") return "pill--warning";
  return "pill--neutral";
}

function getResourceStatusAction(resource) {
  if (resource.status === "Pending Review") {
    return { label: "Approve resource", symbol: "✓" };
  }
  if (resource.status === "Active") {
    return { label: "Move to inactive", symbol: "◐" };
  }
  return { label: "Activate resource", symbol: "▶" };
}

function filterResources({ keyword, category, type }, includeInactive = false) {
  return state.db.resources
    .filter((resource) => {
      if (!includeInactive && resource.status !== "Active") return false;
      const normalizedKeyword = String(keyword || "").trim().toLowerCase();
      const categoryName = getCategoryName(resource.categoryId);
      const haystack = `${resource.title} ${resource.description} ${categoryName} ${(resource.keywords || []).join(" ")} ${resource.authorSource}`.toLowerCase();
      const matchesKeyword = !normalizedKeyword || haystack.includes(normalizedKeyword);
      const matchesCategory = !category || String(resource.categoryId) === String(category);
      const matchesType = !type || resource.fileType === type;
      return matchesKeyword && matchesCategory && matchesType;
    })
    .sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));
}

function createResourceCard(resource) {
  const fragment = resourceCardTemplate.content.cloneNode(true);
  fragment.querySelector('[data-role="category"]').textContent = getCategoryName(resource.categoryId);
  fragment.querySelector('[data-role="type"]').textContent = resource.fileType;
  fragment.querySelector('[data-role="title"]').textContent = resource.title;
  fragment.querySelector('[data-role="description"]').textContent = resource.description;
  fragment.querySelector('[data-role="keywords"]').textContent = (resource.keywords || []).slice(0, 3).join(" | ");
  fragment.querySelector('[data-role="date"]').textContent = formatDate(resource.uploadDate);
  fragment.querySelector('[data-role="viewButton"]').addEventListener("click", () => navigate(`resource/${resource.id}`));
  return fragment;
}

function updateTopbar() {
  publicNav.querySelectorAll("a").forEach((link) => {
    const href = link.getAttribute("href").replace("#", "");
    link.classList.toggle("active", state.route.name === href);
  });

  if (!state.session) {
    topbarActions.innerHTML = `<a class="button button--ghost" href="#admin">Admin Login</a>`;
    return;
  }

  topbarActions.innerHTML = `
    <a class="button button--soft" href="#admin/dashboard">${state.session.role}</a>
    <span class="muted">${state.session.fullName}</span>
    <button class="button button--ghost" type="button" id="logoutButton">Logout</button>
  `;

  document.getElementById("logoutButton").addEventListener("click", async () => {
    try {
      await apiRequest("logout", { method: "POST" });
      showToast("You have been logged out.");
      navigate("home");
      await loadBootstrap();
    } catch (error) {
      showToast(error.message);
    }
  });
}

function renderLoading() {
  app.innerHTML = `
    <section class="empty-state">
      <h3>Loading Learning Resource System</h3>
      <p>Please wait while the database content is prepared.</p>
    </section>
  `;
}

function renderHomeView() {
  const params = getSearchParams();
  const hasSearch = Boolean(params.keyword || params.category || params.type);
  const results = filterResources(params);

  app.innerHTML = `
    <section class="view view--search">
      <section class="hero">
        <div class="hero__grid">
          <h1>Explore fisheries knowledge, field resources, and teaching materials in one place.</h1>
          <p>Search fisheries resources the way students naturally discover information: one large search bar, quick filters, and wide results built for easier reading.</p>
          <form class="search-box search-box--hero search-box--hero--single" id="heroSearchForm">
            <label class="field">
              <input type="text" name="keyword" placeholder="Search fisheries resources">
            </label>
          </form>
        </div>
      </section>
      ${hasSearch ? `
        <section class="surface results-panel search-results-shell">
          <div class="search-results-header">
            <div>
              <h2>Search Results</h2>
              <p>${results.length} resource${results.length === 1 ? "" : "s"} found.</p>
            </div>
            <p class="search-meta-line">Results update from the home page search bar and category chips.</p>
          </div>
          <div class="resource-grid resource-grid--wide" id="homeSearchResultsGrid"></div>
        </section>
      ` : ""}
    </section>
  `;

  const homeResultsGrid = document.getElementById("homeSearchResultsGrid");
  if (homeResultsGrid) {
    if (!results.length) {
      homeResultsGrid.innerHTML = `<div class="empty-state"><h3>No matching resources</h3><p>Try a different keyword or choose another category chip.</p></div>`;
    } else {
      results.forEach((resource) => homeResultsGrid.appendChild(createResourceCard(resource)));
    }
  }

  document.getElementById("heroSearchForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setSearchParams({
      keyword: String(formData.get("keyword") || "").trim(),
      category: "",
      type: ""
    });
  });
}

function renderSearchView() {
  navigate("home");
}

function getViewerMarkup(resource) {
  if (resource.resourceUrl) {
    return `
      <div class="download-panel">
        <h3>Download Resource</h3>
        <p>Files available in this topic.</p>
        <ul class="download-list">
          <li class="download-list__item">
            <div class="download-list__content">
              <strong>${escapeHtml(resource.title)}</strong>
              <span>${escapeHtml(resource.fileType)} file</span>
            </div>
            <a class="icon-button icon-button--ghost download-list__button" href="${resource.resourceUrl}" download aria-label="Download ${escapeAttribute(resource.title)}">
              <span aria-hidden="true">&#8595;</span>
            </a>
          </li>
        </ul>
      </div>
    `;
  }
  if (resource.dataText) {
    return `
      <div class="download-panel">
        <h3>Download Resource</h3>
        <p>Files available in this topic.</p>
        <ul class="download-list">
          <li class="download-list__item">
            <div class="download-list__content">
              <strong>${escapeHtml(resource.title)}</strong>
              <span>${escapeHtml(resource.fileType)} file</span>
            </div>
            <button class="icon-button icon-button--ghost download-list__button" type="button" id="downloadDataResourceButton" aria-label="Download ${escapeAttribute(resource.title)}">
              <span aria-hidden="true">&#8595;</span>
            </button>
          </li>
        </ul>
      </div>
    `;
  }
  return `
    <div class="download-panel">
      <h3>Download Resource</h3>
      <p>No downloadable file is available for this resource.</p>
    </div>
  `;
}

async function renderResourceDetailsView(resourceId) {
  const resource = state.db.resources.find((item) => String(item.id) === String(resourceId) && item.status === "Active");
  if (!resource) {
    app.innerHTML = `
      <section class="empty-state">
        <h3>Resource not available</h3>
        <p>This item may be inactive or no longer exists.</p>
        <a class="button" href="#search">Back to Search</a>
      </section>
    `;
    return;
  }

  try {
    const formData = new FormData();
    formData.append("id", resource.id);
    await apiRequest("resource_view", { method: "POST", body: formData });
  } catch (error) {
    showToast(error.message);
  }

  const refreshed = state.db.resources.find((item) => String(item.id) === String(resourceId)) || resource;

  app.innerHTML = `
    <section class="view">
      <div class="resource-detail-grid">
        <div class="surface detail-panel">
          <div class="section-heading">
            <div>
              <span class="pill pill--soft">${getCategoryName(refreshed.categoryId)}</span>
              <h2>${refreshed.title}</h2>
              <p>${refreshed.description}</p>
            </div>
            <div class="viewer-actions">
              <a class="button" href="#search">Back to Results</a>
              ${refreshed.resourceUrl || refreshed.dataText ? `<a class="button button--ghost" href="${refreshed.resourceUrl || "#"}" ${refreshed.resourceUrl ? "download" : 'id="downloadDataResourceLink"'}>Download Resource</a>` : ""}
            </div>
          </div>
          <div class="detail-meta">
            <span>${refreshed.fileType}</span>
            <span>${formatDate(refreshed.uploadDate)}</span>
            <span>${refreshed.views} views</span>
            <span>${refreshed.authorSource}</span>
          </div>
          <div>${getViewerMarkup(refreshed)}</div>
        </div>

        <aside class="surface detail-panel">
          <div class="section-heading">
            <div>
              <h2>Resource Details</h2>
              <p>Metadata available to students.</p>
            </div>
          </div>
          <div class="list-card">
            <ul>
              <li class="list-row"><span>Category</span><strong>${getCategoryName(refreshed.categoryId)}</strong></li>
              <li class="list-row"><span>File Type</span><strong>${refreshed.fileType}</strong></li>
              <li class="list-row"><span>Author / Source</span><strong>${refreshed.authorSource}</strong></li>
              <li class="list-row"><span>Upload Date</span><strong>${formatDate(refreshed.uploadDate)}</strong></li>
              <li class="list-row"><span>Status</span><strong>${refreshed.status}</strong></li>
            </ul>
          </div>
          <div class="section-heading" style="margin-top: 18px;">
            <div>
              <h2>Keywords</h2>
              <p>Quick topic references.</p>
            </div>
          </div>
          <div class="inline-actions">
            ${(refreshed.keywords || []).map((keyword) => `<button class="button button--soft" type="button" onclick="window.LRS.searchByKeyword('${escapeAttribute(keyword)}')">${escapeHtml(keyword)}</button>`).join("")}
          </div>
        </aside>
      </div>
    </section>
  `;

  const downloadDataResource = () => {
    if (!refreshed.dataText) return;
    const extension = refreshed.fileType === "Data" ? "txt" : refreshed.fileType.toLowerCase();
    const safeTitle = refreshed.title.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "resource";
    const blob = new Blob([refreshed.dataText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeTitle}.${extension}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  document.getElementById("downloadDataResourceButton")?.addEventListener("click", downloadDataResource);
  document.getElementById("downloadDataResourceLink")?.addEventListener("click", (event) => {
    event.preventDefault();
    downloadDataResource();
  });
}

function getModuleTitle(module) {
  return {
    dashboard: "Dashboard",
    resources: "Learning Resource Management",
    categories: "Category Management",
    upload: "Upload Files",
    reports: "Reports",
    users: "User Management"
  }[module] || "Dashboard";
}

function getModuleDescription(module) {
  return {
    dashboard: "Overview of resources, recent uploads, and top-performing learning materials.",
    resources: "Review, edit, approve, activate, or deactivate fisheries learning resources.",
    categories: "Maintain categories used in student browsing and filtering.",
    upload: "Upload new learning resources and save them directly to the system.",
    reports: "View resource summaries by type, category, and publication status.",
    users: "Manage encoder and administrator accounts."
  }[module] || "";
}

function renderLoginView() {
  app.innerHTML = `
    <section class="login-layout">
      <div class="login-card">
        <h1 class="login-card__title">Admin Login</h1>
        <p class="muted">Only Encoder and Administrator accounts can access the admin page.</p>
        <form id="loginForm">
          <label class="field"><input type="text" name="username" placeholder="Username" required></label>
          <label class="field"><input type="password" name="password" placeholder="Password" required></label>
          <button class="button" type="submit">Login</button>
        </form>
      </div>
    </section>
  `;

  document.getElementById("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    try {
      await apiRequest("login", { method: "POST", body: formData });
      showToast(`Welcome back, ${state.session.fullName}.`);
      navigate("admin/dashboard");
      render();
    } catch (error) {
      showToast(error.message);
    }
  });
}

function renderResourcesTable(resources) {
  return `
    <section class="list-card category-management-card">
      <div class="section-heading category-management-card__header">
        <div>
          <h3>Resource List</h3>
          <p>Manage uploaded learning resources and add new materials from one place.</p>
        </div>
        <button class="button" type="button" id="openResourceModalButton">Add New Resource</button>
      </div>
      <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Category</th>
            <th>Type</th>
            <th>Upload Date</th>
            <th>Status</th>
            <th>Views</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${resources.map((resource) => `
            <tr>
              <td><strong>${resource.title}</strong><br><span class="muted">${resource.authorSource}</span></td>
              <td>${getCategoryName(resource.categoryId)}</td>
              <td>${resource.fileType}</td>
              <td>${formatDate(resource.uploadDate)}</td>
              <td><span class="pill ${getResourceStatusClass(resource.status)}">${resource.status}</span></td>
              <td>${resource.views}</td>
              <td class="table-actions">
                <button class="icon-button icon-button--ghost" type="button" data-edit-resource="${resource.id}" title="Edit resource" aria-label="Edit resource">
                  <span aria-hidden="true">✎</span>
                </button>
                <button class="icon-button icon-button--soft" type="button" data-toggle-resource="${resource.id}" title="${resource.status === "Active" ? "Deactivate resource" : "Activate resource"}" aria-label="${resource.status === "Active" ? "Deactivate resource" : "Activate resource"}">
                  <span aria-hidden="true">${resource.status === "Active" ? "◐" : "✓"}</span>
                </button>
                <button class="icon-button icon-button--danger" type="button" data-delete-resource="${resource.id}" title="Delete resource" aria-label="Delete resource">
                  <span aria-hidden="true">🗑</span>
                </button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      </div>
    </section>
    <div class="modal-backdrop" id="resourceModal" hidden>
      <div class="modal-dialog modal-dialog--wide" role="dialog" aria-modal="true" aria-labelledby="resourceModalTitle">
        <div class="modal-card">
          <div class="section-heading modal-card__header">
            <div>
              <h3 id="resourceModalTitle">Add New Resource</h3>
              <p id="resourceModalSubtitle">Upload a new learning resource and save it directly from this module.</p>
            </div>
            <button class="icon-button icon-button--ghost" type="button" id="closeResourceModalButton" aria-label="Close resource modal">X</button>
          </div>
          <div id="resourceModalMount"></div>
        </div>
      </div>
    </div>
  `;
}

function renderCategoriesModule() {
  return `
    <section class="list-card category-management-card">
      <div class="section-heading category-management-card__header">
        <div>
          <h3>Category List</h3>
          <p>Maintain the categories used in student browsing, filtering, and resource organization.</p>
        </div>
        <button class="button" type="button" id="openCategoryModalButton">Add Category</button>
      </div>
      <ul class="category-list">
        ${state.db.categories.map((category) => `
          <li class="list-row category-list__item">
            <div class="category-list__content">
              <strong>${category.name}</strong><br>
              <span class="muted">${category.description}</span>
            </div>
            <div class="inline-actions user-list__actions">
              <button class="icon-button icon-button--ghost" type="button" data-view-category="${category.id}" title="View category" aria-label="View category">
                <span aria-hidden="true">◉</span>
              </button>
              <button class="icon-button icon-button--soft" type="button" data-edit-category="${category.id}" title="Edit category" aria-label="Edit category">
                <span aria-hidden="true">✎</span>
              </button>
              <button class="icon-button icon-button--danger" type="button" data-delete-category="${category.id}" title="Delete category" aria-label="Delete category">
                <span aria-hidden="true">🗑</span>
              </button>
            </div>
          </li>
        `).join("")}
      </ul>
    </section>
    <div class="modal-backdrop" id="categoryModal" hidden>
      <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="categoryModalTitle">
        <div class="modal-card">
          <div class="section-heading modal-card__header">
            <div>
              <h3 id="categoryModalTitle">Add Category</h3>
              <p id="categoryModalSubtitle">Create a new category for student browsing and admin organization.</p>
            </div>
            <button class="icon-button icon-button--ghost" type="button" id="closeCategoryModalButton" aria-label="Close add category modal">✕</button>
          </div>
          <form id="categoryForm" class="modal-form">
            <input type="hidden" name="id" value="">
            <label class="field"><input type="text" name="name" placeholder="Category name" required></label>
            <label class="field"><textarea name="description" placeholder="Category description" required></textarea></label>
            <div class="inline-actions modal-card__actions">
              <button class="button" type="submit" id="saveCategoryButton">Save Category</button>
              <button class="button button--ghost" type="button" id="cancelCategoryModalButton">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    </div>
    <div class="modal-backdrop" id="categoryViewModal" hidden>
      <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="categoryViewModalTitle">
        <div class="modal-card">
          <div class="section-heading modal-card__header">
            <div>
              <h3 id="categoryViewModalTitle">Category Details</h3>
              <p>View the selected category information.</p>
            </div>
            <button class="icon-button icon-button--ghost" type="button" id="closeCategoryViewModalButton" aria-label="Close category details modal">✕</button>
          </div>
          <div class="modal-form">
            <div class="list-card">
              <ul>
                <li class="list-row"><span>Name</span><strong id="categoryViewName"></strong></li>
                <li class="list-row"><span>Description</span><strong id="categoryViewDescription"></strong></li>
              </ul>
            </div>
            <div class="inline-actions modal-card__actions">
              <button class="button button--ghost" type="button" id="closeCategoryViewFooterButton">Close</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderUploadModule(resource = null, options = {}) {
  const isEdit = Boolean(resource);
  const resourceStatus = resource?.status || "Active";
  const canEditStatus = isAdministrator();
  const wrapperClass = options.modal ? "resource-form-shell resource-form-shell--modal" : "form-card";
  const statusField = canEditStatus
    ? `
          <label class="field">
            <select name="status" required>
              ${RESOURCE_STATUSES.map((status) => `<option value="${status}" ${resourceStatus === status ? "selected" : ""}>${status}</option>`).join("")}
            </select>
          </label>
      `
    : `
          <label class="field">
            <input type="hidden" name="status" value="${escapeAttribute(resourceStatus)}">
            <input type="text" value="${escapeAttribute(resourceStatus)}" disabled>
          </label>
      `;
  return `
    <section class="${wrapperClass}">
      <h3>${isEdit ? "Edit Resource" : "Upload New Resource"}</h3>
      <p class="upload-note">${canEditStatus ? "Set the resource status before saving so it appears the way you intend." : "New uploads are saved as Active immediately."}</p>
      <form id="resourceForm" class="resource-form-grid" enctype="multipart/form-data">
        <input type="hidden" name="id" value="${resource ? resource.id : ""}">
        <div class="report-grid">
          <label class="field"><input type="text" name="title" placeholder="Title" value="${escapeAttribute(resource?.title || "")}" required></label>
          <label class="field"><input type="text" name="authorSource" placeholder="Author / Source" value="${escapeAttribute(resource?.authorSource || "")}" required></label>
        </div>
        <label class="field"><textarea name="description" placeholder="Description" required>${escapeHtml(resource?.description || "")}</textarea></label>
        <div class="report-grid">
          <label class="field">
            <select name="categoryId" required>
              <option value="">Select category</option>
              ${state.db.categories.map((category) => `<option value="${category.id}" ${String(resource?.categoryId || "") === String(category.id) ? "selected" : ""}>${category.name}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <select name="fileType" required>
              <option value="">Select file type</option>
              ${["PDF", "Video", "Data"].map((type) => `<option value="${type}" ${resource?.fileType === type ? "selected" : ""}>${type}</option>`).join("")}
            </select>
          </label>
        </div>
        <div class="report-grid">
          <label class="field"><input type="text" name="keywords" placeholder="Keywords separated by commas" value="${escapeAttribute((resource?.keywords || []).join(", "))}" required></label>
          <label class="field"><input type="date" name="uploadDate" value="${resource?.uploadDate || new Date().toISOString().slice(0, 10)}" required></label>
        </div>
        <div class="report-grid">
          ${statusField}
          <label class="field"><input type="url" name="resourceUrl" placeholder="External file URL (optional)" value="${escapeAttribute(resource?.resourceUrl || "")}"></label>
        </div>
        <label class="field"><textarea name="dataText" placeholder="For data resources, paste tabular or JSON content here">${escapeHtml(resource?.dataText || "")}</textarea></label>
        <label class="field"><input type="file" name="uploadFile" accept=".pdf,.mp4,.mov,.csv,.json,.txt"></label>
        <div class="inline-actions">
          <button class="button" type="submit">${isEdit ? "Update Resource" : "Save Resource"}</button>
          <button class="button button--ghost" type="button" id="cancelEditButton">Cancel</button>
        </div>
      </form>
    </section>
  `;
}

function renderReportsModule() {
  const categoryReport = state.db.categories.map((category) => ({
    name: category.name,
    total: state.db.resources.filter((resource) => Number(resource.categoryId) === Number(category.id)).length
  }));
  const typeReport = ["PDF", "Video", "Data"].map((type) => ({
    name: type,
    total: state.db.resources.filter((resource) => resource.fileType === type).length
  }));
  const statusReport = RESOURCE_STATUSES.map((status) => ({
    name: status,
    total: state.db.resources.filter((resource) => resource.status === status).length
  }));

  return `
    <div class="report-grid">
      <article class="report-card">
        <h3>Resources by Category</h3>
        <ul class="report-list">${categoryReport.map((item) => `<li><span>${item.name}</span><strong>${item.total}</strong></li>`).join("")}</ul>
      </article>
      <article class="report-card">
        <h3>Resources by File Type</h3>
        <ul class="report-list">${typeReport.map((item) => `<li><span>${item.name}</span><strong>${item.total}</strong></li>`).join("")}</ul>
      </article>
      <article class="report-card">
        <h3>Resources by Status</h3>
        <ul class="report-list">${statusReport.map((item) => `<li><span>${item.name}</span><strong>${item.total}</strong></li>`).join("")}</ul>
      </article>
    </div>
  `;
}

function renderUsersModule() {
  const canManageUsers = state.session?.role === "Administrator";
  return `
    <section class="list-card category-management-card">
      <div class="section-heading category-management-card__header">
        <div>
          <h3>User List</h3>
          <p>${canManageUsers ? "Manage administrator and encoder accounts from one place." : "Only administrators can add, activate, or remove user accounts."}</p>
        </div>
        ${canManageUsers ? `<button class="button" type="button" id="openUserModalButton">Add User</button>` : ""}
      </div>
      <ul class="category-list">
        ${state.db.users.map((user) => `
          <li class="list-row category-list__item user-list__item">
            <div class="category-list__content">
              <strong>${user.fullName}</strong><br>
              <span class="muted">${user.username} • ${user.role}</span>
            </div>
            <div class="inline-actions user-list__actions">
              <span class="pill ${user.status === "Active" ? "pill--soft" : "pill--neutral"}">${user.status}</span>
              <button class="icon-button icon-button--soft" type="button" data-toggle-user="${user.id}" title="${user.status === "Active" ? "Deactivate user" : "Activate user"}" aria-label="${user.status === "Active" ? "Deactivate user" : "Activate user"}" ${canManageUsers ? "" : "disabled"}>
                <span aria-hidden="true">${user.status === "Active" ? "◐" : "▶"}</span>
              </button>
              <button class="icon-button icon-button--danger" type="button" data-delete-user="${user.id}" title="Delete user" aria-label="Delete user" ${canManageUsers ? "" : "disabled"}>
                <span aria-hidden="true">🗑</span>
              </button>
            </div>
          </li>
        `).join("")}
      </ul>
    </section>
    ${canManageUsers ? `
      <div class="modal-backdrop" id="userModal" hidden>
        <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="userModalTitle">
          <div class="modal-card">
            <div class="section-heading modal-card__header">
              <div>
                <h3 id="userModalTitle">Add User</h3>
                <p>Create a new encoder or administrator account.</p>
              </div>
              <button class="icon-button icon-button--ghost" type="button" id="closeUserModalButton" aria-label="Close add user modal">✕</button>
            </div>
            <form id="userForm" class="modal-form">
              <label class="field"><input type="text" name="fullName" placeholder="Full name" required></label>
              <label class="field"><input type="text" name="username" placeholder="Username" required></label>
              <label class="field"><input type="password" name="password" placeholder="Password" required></label>
              <label class="field">
                <select name="role" required>
                  <option value="Encoder">Encoder</option>
                  <option value="Administrator">Administrator</option>
                </select>
              </label>
              <div class="inline-actions modal-card__actions">
                <button class="button" type="submit">Save User</button>
                <button class="button button--ghost" type="button" id="cancelUserModalButton">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    ` : ""}
  `;
}

function attachResourceTableEvents() {
  const modal = document.getElementById("resourceModal");
  const mount = document.getElementById("resourceModalMount");
  const title = document.getElementById("resourceModalTitle");
  const subtitle = document.getElementById("resourceModalSubtitle");
  const openButton = document.getElementById("openResourceModalButton");
  const closeButton = document.getElementById("closeResourceModalButton");

  const closeModal = () => {
    if (modal) modal.hidden = true;
  };

  const openModal = (resource = null) => {
    if (!modal || !mount || !title || !subtitle) return;
    const isEdit = Boolean(resource);
    title.textContent = isEdit ? "Edit Resource" : "Add New Resource";
    subtitle.textContent = isEdit
      ? "Update the selected learning resource."
      : "Upload a new learning resource and save it directly from this module.";
    mount.innerHTML = renderUploadModule(resource, { modal: true });
    modal.hidden = false;
    attachUploadEvents(closeModal);
    mount.querySelector('[name="title"]')?.focus();
  };

  openButton?.addEventListener("click", () => openModal());
  closeButton?.addEventListener("click", closeModal);
  modal?.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });

  if (window.LRSResourceModalEscapeHandler) {
    document.removeEventListener("keydown", window.LRSResourceModalEscapeHandler);
  }
  const handleEscape = (event) => {
    if (event.key === "Escape" && modal && !modal.hidden) {
      closeModal();
    }
  };
  window.LRSResourceModalEscapeHandler = handleEscape;
  document.addEventListener("keydown", handleEscape);

  document.querySelectorAll("[data-toggle-resource]").forEach((button) => {
    const resource = state.db.resources.find((item) => String(item.id) === String(button.dataset.toggleResource));
    if (resource) {
      const statusAction = getResourceStatusAction(resource);
      button.title = statusAction.label;
      button.setAttribute("aria-label", statusAction.label);
      const icon = button.querySelector("span");
      if (icon) icon.textContent = statusAction.symbol;
    }

    if (!isAdministrator()) {
      button.hidden = true;
      return;
    }

    button.addEventListener("click", async () => {
      try {
        const formData = new FormData();
        formData.append("id", button.dataset.toggleResource);
        await apiRequest("toggle_resource", { method: "POST", body: formData });
        showToast("Resource review status updated.");
        render();
      } catch (error) {
        showToast(error.message);
      }
    });
  });

  document.querySelectorAll("[data-delete-resource]").forEach((button) => {
    button.addEventListener("click", async () => {
      const resource = state.db.resources.find((item) => String(item.id) === String(button.dataset.deleteResource));
      if (!window.confirm(`Delete "${resource.title}"?`)) return;
      try {
        const formData = new FormData();
        formData.append("id", button.dataset.deleteResource);
        await apiRequest("delete_resource", { method: "POST", body: formData });
        showToast("Resource deleted.");
        render();
      } catch (error) {
        showToast(error.message);
      }
    });
  });

  document.querySelectorAll("[data-edit-resource]").forEach((button) => {
    button.addEventListener("click", () => {
      const resource = state.db.resources.find((item) => String(item.id) === String(button.dataset.editResource));
      if (!resource) return;
      openModal(resource);
    });
  });
}

function attachCategoryEvents() {
  const modal = document.getElementById("categoryModal");
  const viewModal = document.getElementById("categoryViewModal");
  const openButton = document.getElementById("openCategoryModalButton");
  const closeButton = document.getElementById("closeCategoryModalButton");
  const cancelButton = document.getElementById("cancelCategoryModalButton");
  const closeViewButton = document.getElementById("closeCategoryViewModalButton");
  const closeViewFooterButton = document.getElementById("closeCategoryViewFooterButton");
  const form = document.getElementById("categoryForm");
  const title = document.getElementById("categoryModalTitle");
  const subtitle = document.getElementById("categoryModalSubtitle");
  const submitButton = document.getElementById("saveCategoryButton");

  const closeModal = () => {
    modal.hidden = true;
  };

  const closeViewModal = () => {
    viewModal.hidden = true;
  };

  const setCategoryFormMode = (mode, category = null) => {
    form.reset();
    form.querySelector('[name="id"]').value = category?.id || "";
    form.querySelector('[name="name"]').value = category?.name || "";
    form.querySelector('[name="description"]').value = category?.description || "";

    if (mode === "edit" && category) {
      title.textContent = "Edit Category";
      subtitle.textContent = "Update the selected category for browsing and organization.";
      submitButton.textContent = "Update Category";
    } else {
      title.textContent = "Add Category";
      subtitle.textContent = "Create a new category for student browsing and admin organization.";
      submitButton.textContent = "Save Category";
    }
  };

  const openModal = () => {
    setCategoryFormMode("create");
    modal.hidden = false;
    form.querySelector('[name="name"]').focus();
  };

  openButton.addEventListener("click", openModal);
  closeButton.addEventListener("click", closeModal);
  cancelButton.addEventListener("click", closeModal);
  closeViewButton.addEventListener("click", closeViewModal);
  closeViewFooterButton.addEventListener("click", closeViewModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });
  viewModal.addEventListener("click", (event) => {
    if (event.target === viewModal) closeViewModal();
  });

  if (window.LRSCategoryModalEscapeHandler) {
    document.removeEventListener("keydown", window.LRSCategoryModalEscapeHandler);
  }

  const handleEscape = (event) => {
    if (event.key === "Escape" && !modal.hidden) {
      closeModal();
    }
    if (event.key === "Escape" && !viewModal.hidden) {
      closeViewModal();
    }
  };
  window.LRSCategoryModalEscapeHandler = handleEscape;
  document.addEventListener("keydown", handleEscape);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const isEdit = Boolean(form.querySelector('[name="id"]').value);
      await apiRequest(isEdit ? "update_category" : "create_category", { method: "POST", body: new FormData(event.currentTarget) });
      showToast(isEdit ? "Category updated." : "Category added.");
      closeModal();
      render();
    } catch (error) {
      showToast(error.message);
    }
  });

  document.querySelectorAll("[data-view-category]").forEach((button) => {
    button.addEventListener("click", () => {
      const category = state.db.categories.find((item) => String(item.id) === String(button.dataset.viewCategory));
      if (!category) return;
      document.getElementById("categoryViewName").textContent = category.name;
      document.getElementById("categoryViewDescription").textContent = category.description;
      viewModal.hidden = false;
    });
  });

  document.querySelectorAll("[data-edit-category]").forEach((button) => {
    button.addEventListener("click", () => {
      const category = state.db.categories.find((item) => String(item.id) === String(button.dataset.editCategory));
      if (!category) return;
      setCategoryFormMode("edit", category);
      modal.hidden = false;
      form.querySelector('[name="name"]').focus();
    });
  });

  document.querySelectorAll("[data-delete-category]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const formData = new FormData();
        formData.append("id", button.dataset.deleteCategory);
        await apiRequest("delete_category", { method: "POST", body: formData });
        showToast("Category deleted.");
        render();
      } catch (error) {
        showToast(error.message);
      }
    });
  });
}

function attachUploadEvents(onComplete = null) {
  const form = document.getElementById("resourceForm");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await apiRequest("save_resource", { method: "POST", body: new FormData(form) });
      if (form.querySelector('[name="id"]').value) {
        showToast("Resource updated.");
      } else {
        showToast("Resource uploaded.");
      }
      if (onComplete) onComplete();
      render();
    } catch (error) {
      showToast(error.message);
    }
  });

  const cancelButton = document.getElementById("cancelEditButton");
  if (cancelButton) {
    cancelButton.addEventListener("click", () => {
      if (onComplete) {
        onComplete();
        return;
      }
      render();
    });
  }
}

function attachUserEvents() {
  const userForm = document.getElementById("userForm");
  const userModal = document.getElementById("userModal");
  const openUserModalButton = document.getElementById("openUserModalButton");
  const closeUserModalButton = document.getElementById("closeUserModalButton");
  const cancelUserModalButton = document.getElementById("cancelUserModalButton");

  if (userModal && openUserModalButton && closeUserModalButton && cancelUserModalButton && userForm) {
    const closeUserModal = () => {
      userModal.hidden = true;
    };

    const openUserModal = () => {
      userModal.hidden = false;
      userForm.reset();
      userForm.querySelector('[name="fullName"]').focus();
    };

    openUserModalButton.addEventListener("click", openUserModal);
    closeUserModalButton.addEventListener("click", closeUserModal);
    cancelUserModalButton.addEventListener("click", closeUserModal);
    userModal.addEventListener("click", (event) => {
      if (event.target === userModal) closeUserModal();
    });

    if (window.LRSUserModalEscapeHandler) {
      document.removeEventListener("keydown", window.LRSUserModalEscapeHandler);
    }

    const handleUserEscape = (event) => {
      if (event.key === "Escape" && !userModal.hidden) {
        closeUserModal();
      }
    };
    window.LRSUserModalEscapeHandler = handleUserEscape;
    document.addEventListener("keydown", handleUserEscape);
  }

  if (userForm) {
    userForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await apiRequest("create_user", { method: "POST", body: new FormData(userForm) });
        showToast("User created.");
        if (userModal) {
          userModal.hidden = true;
        }
        render();
      } catch (error) {
        showToast(error.message);
      }
    });
  }

  document.querySelectorAll("[data-toggle-user]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const formData = new FormData();
        formData.append("id", button.dataset.toggleUser);
        await apiRequest("toggle_user", { method: "POST", body: formData });
        showToast("User status updated.");
        render();
      } catch (error) {
        showToast(error.message);
      }
    });
  });

  document.querySelectorAll("[data-delete-user]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const formData = new FormData();
        formData.append("id", button.dataset.deleteUser);
        await apiRequest("delete_user", { method: "POST", body: formData });
        showToast("User deleted.");
        render();
      } catch (error) {
        showToast(error.message);
      }
    });
  });
}

function renderAdminView() {
  if (!state.session) {
    renderLoginView();
    return;
  }

  const adminModules = isAdministrator()
    ? [
        ["dashboard", "Dashboard"],
        ["resources", "Learning Resource Management"],
        ["categories", "Category Management"],
        ["upload", "Upload Files"],
        ["reports", "Reports"],
        ["users", "User Management"]
      ]
    : [
        ["dashboard", "Dashboard"],
        ["resources", "Learning Resource Management"],
        ["categories", "Category Management"],
        ["upload", "Upload Files"]
      ];
  const allowedModules = new Set(adminModules.map(([key]) => key));
  const module = allowedModules.has(state.route.id) ? state.route.id : "dashboard";

  if (state.route.id && !allowedModules.has(state.route.id)) {
    navigate("admin/dashboard");
    return;
  }

  const resources = [...state.db.resources].sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));
  const mostViewed = [...state.db.resources].sort((a, b) => b.views - a.views).slice(0, 5);
  const recentUploads = resources.slice(0, 5);
  const latestResourcesCount = state.db.resources.filter((item) => item.uploadDate === getLocalDateInputValue()).length;
  const activeCount = state.db.resources.filter((item) => item.status === "Active").length;
  const inactiveCount = state.db.resources.filter((item) => item.status === "Inactive").length;

  app.innerHTML = `
    <section class="view">
      <div class="admin-layout">
        <aside class="admin-sidebar">
          <div>
            <h2>Admin Page</h2>
            <p class="muted">${isAdministrator() ? "Manage learning resources, categories, reports, and users." : "Manage learning resources, categories, and uploads."}</p>
          </div>
          <nav class="admin-nav" id="adminNav">
            ${adminModules.map(([key, label]) => `<button type="button" class="${module === key ? "active" : ""}" data-module="${key}">${label}</button>`).join("")}
          </nav>
          <div class="admin-sidebar__footer">
            <span class="pill">${state.session.role}</span>
            <span class="muted">${state.session.fullName}</span>
          </div>
        </aside>

        <div class="admin-main">
          <header class="admin-panel__header">
            <h1>${getModuleTitle(module)}</h1>
            <p>${getModuleDescription(module)}</p>
          </header>
          <section id="adminModuleContent"></section>
        </div>
      </div>
    </section>
  `;

  document.querySelectorAll("#adminNav button").forEach((button) => {
    button.addEventListener("click", () => navigate(`admin/${button.dataset.module}`));
  });

  const moduleContent = document.getElementById("adminModuleContent");
  switch (module) {
    case "dashboard":
      moduleContent.innerHTML = `
        <div class="stats-grid">
          <article class="stat-card"><h3>Total Resources</h3><strong>${state.db.resources.length}</strong><span class="muted">All uploaded learning items</span></article>
          <article class="stat-card"><h3>Latest Resources</h3><strong>${latestResourcesCount}</strong><span class="muted">Resources uploaded today</span></article>
          <article class="stat-card"><h3>Active Resources</h3><strong>${activeCount}</strong><span class="muted">Visible on the student page</span></article>
          <article class="stat-card"><h3>Inactive Resources</h3><strong>${inactiveCount}</strong><span class="muted">Hidden after review or archival</span></article>
        </div>
        <div class="report-grid">
          <section class="list-card">
            <h3>Recent Uploads</h3>
            <ul>${recentUploads.map((item) => `<li class="list-row"><span>${item.title}</span><strong>${formatDate(item.uploadDate)}</strong></li>`).join("")}</ul>
          </section>
          <section class="list-card">
            <h3>Most Viewed Resources</h3>
            <ul>${mostViewed.map((item) => `<li class="list-row"><span>${item.title}</span><strong>${item.views} views</strong></li>`).join("")}</ul>
          </section>
        </div>
      `;
      break;
    case "resources":
      moduleContent.innerHTML = renderResourcesTable(resources);
      attachResourceTableEvents();
      break;
    case "categories":
      moduleContent.innerHTML = renderCategoriesModule();
      attachCategoryEvents();
      break;
    case "upload":
      moduleContent.innerHTML = renderUploadModule();
      attachUploadEvents();
      break;
    case "reports":
      moduleContent.innerHTML = renderReportsModule();
      break;
    case "users":
      moduleContent.innerHTML = renderUsersModule();
      attachUserEvents();
      break;
    default:
      navigate("admin/dashboard");
  }
}

function render() {
  state.route = parseRoute();
  updateTopbar();

  if (state.loading) {
    renderLoading();
    return;
  }

  if (state.route.name === "home") {
    renderHomeView();
    return;
  }

  if (state.route.name === "search") {
    renderSearchView();
    return;
  }

  if (state.route.name === "resource") {
    renderResourceDetailsView(state.route.id);
    return;
  }

  if (state.route.name === "admin") {
    renderAdminView();
    return;
  }

  navigate("home");
}

window.LRS = {
  searchByCategory(categoryId) {
    setSearchParams({ keyword: "", category: categoryId, type: "" });
  },
  searchByType(type) {
    setSearchParams({ keyword: "", category: "", type });
  },
  searchByKeyword(keyword) {
    setSearchParams({ keyword, category: "", type: "" });
  }
};

window.addEventListener("hashchange", render);
window.addEventListener("popstate", render);

loadBootstrap();
