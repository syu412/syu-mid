const defaultAvatar =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
      <rect width="240" height="240" rx="36" fill="#F7E9D7"/>
      <circle cx="120" cy="90" r="46" fill="#E1A85F"/>
      <path d="M48 198c0-39.764 32.236-72 72-72s72 32.236 72 72v10H48v-10z" fill="#224A3D"/>
    </svg>
  `);

const state = {
  currentUser: null,
  messages: [],
  toastTimer: null,
};

let elements = {};

document.addEventListener("DOMContentLoaded", () => {
  elements = collectElements();

  if (elements.currentYear) {
    elements.currentYear.textContent = String(new Date().getFullYear());
  }

  bindEvents();
  bootstrap().catch((error) => {
    console.error(error);
    showToast("Initialization failed. Please check your server and database setup.");
  });
});

function collectElements() {
  return {
    registerForm: document.querySelector("#register-form"),
    loginForm: document.querySelector("#login-form"),
    messageForm: document.querySelector("#message-form"),
    registerAvatarInput: document.querySelector("#register-avatar"),
    registerUsername: document.querySelector("#register-username"),
    registerPassword: document.querySelector("#register-password"),
    loginUsername: document.querySelector("#login-username"),
    loginPassword: document.querySelector("#login-password"),
    messageInput: document.querySelector("#message-input"),
    currentUserName: document.querySelector("#current-user-name"),
    currentUserAvatar: document.querySelector("#current-user-avatar"),
    statusText: document.querySelector("#status-text"),
    logoutButton: document.querySelector("#logout-button"),
    logoutTriggers: [...document.querySelectorAll("[data-logout-trigger]")],
    navLoginLinks: [...document.querySelectorAll("[data-nav-login]")],
    navRegisterLinks: [...document.querySelectorAll("[data-nav-register]")],
    jumpComposerButton: document.querySelector("#jump-composer-button"),
    messageComposer: document.querySelector("#message-composer"),
    guestHint: document.querySelector("#guest-hint"),
    composerGuard: document.querySelector("#composer-guard"),
    messageList: document.querySelector("#message-list"),
    toast: document.querySelector("#toast"),
    currentYear: document.querySelector("#current-year"),
  };
}

async function bootstrap() {
  await loadSession({ silent: false });

  if (elements.messageList) {
    await loadMessages();
  }

  updateSessionPanel();
}

function bindEvents() {
  if (elements.registerForm) {
    elements.registerForm.addEventListener("submit", handleRegister);
  }

  if (elements.loginForm) {
    elements.loginForm.addEventListener("submit", handleLogin);
  }

  if (elements.messageForm) {
    elements.messageForm.addEventListener("submit", handleMessageSubmit);
  }

  elements.logoutTriggers.forEach((trigger) => {
    trigger.addEventListener("click", handleLogout);
  });

  if (elements.jumpComposerButton && elements.messageComposer && elements.messageInput) {
    elements.jumpComposerButton.addEventListener("click", () => {
      elements.messageComposer.scrollIntoView({ behavior: "smooth", block: "start" });
      elements.messageInput.focus();
    });
  }
}

async function fetchJson(url, options = {}) {
  const requestOptions = {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  };

  const response = await fetch(url, requestOptions);
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : {};

  if (!response.ok) {
    throw new Error(payload.message || "Request failed. Please try again later.");
  }

  return payload;
}

async function loadSession({ silent } = { silent: true }) {
  try {
    const payload = await fetchJson("/api/session");
    state.currentUser = payload.user || null;
  } catch (error) {
    state.currentUser = null;
    if (!silent) {
      showToast(error.message);
    }
  }
}

async function loadMessages() {
  try {
    const payload = await fetchJson("/api/messages");
    state.messages = payload.messages || [];
    renderMessages();
  } catch (error) {
    state.messages = [];
    renderMessages();
    showToast(error.message);
  }
}

function updateSessionPanel() {
  if (state.currentUser) {
    setText(elements.currentUserName, state.currentUser.username);
    setAvatar(
      elements.currentUserAvatar,
      state.currentUser.avatarDataUrl || defaultAvatar,
      `${state.currentUser.username}'s avatar`
    );
    setText(elements.statusText, `Signed in as ${state.currentUser.username}.`);
    toggleHidden(elements.logoutButton, false);
    toggleHiddenForAll(elements.logoutTriggers, false);
    toggleHiddenForAll(elements.navLoginLinks, true);
    toggleHiddenForAll(elements.navRegisterLinks, true);
    toggleHidden(elements.guestHint, true);
    toggleHidden(elements.composerGuard, true);
    setDisabled(elements.messageInput, false);
    return;
  }

  setText(elements.currentUserName, "Guest mode");
  setAvatar(elements.currentUserAvatar, defaultAvatar, "Default guest avatar");
  setText(elements.statusText, "You are not signed in yet. Please register or log in before posting.");
  toggleHidden(elements.logoutButton, true);
  toggleHiddenForAll(elements.logoutTriggers, true);
  toggleHiddenForAll(elements.navLoginLinks, false);
  toggleHiddenForAll(elements.navRegisterLinks, false);
  toggleHidden(elements.guestHint, false);
  toggleHidden(elements.composerGuard, false);
  setDisabled(elements.messageInput, true);
}

function renderMessages() {
  if (!elements.messageList) return;

  elements.messageList.innerHTML = "";

  if (!state.messages.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "There are no messages yet. Register and log in to leave the first one.";
    elements.messageList.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const message of state.messages) {
    const card = document.createElement("article");
    card.className = "message-card";

    const avatarImage = document.createElement("img");
    avatarImage.src = message.avatarDataUrl || defaultAvatar;
    avatarImage.alt = `${message.author}'s avatar`;
    card.appendChild(avatarImage);

    const content = document.createElement("div");
    const top = document.createElement("div");
    top.className = "message-top";

    const meta = document.createElement("div");
    const author = document.createElement("strong");
    author.textContent = message.author;
    const timestamp = document.createElement("span");
    timestamp.className = "message-time";
    timestamp.textContent = formatDate(message.createdAt);
    meta.appendChild(author);
    meta.appendChild(timestamp);
    top.appendChild(meta);

    if (message.canDelete) {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "delete-button";
      deleteButton.textContent = "Delete my message";
      deleteButton.addEventListener("click", () => handleDeleteMessage(message.id));
      top.appendChild(deleteButton);
    }

    const body = document.createElement("p");
    body.className = "message-body";
    body.textContent = message.content;

    content.appendChild(top);
    content.appendChild(body);
    card.appendChild(content);
    fragment.appendChild(card);
  }

  elements.messageList.appendChild(fragment);
}

async function handleRegister(event) {
  event.preventDefault();

  const username = elements.registerUsername.value.trim();
  const password = elements.registerPassword.value;
  const file = elements.registerAvatarInput.files?.[0];

  if (!file) {
    showToast("Please upload a jpg or png avatar.");
    return;
  }

  if (!isSupportedImage(file)) {
    showToast("Only jpg, jpeg, or png avatars are allowed.");
    return;
  }

  try {
    const avatarDataUrl = await fileToDataUrl(file);
    const payload = await fetchJson("/api/register", {
      method: "POST",
      body: JSON.stringify({
        username,
        password,
        avatarDataUrl,
      }),
    });

    state.currentUser = payload.user;
    updateSessionPanel();
    elements.registerForm.reset();
    showToast(payload.message || "Registration completed.");
    redirectAfterAuth();
  } catch (error) {
    showToast(error.message);
  }
}

async function handleLogin(event) {
  event.preventDefault();

  try {
    const payload = await fetchJson("/api/login", {
      method: "POST",
      body: JSON.stringify({
        username: elements.loginUsername.value.trim(),
        password: elements.loginPassword.value,
      }),
    });

    state.currentUser = payload.user;
    updateSessionPanel();
    elements.loginForm.reset();
    showToast(payload.message || "Login successful.");
    redirectAfterAuth();
  } catch (error) {
    showToast(error.message);
  }
}

async function handleLogout() {
  try {
    const payload = await fetchJson("/api/logout", {
      method: "POST",
    });

    state.currentUser = null;
    updateSessionPanel();
    await loadMessages();
    showToast(payload.message || "Logged out successfully.");
  } catch (error) {
    showToast(error.message);
  }
}

async function handleMessageSubmit(event) {
  event.preventDefault();

  try {
    const payload = await fetchJson("/api/messages", {
      method: "POST",
      body: JSON.stringify({
        content: elements.messageInput.value.trim(),
      }),
    });

    elements.messageForm.reset();
    await loadMessages();
    showToast(payload.message || "Message posted.");
  } catch (error) {
    showToast(error.message);
  }
}

async function handleDeleteMessage(messageId) {
  try {
    const payload = await fetchJson(`/api/messages?id=${messageId}`, {
      method: "DELETE",
    });

    await loadMessages();
    showToast(payload.message || "Message deleted.");
  } catch (error) {
    showToast(error.message);
  }
}

function redirectAfterAuth() {
  const redirectTarget = document.body.dataset.authRedirect;
  if (!redirectTarget) return;

  window.setTimeout(() => {
    window.location.href = redirectTarget;
  }, 650);
}

function showToast(message) {
  if (!elements.toast) return;

  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 2800);
}

function setText(element, text) {
  if (element) {
    element.textContent = text;
  }
}

function toggleHidden(element, hidden) {
  if (element) {
    element.classList.toggle("hidden", hidden);
  }
}

function toggleHiddenForAll(elementsList, hidden) {
  elementsList.forEach((element) => {
    element.classList.toggle("hidden", hidden);
  });
}

function setDisabled(element, disabled) {
  if (element) {
    element.disabled = disabled;
  }
}

function setAvatar(element, src, alt) {
  if (element) {
    element.src = src;
    element.alt = alt;
  }
}

function isSupportedImage(file) {
  return ["image/jpeg", "image/png"].includes(file.type);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatDate(isoString) {
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoString));
}
