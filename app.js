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
  const url = `${window.location.pathname}${query ? `?${query}` : ""}#search`;
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
      const haystack = `${resource.title} ${resource.description} ${(resource.keywords || []).join(" ")} ${resource.authorSource}`.toLowerCase();
      const matchesKeyword = !keyword || haystack.includes(keyword.toLowerCase());
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
    <span class="pill pill--soft">${state.session.role}</span>
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
  const latestResources = getActiveResources()
    .sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate))
    .slice(0, 6);
  const featuredCategories = state.db.categories.slice(0, 5);

  app.innerHTML = `
    <section class="view view--search">
      <section class="hero">
        <div class="hero__grid">
          <h1>Explore fisheries knowledge, field resources, and teaching materials in one place.</h1>
          <p>Search fisheries resources the way students naturally discover information: one large search bar, quick filters, and wide results built for easier reading.</p>
          <form class="search-box search-box--hero" id="heroSearchForm">
            <label class="field">
              <input type="text" name="keyword" placeholder="Search fisheries topics, species, modules, manuals, videos, data...">
            </label>
            <label class="field">
              <select name="category">
                <option value="">All categories</option>
                ${state.db.categories.map((category) => `<option value="${category.id}">${category.name}</option>`).join("")}
              </select>
            </label>
            <label class="field">
              <select name="type">
                <option value="">All file types</option>
                <option value="PDF">PDF</option>
                <option value="Video">Video</option>
                <option value="Data">Data</option>
              </select>
            </label>
            <button class="button" type="submit">Search Resources</button>
          </form>
          <div class="search-toolbar__chips">
            ${featuredCategories.map((category) => `<button class="chip" type="button" onclick="window.LRS.searchByCategory('${category.id}')">${category.name}</button>`).join("")}
          </div>
        </div>
      </section>

      <section class="student-sections">
        <div class="surface section-card">
          <div class="section-heading">
            <div>
              <h2>Search by Fisheries Category</h2>
              <p>Use one click to jump into the most common learning areas.</p>
            </div>
            <a class="button button--ghost" href="#search">Open Search Page</a>
          </div>
          <div class="category-grid category-grid--search">
            ${state.db.categories.map((category) => `
              <article class="category-card category-card--compact">
                <h3>${category.name}</h3>
                <p class="muted">${category.description}</p>
                <button class="button button--ghost" type="button" onclick="window.LRS.searchByCategory('${category.id}')">Open Resources</button>
              </article>
            `).join("")}
          </div>
        </div>
      </section>

      <section class="surface section-card">
        <div class="section-heading">
          <div>
            <h2>Latest Resources</h2>
            <p>Recently published learning materials from the School of Fisheries.</p>
          </div>
          <a class="button button--ghost" href="#search">See all resources</a>
        </div>
        <div class="resource-grid" id="latestResourcesGrid"></div>
      </section>
    </section>
  `;

  const latestGrid = document.getElementById("latestResourcesGrid");
  if (!latestResources.length) {
    latestGrid.innerHTML = `<div class="empty-state"><h3>No resources yet</h3><p>Uploads from staff will appear here.</p></div>`;
  } else {
    latestResources.forEach((resource) => latestGrid.appendChild(createResourceCard(resource)));
  }

  document.getElementById("heroSearchForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setSearchParams({
      keyword: String(formData.get("keyword") || "").trim(),
      category: String(formData.get("category") || ""),
      type: String(formData.get("type") || "")
    });
  });
}

function renderSearchView() {
  const params = getSearchParams();
  const results = filterResources(params);
  const quickTypeChips = [
    { label: "All", type: "" },
    { label: "PDF", type: "PDF" },
    { label: "Video", type: "Video" },
    { label: "Data", type: "Data" }
  ];

  app.innerHTML = `
    <section class="view view--search">
      <div class="surface search-toolbar">
        <form id="searchFiltersForm">
          <div class="search-toolbar__top">
            <label class="field">
              <input type="text" name="keyword" placeholder="Search fisheries resources" value="${escapeAttribute(params.keyword)}">
            </label>
            <label class="field">
              <select name="category">
                <option value="">All categories</option>
                ${state.db.categories.map((category) => `<option value="${category.id}" ${String(params.category) === String(category.id) ? "selected" : ""}>${category.name}</option>`).join("")}
              </select>
            </label>
            <label class="field">
              <select name="type">
                <option value="">All file types</option>
                ${["PDF", "Video", "Data"].map((type) => `<option value="${type}" ${params.type === type ? "selected" : ""}>${type}</option>`).join("")}
              </select>
            </label>
            <button class="button" type="submit">Search</button>
            <button class="button button--ghost" type="button" id="clearFiltersButton">Clear</button>
          </div>
        </form>
        <div class="search-toolbar__chips">
          ${quickTypeChips.map((chip) => `<button class="chip ${params.type === chip.type && !params.category ? "active" : ""}" type="button" data-chip-type="${chip.type}">${chip.label}</button>`).join("")}
          ${state.db.categories.map((category) => `<button class="chip ${String(params.category) === String(category.id) ? "active" : ""}" type="button" data-chip-category="${category.id}">${category.name}</button>`).join("")}
        </div>
      </div>

      <section class="surface results-panel search-results-shell">
        <div class="search-results-header">
          <div>
            <h2>Search Results</h2>
            <p>${results.length} resource${results.length === 1 ? "" : "s"} found.</p>
          </div>
          <p class="search-meta-line">Use the wide search bar and quick chips to narrow the collection faster.</p>
        </div>
        <div class="resource-grid resource-grid--wide" id="searchResultsGrid"></div>
      </section>
    </section>
  `;

  const grid = document.getElementById("searchResultsGrid");
  if (!results.length) {
    grid.innerHTML = `<div class="empty-state"><h3>No matching resources</h3><p>Try broadening your keyword or removing one of the filters.</p></div>`;
  } else {
    results.forEach((resource) => grid.appendChild(createResourceCard(resource)));
  }

  document.getElementById("searchFiltersForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setSearchParams({
      keyword: String(formData.get("keyword") || "").trim(),
      category: String(formData.get("category") || ""),
      type: String(formData.get("type") || "")
    });
  });

  document.getElementById("clearFiltersButton").addEventListener("click", () => setSearchParams({ keyword: "", category: "", type: "" }));
  document.querySelectorAll("[data-chip-type]").forEach((button) => {
    button.addEventListener("click", () => {
      setSearchParams({
        keyword: params.keyword,
        category: "",
        type: button.dataset.chipType || ""
      });
    });
  });
  document.querySelectorAll("[data-chip-category]").forEach((button) => {
    button.addEventListener("click", () => {
      setSearchParams({
        keyword: params.keyword,
        category: button.dataset.chipCategory || "",
        type: params.type
      });
    });
  });
}

function getViewerMarkup(resource) {
  if (resource.fileType === "PDF" && resource.resourceUrl) {
    return `<iframe class="viewer-frame" title="${escapeAttribute(resource.title)}" src="${resource.resourceUrl}"></iframe>`;
  }
  if (resource.fileType === "Video" && resource.resourceUrl) {
    return `<video class="viewer-frame" controls src="${resource.resourceUrl}"></video>`;
  }
  return `<pre class="data-preview">${escapeHtml(resource.dataText || "No preview available for this data resource.")}</pre>`;
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
          </div>
          <div class="detail-meta">
            <span>${refreshed.fileType}</span>
            <span>${formatDate(refreshed.uploadDate)}</span>
            <span>${refreshed.views} views</span>
            <span>${refreshed.authorSource}</span>
          </div>
          <div class="viewer-actions">
            <a class="button" href="#search">Back to Results</a>
            ${refreshed.resourceUrl ? `<a class="button button--ghost" href="${refreshed.resourceUrl}" target="_blank" rel="noopener noreferrer">Open in New Tab</a>` : ""}
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
    upload: "Encoder uploads are submitted for review before administrators approve them for students.",
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
        <p class="helper-text">Default seeded accounts: <strong>admin / admin123</strong> and <strong>encoder / encode123</strong></p>
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
  const canApproveResources = isAdministrator();
  return `
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
    <div id="resourceEditorMount"></div>
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

function renderUploadModule(resource = null) {
  const isEdit = Boolean(resource);
  const resourceStatus = resource?.status || "Pending Review";
  const canEditStatus = isAdministrator();
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
    <section class="form-card">
      <h3>${isEdit ? "Edit Resource" : "Upload New Resource"}</h3>
      <p class="upload-note">${canEditStatus ? "Use the review status to approve, hold, or hide a resource after checking its details." : "New uploads are submitted as Pending Review. An administrator will approve them after checking the details."}</p>
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
          ${isEdit ? `<button class="button button--ghost" type="button" id="cancelEditButton">Cancel</button>` : ""}
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
      const mount = document.getElementById("resourceEditorMount");
      mount.innerHTML = renderUploadModule(resource);
      attachUploadEvents();
      mount.scrollIntoView({ behavior: "smooth", block: "start" });
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

function attachUploadEvents() {
  const form = document.getElementById("resourceForm");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await apiRequest("save_resource", { method: "POST", body: new FormData(form) });
      if (form.querySelector('[name="id"]').value) {
        showToast("Resource updated.");
      } else {
        showToast(isAdministrator() ? "Resource uploaded." : "Resource submitted for review.");
      }
      render();
    } catch (error) {
      showToast(error.message);
    }
  });

  const cancelButton = document.getElementById("cancelEditButton");
  if (cancelButton) {
    cancelButton.addEventListener("click", () => render());
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

  const module = state.route.id || "dashboard";
  const resources = [...state.db.resources].sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));
  const mostViewed = [...state.db.resources].sort((a, b) => b.views - a.views).slice(0, 5);
  const recentUploads = resources.slice(0, 5);
  const pendingCount = state.db.resources.filter((item) => item.status === "Pending Review").length;
  const activeCount = state.db.resources.filter((item) => item.status === "Active").length;
  const inactiveCount = state.db.resources.filter((item) => item.status === "Inactive").length;

  app.innerHTML = `
    <section class="view">
      <div class="admin-layout">
        <aside class="admin-sidebar">
          <div>
            <h2>Admin Page</h2>
            <p class="muted">Manage learning resources, categories, reports, and users.</p>
          </div>
          <nav class="admin-nav" id="adminNav">
            ${[
              ["dashboard", "Dashboard"],
              ["resources", "Learning Resource Management"],
              ["categories", "Category Management"],
              ["upload", "Upload Files"],
              ["reports", "Reports"],
              ["users", "User Management"]
            ].map(([key, label]) => `<button type="button" class="${module === key ? "active" : ""}" data-module="${key}">${label}</button>`).join("")}
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
          <article class="stat-card"><h3>Pending Review</h3><strong>${pendingCount}</strong><span class="muted">Waiting for administrator approval</span></article>
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
