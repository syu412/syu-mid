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
    showToast("初始化失敗，請確認伺服器與資料庫設定是否完成。");
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

  if (elements.logoutButton) {
    elements.logoutButton.addEventListener("click", handleLogout);
  }

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
    throw new Error(payload.message || "請求失敗，請稍後再試。");
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
      `${state.currentUser.username} 的頭貼`
    );
    setText(elements.statusText, `已登入，歡迎回來 ${state.currentUser.username}。`);
    toggleHidden(elements.logoutButton, false);
    toggleHidden(elements.guestHint, true);
    toggleHidden(elements.composerGuard, true);
    setDisabled(elements.messageInput, false);
    return;
  }

  setText(elements.currentUserName, "訪客模式");
  setAvatar(elements.currentUserAvatar, defaultAvatar, "預設訪客頭貼");
  setText(elements.statusText, "尚未登入，請先註冊或登入後才可留言。");
  toggleHidden(elements.logoutButton, true);
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
    empty.textContent = "目前還沒有留言。完成註冊並登入後，來留下第一則訊息吧。";
    elements.messageList.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const message of state.messages) {
    const card = document.createElement("article");
    card.className = "message-card";

    const avatarImage = document.createElement("img");
    avatarImage.src = message.avatarDataUrl || defaultAvatar;
    avatarImage.alt = `${message.author} 的頭貼`;
    card.appendChild(avatarImage);

    const content = document.createElement("div");
    const top = document.createElement("div");
    top.className = "message-top";

    const meta = document.createElement("div");
    meta.innerHTML = `
      <strong>${escapeHtml(message.author)}</strong>
      <span class="message-time">${formatDate(message.createdAt)}</span>
    `;
    top.appendChild(meta);

    if (message.canDelete) {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "delete-button";
      deleteButton.textContent = "刪除我的留言";
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
    showToast("請上傳一張 jpg 或 png 頭貼。");
    return;
  }

  if (!isSupportedImage(file)) {
    showToast("頭貼格式只接受 jpg、jpeg 或 png。");
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
    showToast(payload.message || "註冊成功。");
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
    showToast(payload.message || "登入成功。");
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
    showToast(payload.message || "已安全登出。");
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
    showToast(payload.message || "留言已送出。");
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
    showToast(payload.message || "留言已刪除。");
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
