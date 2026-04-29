const app = document.getElementById("app");
const topbarActions = document.getElementById("topbarActions");
const publicNav = document.getElementById("publicNav");
const resourceCardTemplate = document.getElementById("resourceCardTemplate");
const brandLink = document.querySelector(".brand");
const brandMark = document.querySelector(".brand-mark");
const brandTitle = document.querySelector(".brand strong");
const brandDescription = document.querySelector(".brand small");

const state = {
  db: {
    settings: {
      siteTitle: "Learning Resource System",
      siteDescription: "School of Fisheries",
      logoUrl: ""
    },
    categories: [],
    resources: [],
    users: [],
    auditLogs: []
  },
  notifications: [],
  session: null,
  route: parseRoute(),
  toastTimer: null,
  loading: true
};

const RESOURCE_STATUSES = ["Pending Review", "Active", "Inactive"];
const NOTIFICATIONS_STORAGE_KEY = "lrs_notifications";

state.notifications = loadNotifications();

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

function buildAssetUrl(path, version) {
  if (!path) return "";
  const separator = path.includes("?") ? "&" : "?";
  return version ? `${path}${separator}v=${encodeURIComponent(version)}` : path;
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function formatCompactDate(dateString) {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}

function getCurrentUser() {
  if (!state.session) return null;
  return state.db.users.find((user) => Number(user.id) === Number(state.session.id)) || state.session;
}

function applyBranding() {
  const title = state.db.settings?.siteTitle || "Learning Resource System";
  const description = state.db.settings?.siteDescription || "School of Fisheries";
  const logoUrl = state.db.settings?.logoUrl || "";
  const logoVersion = state.db.settings?.logoUpdatedAt || "";
  const logoAssetUrl = buildAssetUrl(logoUrl, logoVersion);

  if (brandTitle) {
    brandTitle.textContent = title;
  }

  if (brandDescription) {
    brandDescription.textContent = description;
  }

  if (brandLink) {
    brandLink.setAttribute("aria-label", `${description} ${title}`.trim());
  }

  if (brandMark) {
    if (logoAssetUrl) {
      brandMark.innerHTML = `<img class="brand-mark__image" src="${escapeAttribute(logoAssetUrl)}" alt="${escapeAttribute(title)}">`;
    } else {
      brandMark.textContent = "SF";
    }
  }

  document.title = `${description} ${title}`.trim();

  let favicon = document.getElementById("appFavicon");
  if (!favicon) {
    favicon = document.createElement("link");
    favicon.id = "appFavicon";
    favicon.rel = "icon";
    document.head.appendChild(favicon);
  }
  favicon.href = logoAssetUrl || favicon.dataset.defaultIcon || favicon.href;
}

function getProfileImageMarkup(user) {
  if (user?.profileImage) {
    return `<img class="profile-avatar__image" src="${escapeAttribute(user.profileImage)}" alt="${escapeAttribute(user.fullName || "Profile image")}">`;
  }

  const initial = escapeHtml((user?.fullName || state.session?.fullName || "U").trim().charAt(0).toUpperCase() || "U");
  return `<span class="profile-avatar__initial" aria-hidden="true">${initial}</span>`;
}

function getTopbarAvatarMarkup(user) {
  if (user?.profileImage) {
    return `<img class="topbar-avatar__image" src="${escapeAttribute(user.profileImage)}" alt="${escapeAttribute(user.fullName || "Profile image")}">`;
  }

  const initial = escapeHtml((user?.fullName || state.session?.fullName || "U").trim().charAt(0).toUpperCase() || "U");
  return `<span class="topbar-avatar__initial" aria-hidden="true">${initial}</span>`;
}

function closeAvatarPreviewModal() {
  document.getElementById("avatarPreviewModal")?.remove();
  if (window.LRSAvatarPreviewEscapeHandler) {
    document.removeEventListener("keydown", window.LRSAvatarPreviewEscapeHandler);
    window.LRSAvatarPreviewEscapeHandler = null;
  }
}

function openAvatarPreviewModal(user) {
  closeAvatarPreviewModal();

  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.id = "avatarPreviewModal";
  modal.innerHTML = `
    <div class="modal-dialog modal-dialog--avatar" role="dialog" aria-modal="true" aria-labelledby="avatarPreviewTitle">
      <div class="modal-card avatar-preview-card">
        <div class="section-heading modal-card__header">
          <div>
            <h3 id="avatarPreviewTitle">Profile Image</h3>
            <p>View the current profile image.</p>
          </div>
        </div>
        <div class="avatar-preview-card__body">
          <div class="avatar-preview-card__image">
            ${getProfileImageMarkup(user)}
          </div>
        </div>
        <div class="inline-actions modal-card__actions">
          <button class="button button--ghost" type="button" id="closeAvatarPreviewButton">Close</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeAvatarPreviewModal();
    }
  });

  document.getElementById("closeAvatarPreviewButton")?.addEventListener("click", closeAvatarPreviewModal);

  const handleEscape = (event) => {
    if (event.key === "Escape") {
      closeAvatarPreviewModal();
    }
  };
  window.LRSAvatarPreviewEscapeHandler = handleEscape;
  document.addEventListener("keydown", handleEscape);
}

function closePasswordModal() {
  document.getElementById("passwordFlowModal")?.remove();
  if (window.LRSPasswordModalEscapeHandler) {
    document.removeEventListener("keydown", window.LRSPasswordModalEscapeHandler);
    window.LRSPasswordModalEscapeHandler = null;
  }
}

function openPasswordConfirmModal() {
  closePasswordModal();

  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.id = "passwordFlowModal";
  modal.innerHTML = `
    <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="passwordConfirmTitle">
      <div class="modal-card">
        <div class="section-heading modal-card__header">
          <div>
            <h3 id="passwordConfirmTitle">Change Password</h3>
            <p>You are about to update your account password.</p>
          </div>
        </div>
        <p class="muted">Do you want to continue to the password change form?</p>
        <div class="inline-actions modal-card__actions">
          <button class="button button--ghost" type="button" id="cancelPasswordFlowButton">Cancel</button>
          <button class="button" type="button" id="continuePasswordFlowButton">Continue</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closePasswordModal();
    }
  });

  document.getElementById("cancelPasswordFlowButton")?.addEventListener("click", closePasswordModal);
  document.getElementById("continuePasswordFlowButton")?.addEventListener("click", openPasswordChangeModal);

  const handleEscape = (event) => {
    if (event.key === "Escape") {
      closePasswordModal();
    }
  };
  window.LRSPasswordModalEscapeHandler = handleEscape;
  document.addEventListener("keydown", handleEscape);
}

function openPasswordChangeModal() {
  closePasswordModal();

  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.id = "passwordFlowModal";
  modal.innerHTML = `
    <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="passwordChangeTitle">
      <div class="modal-card">
        <div class="section-heading modal-card__header">
          <div>
            <h3 id="passwordChangeTitle">Update Password</h3>
            <p>Enter your current password and choose a new one.</p>
          </div>
        </div>
        <form class="modal-form" id="passwordChangeForm">
          <label class="field">
            <input type="password" name="currentPassword" placeholder="Current password" required>
          </label>
          <label class="field">
            <input type="password" name="newPassword" placeholder="New password" minlength="8" required>
          </label>
          <label class="field">
            <input type="password" name="confirmPassword" placeholder="Confirm new password" minlength="8" required>
          </label>
          <div class="inline-actions modal-card__actions">
            <button class="button button--ghost" type="button" id="cancelPasswordChangeButton">Cancel</button>
            <button class="button" type="submit">Save Password</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closePasswordModal();
    }
  });

  document.getElementById("cancelPasswordChangeButton")?.addEventListener("click", closePasswordModal);
  document.getElementById("passwordChangeForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;

    try {
      await apiRequest("change_password", { method: "POST", body: new FormData(form) });
      closePasswordModal();
      addNotification("Password Changed", "Your account password was updated.");
      showToast("Password updated.");
    } catch (error) {
      showToast(error.message);
    }
  });

  const handleEscape = (event) => {
    if (event.key === "Escape") {
      closePasswordModal();
    }
  };
  window.LRSPasswordModalEscapeHandler = handleEscape;
  document.addEventListener("keydown", handleEscape);
}

function getLocalDateInputValue(date = new Date()) {
  const offsetDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return offsetDate.toISOString().slice(0, 10);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** exponent);
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

function getUploadListActionIcon(type) {
  if (type === "view") {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M1.5 12s3.8-6.5 10.5-6.5S22.5 12 22.5 12s-3.8 6.5-10.5 6.5S1.5 12 1.5 12Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
        <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"></circle>
      </svg>
    `;
  }

  if (type === "download") {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 3.5v10.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
        <path d="m8.2 10.8 3.8 3.8 3.8-3.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
        <path d="M4.5 18.5h15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4.5 7.5h15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
      <path d="M9.5 3.8h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
      <path d="M7.5 7.5v11a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5v-11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
      <path d="M10 11v5M14 11v5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
    </svg>
  `;
}

function getExistingFileLabel(file, fallbackTitle, index) {
  return file?.originalFilename || `${fallbackTitle || "Resource"}-${index + 1}`;
}

function buildExistingFileItemMarkup(file, index, fallbackTitle) {
  const fileLabel = getExistingFileLabel(file, fallbackTitle, index);
  const fileUrl = file?.resourceUrl || "";
  const fileType = file?.fileType || "File";

  return `
    <article class="existing-files-card__item">
      <div class="existing-files-card__content">
        <strong>${escapeHtml(fileLabel)}</strong>
        <span>${escapeHtml(fileType)}</span>
      </div>
      <div class="existing-files-card__actions">
        <button class="icon-button icon-button--ghost existing-files-card__action" type="button" data-view-existing-file="${index}" aria-label="View ${escapeAttribute(fileLabel)}" title="View">
          ${getUploadListActionIcon("view")}
        </button>
        <a class="icon-button icon-button--ghost existing-files-card__action" data-download-existing-file="${index}" href="${escapeAttribute(fileUrl || "#")}" ${fileUrl ? `download="${escapeAttribute(fileLabel)}"` : ""} aria-label="Download ${escapeAttribute(fileLabel)}" title="Download" ${fileUrl ? "" : 'aria-disabled="true" tabindex="-1"'}>
          ${getUploadListActionIcon("download")}
        </a>
        <button class="icon-button icon-button--danger existing-files-card__action" type="button" data-remove-existing-file="${index}" aria-label="Delete ${escapeAttribute(fileLabel)}" title="Delete">
          ${getUploadListActionIcon("delete")}
        </button>
      </div>
    </article>
  `;
}

function loadNotifications() {
  try {
    const parsed = JSON.parse(localStorage.getItem(NOTIFICATIONS_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function saveNotifications() {
  localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(state.notifications));
}

function addNotification(title, detail = "") {
  state.notifications = [
    {
      id: Date.now(),
      title,
      detail,
      createdAt: new Date().toISOString(),
      read: false
    },
    ...state.notifications
  ].slice(0, 20);
  saveNotifications();
}

function markNotificationsRead() {
  let hasUnread = false;
  state.notifications = state.notifications.map((notification) => {
    if (notification.read) return notification;
    hasUnread = true;
    return { ...notification, read: true };
  });

  if (hasUnread) {
    saveNotifications();
  }

  return hasUnread;
}

function formatNotificationTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
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
    applyBranding();
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
    topbarActions.innerHTML = `<a class="button button--ghost" href="#admin">Log In</a>`;
    return;
  }

  const currentUser = getCurrentUser();
  const unreadCount = state.notifications.filter((notification) => !notification.read).length;

  topbarActions.innerHTML = `
    <div class="notification-menu" id="notificationMenu">
      <button class="icon-button icon-button--ghost topbar-bell" type="button" id="notificationBell" aria-label="Notifications" aria-expanded="false" aria-haspopup="true">
        <span aria-hidden="true">&#128276;</span>
        ${unreadCount ? `<span class="topbar-bell__badge">${unreadCount > 9 ? "9+" : unreadCount}</span>` : ""}
      </button>
      <div class="notification-menu__dropdown" id="notificationDropdown" hidden>
        <div class="notification-menu__header">
          <strong>Notifications</strong>
          ${state.notifications.length
            ? `<button class="notification-menu__mark-read" type="button" id="markNotificationsReadButton"${unreadCount ? "" : " disabled"}>Mark all as read</button>`
            : ""}
        </div>
        ${state.notifications.length
          ? `<ul class="notification-menu__list">
              ${state.notifications.map((notification) => `
                <li class="notification-menu__item ${notification.read ? "" : "is-unread"}">
                  <strong>${escapeHtml(notification.title || "Notification")}</strong>
                  ${notification.detail ? `<p>${escapeHtml(notification.detail)}</p>` : ""}
                  <span>${escapeHtml(formatNotificationTime(notification.createdAt))}</span>
                </li>
              `).join("")}
            </ul>`
          : `<div class="notification-menu__empty">No notifications yet.</div>`}
      </div>
    </div>
    <button class="topbar-avatar" type="button" id="profileAvatarButton" aria-label="Open profile">
      ${getTopbarAvatarMarkup(currentUser)}
    </button>
    <div class="user-menu" id="userMenu">
      <div class="user-menu__trigger">
        <button class="user-menu__role-button" type="button" id="userMenuRoleButton">${state.session.role}</button>
        <button class="user-menu__caret-button" type="button" id="userMenuButton" aria-expanded="false" aria-haspopup="true">
        <span class="user-menu__caret" aria-hidden="true">▾</span>
      </button>
      </div>
      <div class="user-menu__dropdown" id="userMenuDropdown" hidden>
        <button class="user-menu__item" type="button" id="profileButton">Profile</button>
        ${isAdministrator() ? `<button class="user-menu__item" type="button" id="settingsButton">Settings</button>` : ""}
        <button class="user-menu__item user-menu__item--danger" type="button" id="logoutButton">Log Out</button>
      </div>
    </div>
  `;

  const notificationMenu = document.getElementById("notificationMenu");
  const notificationBell = document.getElementById("notificationBell");
  const notificationDropdown = document.getElementById("notificationDropdown");
  const markNotificationsReadButton = document.getElementById("markNotificationsReadButton");
  const userMenu = document.getElementById("userMenu");
  const userMenuRoleButton = document.getElementById("userMenuRoleButton");
  const userMenuButton = document.getElementById("userMenuButton");
  const userMenuDropdown = document.getElementById("userMenuDropdown");
  const profileAvatarButton = document.getElementById("profileAvatarButton");

  notificationBell.addEventListener("click", () => {
    const isOpen = !notificationDropdown.hidden;
    notificationDropdown.hidden = isOpen;
    notificationBell.setAttribute("aria-expanded", String(!isOpen));
    notificationMenu.classList.toggle("is-open", !isOpen);
    userMenuDropdown.hidden = true;
    userMenuButton.setAttribute("aria-expanded", "false");
    userMenu.classList.remove("is-open");
  });

  markNotificationsReadButton?.addEventListener("click", () => {
    if (!markNotificationsRead()) {
      return;
    }

    updateTopbar();
  });

  userMenuButton.addEventListener("click", () => {
    const isOpen = !userMenuDropdown.hidden;
    userMenuDropdown.hidden = isOpen;
    userMenuButton.setAttribute("aria-expanded", String(!isOpen));
    userMenu.classList.toggle("is-open", !isOpen);
    notificationDropdown.hidden = true;
    notificationBell.setAttribute("aria-expanded", "false");
    notificationMenu.classList.remove("is-open");
  });

  userMenuRoleButton.addEventListener("click", () => {
    navigate("admin/dashboard");
  });

  profileAvatarButton.addEventListener("click", () => {
    openAvatarPreviewModal(currentUser);
  });

  document.getElementById("profileButton").addEventListener("click", () => {
    userMenuDropdown.hidden = true;
    userMenuButton.setAttribute("aria-expanded", "false");
    userMenu.classList.remove("is-open");
    navigate("profile");
  });

  document.getElementById("settingsButton")?.addEventListener("click", () => {
    userMenuDropdown.hidden = true;
    userMenuButton.setAttribute("aria-expanded", "false");
    userMenu.classList.remove("is-open");
    navigate("settings");
  });

  document.getElementById("logoutButton").addEventListener("click", async () => {
    try {
      userMenuDropdown.hidden = true;
      userMenuButton.setAttribute("aria-expanded", "false");
      userMenu.classList.remove("is-open");
      await apiRequest("logout", { method: "POST" });
      showToast("You have been logged out.");
      navigate("home");
      await loadBootstrap();
    } catch (error) {
      showToast(error.message);
    }
  });
}

document.addEventListener("click", (event) => {
  const notificationMenu = document.getElementById("notificationMenu");
  const notificationBell = document.getElementById("notificationBell");
  const notificationDropdown = document.getElementById("notificationDropdown");
  const userMenu = document.getElementById("userMenu");
  const userMenuButton = document.getElementById("userMenuButton");
  const userMenuDropdown = document.getElementById("userMenuDropdown");

  if (!userMenu || !userMenuButton || !userMenuDropdown || !notificationMenu || !notificationBell || !notificationDropdown) {
    return;
  }

  if (!notificationMenu.contains(event.target)) {
    notificationDropdown.hidden = true;
    notificationBell.setAttribute("aria-expanded", "false");
    notificationMenu.classList.remove("is-open");
  }

  if (!userMenu.contains(event.target)) {
    userMenuDropdown.hidden = true;
    userMenuButton.setAttribute("aria-expanded", "false");
    userMenu.classList.remove("is-open");
  }
});

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

function buildResourceFiles(resource) {
  return Array.isArray(resource.files) && resource.files.length
    ? resource.files
    : [{
        fileType: resource.fileType,
        sourceMode: resource.sourceMode,
        resourceUrl: resource.resourceUrl,
        dataText: resource.dataText,
        storedFilename: null,
        originalFilename: resource.originalFilename || resource.title,
        mimeType: null
      }].filter((file) => file.resourceUrl || file.dataText);
}

function getViewerMarkup(resource) {
  const files = buildResourceFiles(resource);
  if (files.length) {
    return `
      <div class="download-panel">
        <h3>Download Resource</h3>
        <p>Files available in this topic.</p>
        <ul class="download-list">
          ${files.map((file, index) => `
            <li class="download-list__item">
              <div class="download-list__content">
                <strong>${escapeHtml(file.originalFilename || `${resource.title}-${index + 1}`)}</strong>
                <span>${escapeHtml(file.fileType || resource.fileType)} file</span>
              </div>
              ${file.resourceUrl
                ? `<a class="icon-button icon-button--ghost download-list__button" href="${file.resourceUrl}" download aria-label="Download ${escapeAttribute(file.originalFilename || resource.title)}"><span aria-hidden="true">&#8595;</span></a>`
                : `<button class="icon-button icon-button--ghost download-list__button" type="button" data-download-file="${index}" aria-label="Download ${escapeAttribute(file.originalFilename || resource.title)}"><span aria-hidden="true">&#8595;</span></button>`}
            </li>
          `).join("")}
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
              ${buildResourceFiles(refreshed).length ? `<button class="button button--ghost" type="button" id="downloadAllResourceFilesButton">Download Files</button>` : ""}
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

  const resourceFiles = buildResourceFiles(refreshed);
  const downloadFile = (file) => {
    if (!file?.dataText) return;
    const extension = (file.fileType || refreshed.fileType) === "Data" ? "txt" : String(file.fileType || refreshed.fileType).toLowerCase();
    const safeTitle = String(file.originalFilename || refreshed.title).replace(/[^a-z0-9-_.]+/gi, "-").replace(/^-+|-+$/g, "") || "resource";
    const blob = new Blob([file.dataText], { type: file.mimeType || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = safeTitle.includes(".") ? safeTitle : `${safeTitle}.${extension}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  document.querySelectorAll("[data-download-file]").forEach((button) => {
    button.addEventListener("click", () => {
      downloadFile(resourceFiles[Number(button.dataset.downloadFile)]);
    });
  });
  document.getElementById("downloadAllResourceFilesButton")?.addEventListener("click", () => {
    resourceFiles.forEach((file, index) => {
      if (file.resourceUrl) {
        const link = document.createElement("a");
        link.href = file.resourceUrl;
        link.download = file.originalFilename || `${refreshed.title}-${index + 1}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        return;
      }
      downloadFile(file);
    });
  });
}

function getModuleTitle(module) {
  return {
    dashboard: "Dashboard",
    resources: "Learning Resource Management",
    categories: "Category Management",
    reports: "Reports",
    users: "User Management",
    audit: "Audit Log"
  }[module] || "Dashboard";
}

function getModuleDescription(module) {
  return {
    dashboard: "Overview of resources, recent uploads, and top-performing learning materials.",
    resources: "Review, edit, approve, activate, or deactivate fisheries learning resources.",
    categories: "Maintain categories used in student browsing and filtering.",
    reports: "View resource summaries by type, category, and publication status.",
    users: "Manage encoder and administrator accounts.",
    audit: "Monitor account sign-ins and administrator activity such as adding, editing, deleting, and uploading."
  }[module] || "";
}

function renderLoginView() {
  app.innerHTML = `
    <section class="login-layout">
      <div class="login-card">
        <h1 class="login-card__title">LOGIN</h1>
        <form id="loginForm">
          <label class="login-field">
            <span class="login-field__label">Username</span>
            <span class="login-field__input-wrap">
              <span class="login-field__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <circle cx="12" cy="8" r="3.5" fill="none" stroke="currentColor" stroke-width="1.8"></circle>
                  <path d="M5 19c1.7-3 4.1-4.5 7-4.5s5.3 1.5 7 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
                </svg>
              </span>
              <input type="text" name="username" placeholder="Enter your username" required>
            </span>
          </label>
          <label class="login-field">
            <span class="login-field__label">Password</span>
            <span class="login-field__input-wrap">
              <span class="login-field__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <rect x="6.5" y="10.5" width="11" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"></rect>
                  <path d="M9 10.5V8.5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
                </svg>
              </span>
              <input type="password" name="password" id="loginPasswordInput" placeholder="Enter your password" required>
              <button class="login-field__toggle" type="button" id="toggleLoginPassword" aria-label="Show password" aria-pressed="false">
                <svg class="login-field__toggle-icon login-field__toggle-icon--show" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d="M1.5 12s3.8-6.5 10.5-6.5S22.5 12 22.5 12s-3.8 6.5-10.5 6.5S1.5 12 1.5 12Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
                  <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"></circle>
                </svg>
                <svg class="login-field__toggle-icon login-field__toggle-icon--hide" viewBox="0 0 24 24" focusable="false" aria-hidden="true" hidden>
                  <path d="M3 3l18 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
                  <path d="M10.6 6A11.6 11.6 0 0 1 12 5.5C18.7 5.5 22.5 12 22.5 12a18.7 18.7 0 0 1-4.1 4.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
                  <path d="M6.2 7.3A18.7 18.7 0 0 0 1.5 12s3.8 6.5 10.5 6.5c1 0 2-.1 2.9-.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
              </button>
            </span>
          </label>
          <div class="login-card__options">
            <label class="login-check">
              <input type="checkbox" name="remember">
              <span>Remember me</span>
            </label>
            <button class="login-link" type="button" id="forgotPasswordButton">Forgot Password?</button>
          </div>
          <button class="button login-card__button" type="submit">Login</button>
        </form>
      </div>
    </section>
  `;

  document.getElementById("forgotPasswordButton").addEventListener("click", () => {
    showToast("Please contact the administrator to reset your password.");
  });

  document.getElementById("toggleLoginPassword").addEventListener("click", () => {
    const passwordInput = document.getElementById("loginPasswordInput");
    const toggleButton = document.getElementById("toggleLoginPassword");
    const showIcon = toggleButton.querySelector(".login-field__toggle-icon--show");
    const hideIcon = toggleButton.querySelector(".login-field__toggle-icon--hide");
    const isVisible = passwordInput.type === "text";

    passwordInput.type = isVisible ? "password" : "text";
    toggleButton.setAttribute("aria-label", isVisible ? "Show password" : "Hide password");
    toggleButton.setAttribute("aria-pressed", String(!isVisible));
    showIcon.hidden = !isVisible;
    hideIcon.hidden = isVisible;
  });

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
              <td>${formatDate(resource.uploadDate)}</td>
              <td><span class="pill ${getResourceStatusClass(resource.status)}">${resource.status}</span></td>
              <td>${resource.views}</td>
              <td class="table-actions">
                <button class="icon-button icon-button--ghost" type="button" data-view-resource="${resource.id}" title="View resource" aria-label="View resource">
                  <span aria-hidden="true">◉</span>
                </button>
                <button class="icon-button icon-button--ghost" type="button" data-edit-resource="${resource.id}" title="Edit resource" aria-label="Edit resource">
                  <span aria-hidden="true">✎</span>
                </button>
                <button class="icon-button icon-button--soft" type="button" data-toggle-resource="${resource.id}" title="${resource.status === "Active" ? "Deactivate resource" : "Activate resource"}" aria-label="${resource.status === "Active" ? "Deactivate resource" : "Activate resource"}">
                  <span aria-hidden="true">${resource.status === "Active" ? "◐" : "✓"}</span>
                </button>
                ${isAdministrator() ? `<button class="icon-button icon-button--danger" type="button" data-delete-resource="${resource.id}" title="Delete resource" aria-label="Delete resource">` : ""}
                  <span aria-hidden="true">🗑</span>
                ${isAdministrator() ? `</button>` : ""}
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
      <div class="table-wrap">
        <table class="category-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Description</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${state.db.categories.map((category) => `
              <tr>
                <td><strong>${category.name}</strong></td>
                <td><span class="muted">${category.description}</span></td>
                <td>
                  <div class="table-actions category-table__actions">
                    <button class="icon-button icon-button--ghost" type="button" data-view-category="${category.id}" title="View category" aria-label="View category">
                      <span aria-hidden="true">&#9673;</span>
                    </button>
                    <button class="icon-button icon-button--soft" type="button" data-edit-category="${category.id}" title="Edit category" aria-label="Edit category">
                      <span aria-hidden="true">&#9998;</span>
                    </button>
                    ${isAdministrator() ? `<button class="icon-button icon-button--danger" type="button" data-delete-category="${category.id}" title="Delete category" aria-label="Delete category">` : ""}
                      <span aria-hidden="true">&#128465;</span>
                    ${isAdministrator() ? `</button>` : ""}
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
    <div class="modal-backdrop" id="categoryModal" hidden>
      <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="categoryModalTitle">
        <div class="modal-card">
          <div class="section-heading modal-card__header">
            <div>
              <h3 id="categoryModalTitle">Add Category</h3>
              <p id="categoryModalSubtitle">Create a new category for student browsing and admin organization.</p>
            </div>
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

function renderProfileView() {
  if (!state.session) {
    renderLoginView();
    return;
  }

  const currentUser = getCurrentUser();
  const email = currentUser?.email || `${state.session.username}@schooloffisheries.local`;
  const status = currentUser?.status || state.session.status || "Active";
  const username = currentUser?.username || state.session.username || "";
  const role = currentUser?.role || state.session.role || "";

  app.innerHTML = `
    <section class="view profile-page">
      <div class="section-heading profile-card__header">
        <div>
          <h1>Profile</h1>
          <p>Manage your account information.</p>
        </div>
        <a class="button button--ghost" href="#admin/dashboard">Back</a>
      </div>

      <section class="list-card profile-settings-card">
        <div class="profile-settings-card__heading">
          <h2>General</h2>
          <p>Public information about your account.</p>
        </div>
        <form class="profile-form profile-settings-form" id="profileForm" enctype="multipart/form-data">
          <div class="profile-settings-form__layout">
            <div class="profile-settings-avatar-panel">
              <div class="profile-avatar profile-avatar--large" id="profileAvatarPreview">${getProfileImageMarkup(currentUser)}</div>
              <input class="file-upload-input" type="file" name="profileImage" id="profileImageInput" accept=".jpg,.jpeg,.png,.webp">
              <label class="profile-settings-avatar-panel__link" for="profileImageInput">Update image</label>
            </div>

            <div class="profile-settings-fields">
              <label class="profile-info-row">
                <span class="profile-info-row__label">Displayed Name</span>
                <input type="text" value="${escapeAttribute(username)}" readonly>
              </label>
              <label class="profile-info-row">
                <span class="profile-info-row__label">Full Name</span>
                <input type="text" name="fullName" value="${escapeAttribute(currentUser?.fullName || state.session.fullName)}" required>
              </label>
              <label class="profile-info-row">
                <span class="profile-info-row__label">Role</span>
                <input type="text" value="${escapeAttribute(role)}" readonly>
              </label>
              <label class="profile-info-row">
                <span class="profile-info-row__label">Email</span>
                <input type="email" name="email" value="${escapeAttribute(email)}" required>
              </label>
              <label class="profile-info-row">
                <span class="profile-info-row__label">Account Status</span>
                <input type="text" value="${escapeAttribute(status)}" readonly>
              </label>
            </div>
          </div>

          <div class="inline-actions modal-card__actions profile-settings-form__actions">
            <button class="button" type="submit">Save Profile</button>
          </div>
        </form>
      </section>

      <section class="list-card profile-settings-card">
        <div class="profile-settings-card__heading">
          <h2>Login info</h2>
          <p>The credentials for authorization.</p>
        </div>
        <div class="profile-login-fields">
          <label class="profile-info-row">
            <span class="profile-info-row__label">Username</span>
            <input type="text" value="${escapeAttribute(username)}" readonly>
          </label>
          <label class="profile-info-row">
            <span class="profile-info-row__label">Password</span>
            <input type="text" value=".............." readonly>
          </label>
          <div class="inline-actions profile-login-fields__actions">
            <button class="button button--soft" type="button" id="changePasswordButton">Change password</button>
          </div>
        </div>
      </section>
    </section>
  `;

  const profileForm = document.getElementById("profileForm");
  const profileImageInput = document.getElementById("profileImageInput");
  const profileAvatarPreview = document.getElementById("profileAvatarPreview");

  profileImageInput?.addEventListener("change", () => {
    const selectedFile = profileImageInput.files?.[0];
    if (!selectedFile) return;

    const reader = new FileReader();
    reader.onload = () => {
      profileAvatarPreview.innerHTML = `<img class="profile-avatar__image" src="${reader.result}" alt="Profile preview">`;
    };
    reader.readAsDataURL(selectedFile);
  });

  profileForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await apiRequest("update_profile", { method: "POST", body: new FormData(profileForm) });
      addNotification("Profile Updated", "Your profile information was edited.");
      showToast("Profile updated.");
      render();
    } catch (error) {
      showToast(error.message);
    }
  });

  document.getElementById("changePasswordButton")?.addEventListener("click", openPasswordConfirmModal);
}

function renderSettingsView() {
  if (!isAdministrator()) {
    navigate("home");
    return;
  }

  const settings = state.db.settings || {};
  const settingsLogoUrl = buildAssetUrl(settings.logoUrl || "", settings.logoUpdatedAt || "");
  const settingsLogoMarkup = settings.logoUrl
    ? `<img class="settings-header__avatar-image" src="${escapeAttribute(settingsLogoUrl)}" alt="${escapeAttribute(settings.siteTitle || "Site logo")}">`
    : `<span class="settings-header__avatar-fallback" aria-hidden="true">SF</span>`;
  app.innerHTML = `
    <section class="view">
      <section class="list-card profile-card">
        <div class="section-heading profile-card__header">
          <div class="settings-header">
            <div class="settings-header__avatar">
              ${settingsLogoMarkup}
            </div>
            <div>
              <h1>Settings</h1>
              <p>Edit the site title and description shown in the header.</p>
            </div>
          </div>
          <a class="button button--ghost" href="#admin/dashboard">Back</a>
        </div>
        <form class="profile-form" id="settingsForm" enctype="multipart/form-data">
          <label class="field">
            <span class="login-field__label">Title</span>
            <input type="text" name="siteTitle" value="${escapeAttribute(settings.siteTitle || "Learning Resource System")}" required>
          </label>
          <label class="field">
            <span class="login-field__label">Description</span>
            <input type="text" name="siteDescription" value="${escapeAttribute(settings.siteDescription || "School of Fisheries")}" required>
          </label>
          <div class="field field--file-upload">
            <span class="login-field__label">Logo</span>
            <input class="file-upload-input" type="file" name="siteLogo" id="siteLogoInput" accept=".jpg,.jpeg,.png,.webp,.svg">
            <label class="upload-file-summary" for="siteLogoInput" id="siteLogoSummary">
              <span class="upload-file-summary__button">Choose Logo</span>
              <span class="upload-file-summary__placeholder" id="siteLogoPlaceholder">${settings.logoUrl ? "Current logo selected" : "No logo chosen"}</span>
            </label>
            ${settings.logoUrl ? `<div class="settings-logo-preview"><img src="${escapeAttribute(settingsLogoUrl)}" alt="Current logo"></div>` : ""}
          </div>
          <div class="inline-actions modal-card__actions">
            <button class="button" type="submit">Save Settings</button>
          </div>
        </form>
      </section>
    </section>
  `;

  document.getElementById("settingsForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await apiRequest("update_settings", { method: "POST", body: new FormData(event.currentTarget) });
      addNotification("Settings Updated", "Site title and description were updated.");
      showToast("Settings updated.");
      render();
    } catch (error) {
      showToast(error.message);
    }
  });

  document.getElementById("siteLogoInput")?.addEventListener("change", (event) => {
    const file = event.currentTarget.files?.[0];
    const placeholder = document.getElementById("siteLogoPlaceholder");
    if (placeholder) {
      placeholder.textContent = file ? file.name : (settings.logoUrl ? "Current logo selected" : "No logo chosen");
    }
  });
}

function renderUploadModule(resource = null, options = {}) {
  const isEdit = Boolean(resource);
  const resourceStatus = resource?.status || "Active";
  const canEditStatus = isAdministrator();
  const wrapperClass = options.modal ? "resource-form-shell resource-form-shell--modal" : "form-card";
  const resourceFiles = Array.isArray(resource?.files) ? resource.files : [];
  const hasMultipleFiles = resourceFiles.length > 1;
  const resourceUrlValue = hasMultipleFiles ? "" : (resource?.resourceUrl || "");
  const dataTextValue = hasMultipleFiles ? "" : (resource?.dataText || "");
  const existingFilesCard = isEdit && resourceFiles.length
    ? `
        <section class="existing-files-card">
          <div class="existing-files-card__header">
            <strong>Uploaded Files</strong>
            <span>${resourceFiles.length} file${resourceFiles.length === 1 ? "" : "s"}</span>
          </div>
          <input type="hidden" name="retainedExistingFiles" value="${escapeAttribute(JSON.stringify(resourceFiles))}" id="retainedExistingFilesInput">
          <div class="existing-files-card__list" id="existingFilesList">
            ${resourceFiles.map((file, index) => buildExistingFileItemMarkup(file, index, resource?.title || "Resource")).join("")}
          </div>
        </section>
      `
    : "";
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
          <label class="field"><input type="date" name="uploadDate" value="${resource?.uploadDate || new Date().toISOString().slice(0, 10)}" required></label>
        </div>
        <div class="report-grid">
          ${statusField}
          <label class="field"><input type="url" name="resourceUrl" placeholder="External file URL (optional)" value="${escapeAttribute(resourceUrlValue)}"></label>
        </div>
        <label class="field"><textarea name="dataText" placeholder="For data resources, paste tabular or JSON content here">${escapeHtml(dataTextValue)}</textarea></label>
        <div class="field field--file-upload">
          <input class="file-upload-input" type="file" name="uploadFile[]" id="resourceUploadInput" accept=".pdf,.mp4,.mov,.csv,.json,.txt,.jpeg,.jpg" multiple>
          <label class="upload-file-summary" for="resourceUploadInput" id="resourceUploadSummary" aria-live="polite">
            <span class="upload-file-summary__button">Choose Files</span>
            <span class="upload-file-summary__placeholder" id="resourceUploadPlaceholder">No files chosen</span>
            <span class="upload-file-summary__list" id="resourceUploadList" hidden></span>
          </label>
        </div>
        ${existingFilesCard}
        <div class="inline-actions modal-card__actions">
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
  const typeReport = ["PDF", "Video", "Data", "Image"].map((type) => ({
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

function renderAuditLogModule() {
  const auditLogs = Array.isArray(state.db.auditLogs) ? state.db.auditLogs : [];

  return `
    <section class="list-card category-management-card">
      <div class="section-heading category-management-card__header">
        <div>
          <h3>Audit Log</h3>
          <p>Track administrator sign-ins and account activity across resources, categories, users, and profile updates.</p>
        </div>
      </div>
      <div class="table-wrap">
        <table class="audit-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Account</th>
              <th>Role</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            ${auditLogs.length
              ? auditLogs.map((log) => `
                  <tr>
                    <td>${escapeHtml(formatNotificationTime(log.createdAt))}</td>
                    <td>
                      <strong>${escapeHtml(log.actorName)}</strong><br>
                      <span class="muted">${escapeHtml(log.actorUsername)}</span>
                    </td>
                    <td>${escapeHtml(log.actorRole)}</td>
                    <td><span class="pill pill--soft">${escapeHtml(log.actionType)}</span></td>
                    <td>${escapeHtml(log.entityType)}</td>
                    <td>${escapeHtml(log.description)}</td>
                  </tr>
                `).join("")
              : `<tr><td colspan="6"><span class="muted">No audit activity recorded yet.</span></td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
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
        addNotification("Resource Status Updated", resource ? `${resource.title} was reviewed or updated.` : "A resource status was changed.");
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
        addNotification("Resource Deleted", resource ? `${resource.title} was deleted.` : "A resource was deleted.");
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

  document.querySelectorAll("[data-view-resource]").forEach((button) => {
    button.addEventListener("click", () => {
      navigate(`resource/${button.dataset.viewResource}`);
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
  closeButton?.addEventListener("click", closeModal);
  cancelButton.addEventListener("click", closeModal);
  closeViewButton?.addEventListener("click", closeViewModal);
  closeViewFooterButton.addEventListener("click", closeViewModal);

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
      const categoryName = form.querySelector('[name="name"]').value.trim();
      addNotification(
        isEdit ? "Category Updated" : "Category Added",
        categoryName ? `${categoryName} was ${isEdit ? "updated" : "added"}.` : `A category was ${isEdit ? "updated" : "added"}.`
      );
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
        addNotification("Category Deleted", "A category was deleted.");
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
  const uploadInput = form.querySelector("#resourceUploadInput");
  const uploadSummary = form.querySelector("#resourceUploadSummary");
  const uploadPlaceholder = form.querySelector("#resourceUploadPlaceholder");
  const uploadList = form.querySelector("#resourceUploadList");
  const retainedExistingFilesInput = form.querySelector("#retainedExistingFilesInput");
  const existingFilesList = form.querySelector("#existingFilesList");
  const existingFilesCount = form.querySelector(".existing-files-card__header span");
  const allowedUploadExtensions = new Set(["pdf", "mp4", "mov", "csv", "json", "txt", "jpeg", "jpg"]);
  const maxUploadBytes = 256 * 1024 * 1024;
  let selectedFiles = Array.from(uploadInput?.files || []);
  let retainedExistingFiles = [];

  if (retainedExistingFilesInput?.value) {
    try {
      const parsed = JSON.parse(retainedExistingFilesInput.value);
      retainedExistingFiles = Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      retainedExistingFiles = [];
    }
  }

  const updateUploadSummary = () => {
    if (!uploadSummary || !uploadInput || !uploadPlaceholder || !uploadList) return;
    const files = selectedFiles;
    if (!files.length) {
      uploadPlaceholder.hidden = false;
      uploadPlaceholder.textContent = "No files chosen";
      uploadList.hidden = true;
      uploadList.innerHTML = "";
      uploadSummary.classList.remove("has-files");
      return;
    }
    uploadPlaceholder.hidden = true;
    uploadList.hidden = false;
    uploadList.innerHTML = files.map((file, index) => `
      <article class="upload-file-list__item">
        <div class="upload-file-list__content">
          <strong>${escapeHtml(file.name)}</strong>
          <span>${escapeHtml((file.name.split(".").pop() || "file").toUpperCase())} - ${formatBytes(file.size || 0)}</span>
        </div>
        <div class="upload-file-list__actions">
          <button class="icon-button icon-button--ghost upload-file-list__action" type="button" data-view-upload="${index}" aria-label="View ${escapeAttribute(file.name)}" title="View">
            ${getUploadListActionIcon("view")}
          </button>
          <button class="icon-button icon-button--ghost upload-file-list__action" type="button" data-download-upload="${index}" aria-label="Download ${escapeAttribute(file.name)}" title="Download">
            ${getUploadListActionIcon("download")}
          </button>
          <button class="icon-button icon-button--danger upload-file-list__action" type="button" data-remove-upload="${index}" aria-label="Delete ${escapeAttribute(file.name)}" title="Delete">
            ${getUploadListActionIcon("delete")}
          </button>
        </div>
      </article>
    `).join("");
    uploadSummary.classList.add("has-files");
  };

  const syncInputFiles = () => {
    if (!uploadInput) return;
    const dataTransfer = new DataTransfer();
    selectedFiles.forEach((file) => dataTransfer.items.add(file));
    uploadInput.files = dataTransfer.files;
  };

  const syncRetainedExistingFiles = () => {
    if (retainedExistingFilesInput) {
      retainedExistingFilesInput.value = JSON.stringify(retainedExistingFiles);
    }
  };

  const updateExistingFilesSummary = () => {
    if (!existingFilesList || !retainedExistingFilesInput) return;
    if (existingFilesCount) {
      existingFilesCount.textContent = `${retainedExistingFiles.length} file${retainedExistingFiles.length === 1 ? "" : "s"}`;
    }
    existingFilesList.innerHTML = retainedExistingFiles.map((file, index) => buildExistingFileItemMarkup(file, index, form.querySelector('[name="title"]')?.value.trim() || "Resource")).join("");
    const card = existingFilesList.closest(".existing-files-card");
    if (card) {
      card.hidden = retainedExistingFiles.length === 0;
    }
    syncRetainedExistingFiles();
  };

  updateUploadSummary();
  updateExistingFilesSummary();
  uploadInput?.addEventListener("change", () => {
    const incomingFiles = Array.from(uploadInput.files || []);
    if (!incomingFiles.length) return;
    const validFiles = [];
    const rejectedFiles = [];

    incomingFiles.forEach((file) => {
      const extension = file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : "";
      if (allowedUploadExtensions.has(extension)) {
        validFiles.push(file);
      } else {
        rejectedFiles.push(file.name);
      }
    });

    if (rejectedFiles.length) {
      showToast(`Unsupported file type: ${rejectedFiles.join(", ")}. Use PDF, MP4, MOV, CSV, JSON, TXT, JPG, or JPEG.`);
    }

    if (!validFiles.length) {
      syncInputFiles();
      updateUploadSummary();
      return;
    }

    const nextFiles = [...selectedFiles, ...validFiles];
    const totalBytes = nextFiles.reduce((sum, file) => sum + (file.size || 0), 0);
    if (totalBytes > maxUploadBytes) {
      showToast(`Selected files are too large (${formatBytes(totalBytes)}). Maximum total upload size is ${formatBytes(maxUploadBytes)}.`);
      syncInputFiles();
      updateUploadSummary();
      return;
    }

    selectedFiles = nextFiles;
    syncInputFiles();
    updateUploadSummary();
  });
  uploadList?.addEventListener("click", (event) => {
    const actionButton = event.target.closest("button");
    if (actionButton) {
      event.preventDefault();
      event.stopPropagation();
    }

    const viewButton = event.target.closest("[data-view-upload]");
    if (viewButton) {
      const file = selectedFiles[Number(viewButton.dataset.viewUpload)];
      if (!file) return;
      const previewUrl = URL.createObjectURL(file);
      window.open(previewUrl, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(previewUrl), 60000);
      return;
    }

    const downloadButton = event.target.closest("[data-download-upload]");
    if (downloadButton) {
      const file = selectedFiles[Number(downloadButton.dataset.downloadUpload)];
      if (!file) return;
      const downloadUrl = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = file.name || "download";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
      return;
    }

    const removeButton = event.target.closest("[data-remove-upload]");
    if (!removeButton) return;
    const index = Number(removeButton.dataset.removeUpload);
    selectedFiles = selectedFiles.filter((_, fileIndex) => fileIndex !== index);
    syncInputFiles();
    updateUploadSummary();
  });

  existingFilesList?.addEventListener("click", (event) => {
    const viewButton = event.target.closest("[data-view-existing-file]");
    if (viewButton) {
      event.preventDefault();
      const file = retainedExistingFiles[Number(viewButton.dataset.viewExistingFile)];
      if (!file?.resourceUrl) return;
      window.open(file.resourceUrl, "_blank", "noopener,noreferrer");
      return;
    }

    const downloadLink = event.target.closest("[data-download-existing-file]");
    if (downloadLink) {
      const file = retainedExistingFiles[Number(downloadLink.dataset.downloadExistingFile)];
      if (!file?.resourceUrl) {
        event.preventDefault();
      }
      return;
    }

    const removeButton = event.target.closest("[data-remove-existing-file]");
    if (!removeButton) return;
    event.preventDefault();
    const index = Number(removeButton.dataset.removeExistingFile);
    retainedExistingFiles = retainedExistingFiles.filter((_, fileIndex) => fileIndex !== index);
    updateExistingFilesSummary();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const totalBytes = selectedFiles.reduce((sum, file) => sum + (file.size || 0), 0);
    if (totalBytes > maxUploadBytes) {
      showToast(`Selected files are too large (${formatBytes(totalBytes)}). Maximum total upload size is ${formatBytes(maxUploadBytes)}.`);
      return;
    }
    const payload = new FormData(form);
    const isEdit = Boolean(form.querySelector('[name="id"]').value);
    if (onComplete) {
      onComplete();
    }
    try {
      await apiRequest("save_resource", { method: "POST", body: payload });
      if (isEdit) {
        addNotification("Resource Updated", `${form.querySelector('[name="title"]').value.trim() || "A resource"} was updated.`);
        showToast("Resource updated.");
      } else {
        addNotification("Resource Uploaded", `${form.querySelector('[name="title"]').value.trim() || "A resource"} was uploaded.`);
        showToast("Resource uploaded.");
      }
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

  if (userModal && openUserModalButton && cancelUserModalButton && userForm) {
    const closeUserModal = () => {
      userModal.hidden = true;
    };

    const openUserModal = () => {
      userModal.hidden = false;
      userForm.reset();
      userForm.querySelector('[name="fullName"]').focus();
    };

    openUserModalButton.addEventListener("click", openUserModal);
    closeUserModalButton?.addEventListener("click", closeUserModal);
    cancelUserModalButton.addEventListener("click", closeUserModal);

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
        addNotification("User Added", `${userForm.querySelector('[name="fullName"]').value.trim() || "A user"} was added.`);
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
        addNotification("User Status Updated", "A user account status was changed.");
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
        addNotification("User Deleted", "A user account was deleted.");
        showToast("User deleted.");
        render();
      } catch (error) {
        showToast(error.message);
      }
    });
  });
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
      <div class="table-wrap">
        <table class="user-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Username</th>
              <th>Role</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${state.db.users.map((user) => `
              <tr>
                <td><strong>${user.fullName}</strong></td>
                <td><span class="muted">${user.username}</span></td>
                <td>${user.role}</td>
                <td><span class="pill ${user.status === "Active" ? "pill--soft" : "pill--neutral"}">${user.status}</span></td>
                <td>
                  <div class="table-actions user-table__actions">
                    <button class="icon-button icon-button--soft" type="button" data-toggle-user="${user.id}" title="${user.status === "Active" ? "Deactivate user" : "Activate user"}" aria-label="${user.status === "Active" ? "Deactivate user" : "Activate user"}" ${canManageUsers ? "" : "disabled"}>
                      <span aria-hidden="true">${user.status === "Active" ? "&#9680;" : "&#9654;"}</span>
                    </button>
                    <button class="icon-button icon-button--danger" type="button" data-delete-user="${user.id}" title="Delete user" aria-label="Delete user" ${canManageUsers ? "" : "disabled"}>
                      <span aria-hidden="true">&#128465;</span>
                    </button>
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
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
            </div>
            <form id="userForm" class="modal-form">
              <label class="field"><input type="text" name="fullName" placeholder="Full name" required></label>
              <label class="field"><input type="email" name="email" placeholder="Email address" required></label>
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
        ["reports", "Reports"],
        ["audit", "Audit Log"],
        ["users", "User Management"]
      ]
    : [
        ["dashboard", "Dashboard"],
        ["resources", "Learning Resource Management"],
        ["categories", "Category Management"]
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
  const pendingResourcesCount = state.db.resources.filter((item) => item.status === "Pending Review").length;
  const activeCount = state.db.resources.filter((item) => item.status === "Active").length;
  const inactiveCount = state.db.resources.filter((item) => item.status === "Inactive").length;

  app.innerHTML = `
    <section class="view">
      <div class="admin-layout">
        <aside class="admin-sidebar">
          <div>
            <h2>Admin Page</h2>
            <p class="muted">${isAdministrator() ? "Manage learning resources, categories, reports, users, and audit monitoring." : "Manage learning resources and categories."}</p>
          </div>
          <nav class="admin-nav" id="adminNav">
            ${adminModules.map(([key, label]) => `<button type="button" class="${module === key ? "active" : ""}" data-module="${key}">${label}</button>`).join("")}
          </nav>
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
  const renderAdminModulePanel = (content) => {
    moduleContent.innerHTML = `<div class="admin-module-panel">${content}</div>`;
  };
  switch (module) {
    case "dashboard":
      renderAdminModulePanel(`
        <div class="stats-grid">
          <article class="stat-card"><h3>Total Resources</h3><strong>${state.db.resources.length}</strong><span class="muted">All uploaded learning items</span></article>
          <article class="stat-card"><h3>Pending Resources</h3><strong>${pendingResourcesCount}</strong><span class="muted">Resources awaiting review</span></article>
          <article class="stat-card"><h3>Active Resources</h3><strong>${activeCount}</strong><span class="muted">Visible on the student page</span></article>
          <article class="stat-card"><h3>Inactive Resources</h3><strong>${inactiveCount}</strong><span class="muted">Hidden after review or archival</span></article>
        </div>
        <div class="report-grid">
          <section class="list-card">
            <h3>Recent Uploads</h3>
            <ul class="dashboard-summary-list">
              ${recentUploads.map((item) => `
                <li class="dashboard-summary-list__item">
                  <span class="dashboard-summary-list__title">${item.title}</span>
                  <strong class="dashboard-summary-list__value">${formatCompactDate(item.uploadDate)}</strong>
                </li>
              `).join("")}
            </ul>
          </section>
          <section class="list-card">
            <h3>Most Viewed Resources</h3>
            <ul class="dashboard-summary-list">
              ${mostViewed.map((item) => `
                <li class="dashboard-summary-list__item">
                  <span class="dashboard-summary-list__title">${item.title}</span>
                  <strong class="dashboard-summary-list__value">${item.views} views</strong>
                </li>
              `).join("")}
            </ul>
          </section>
        </div>
      `);
      break;
    case "resources":
      renderAdminModulePanel(renderResourcesTable(resources));
      attachResourceTableEvents();
      break;
    case "categories":
      renderAdminModulePanel(renderCategoriesModule());
      attachCategoryEvents();
      break;
    case "reports":
      renderAdminModulePanel(renderReportsModule());
      break;
    case "users":
      renderAdminModulePanel(renderUsersModule());
      attachUserEvents();
      break;
    case "audit":
      renderAdminModulePanel(renderAuditLogModule());
      break;
    default:
      navigate("admin/dashboard");
  }
}

function render() {
  state.route = parseRoute();
  document.body.classList.toggle("admin-route", state.route.name === "admin");
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

  if (state.route.name === "profile") {
    renderProfileView();
    return;
  }

  if (state.route.name === "settings") {
    renderSettingsView();
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
