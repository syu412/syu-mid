const DB_NAME = "portfolio-guestbook-db";
const DB_VERSION = 1;
const USER_STORE = "users";
const MESSAGE_STORE = "messages";
const SESSION_KEY = "portfolio-session-user";

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
  db: null,
  currentUser: null,
  toastTimer: null,
};

let elements = {};

document.addEventListener("DOMContentLoaded", () => {
  elements = collectElements();
  if (elements.currentYear) {
    elements.currentYear.textContent = String(new Date().getFullYear());
  }
  bootstrap().catch((error) => {
    console.error(error);
    showToast("初始化失敗，請重新整理頁面後再試一次。");
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
  state.db = await openDatabase();
  const sessionUsername = localStorage.getItem(SESSION_KEY);
  if (sessionUsername) {
    state.currentUser = await getUser(sessionUsername);
    if (!state.currentUser) {
      localStorage.removeItem(SESSION_KEY);
    }
  }
  bindEvents();
  await refreshUI();
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

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(USER_STORE)) {
        db.createObjectStore(USER_STORE, { keyPath: "username" });
      }
      if (!db.objectStoreNames.contains(MESSAGE_STORE)) {
        const messageStore = db.createObjectStore(MESSAGE_STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
        messageStore.createIndex("createdAt", "createdAt");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transaction(storeName, mode, handler) {
  return new Promise((resolve, reject) => {
    const tx = state.db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = handler(store);

    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error("資料庫交易失敗"));
    tx.onabort = () => reject(tx.error || new Error("資料庫交易已中止"));
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getUser(username) {
  if (!username) return null;
  return transaction(USER_STORE, "readonly", (store) => requestToPromise(store.get(username)));
}

async function getAllMessages() {
  const messages = await transaction(MESSAGE_STORE, "readonly", (store) =>
    requestToPromise(store.getAll())
  );
  return messages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function refreshUI() {
  updateSessionPanel();
  await renderMessages();
}

function updateSessionPanel() {
  const isLoggedIn = Boolean(state.currentUser);

  if (isLoggedIn) {
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
  } else {
    setText(elements.currentUserName, "訪客模式");
    setAvatar(elements.currentUserAvatar, defaultAvatar, "預設訪客頭貼");
    setText(elements.statusText, "尚未登入，請先註冊或登入後才可留言。");
    toggleHidden(elements.logoutButton, true);
    toggleHidden(elements.guestHint, false);
    toggleHidden(elements.composerGuard, false);
    setDisabled(elements.messageInput, true);
  }
}

async function renderMessages() {
  if (!elements.messageList) return;

  const messages = await getAllMessages();
  elements.messageList.innerHTML = "";

  if (!messages.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "目前還沒有留言。完成註冊並登入後，來留下第一則訊息吧。";
    elements.messageList.appendChild(empty);
    return;
  }

  const fragments = document.createDocumentFragment();

  for (const message of messages) {
    const user = await getUser(message.author);
    const avatar = user?.avatarDataUrl || defaultAvatar;

    const card = document.createElement("article");
    card.className = "message-card";

    const avatarImage = document.createElement("img");
    avatarImage.src = avatar;
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

    if (state.currentUser?.username === message.author) {
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
    fragments.appendChild(card);
  }

  elements.messageList.appendChild(fragments);
}

async function handleRegister(event) {
  event.preventDefault();
  const username = elements.registerUsername.value.trim();
  const password = elements.registerPassword.value;
  const file = elements.registerAvatarInput.files?.[0];

  if (!username || username.length < 3) {
    showToast("註冊帳號至少需要 3 個字元。");
    return;
  }

  if (!password || password.length < 6) {
    showToast("密碼至少需要 6 個字元。");
    return;
  }

  if (!file) {
    showToast("請上傳一張 jpg 或 png 頭貼。");
    return;
  }

  if (!isSupportedImage(file)) {
    showToast("頭貼格式只接受 jpg、jpeg 或 png。");
    return;
  }

  const existingUser = await getUser(username);
  if (existingUser) {
    showToast("這個帳號名稱已被使用，請換一個試試看。");
    return;
  }

  try {
    const avatarDataUrl = await fileToDataUrl(file);
    const passwordHash = await hashText(password);
    const user = {
      username,
      passwordHash,
      avatarDataUrl,
      createdAt: new Date().toISOString(),
    };

    await transaction(USER_STORE, "readwrite", (store) => {
      store.add(user);
    });

    state.currentUser = user;
    localStorage.setItem(SESSION_KEY, user.username);
    elements.registerForm.reset();
    if (elements.loginForm) {
      elements.loginForm.reset();
    }
    await refreshUI();
    showToast(`註冊成功，${user.username} 已自動登入。`);
    redirectAfterAuth();
  } catch (error) {
    console.error(error);
    showToast("註冊失敗，請稍後再試。");
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const username = elements.loginUsername.value.trim();
  const password = elements.loginPassword.value;

  if (!username || !password) {
    showToast("請輸入帳號與密碼後再登入。");
    return;
  }

  const user = await getUser(username);
  if (!user) {
    showToast("找不到這個帳號，請先註冊。");
    return;
  }

  const passwordHash = await hashText(password);
  if (passwordHash !== user.passwordHash) {
    showToast("密碼不正確，請再試一次。");
    return;
  }

  state.currentUser = user;
  localStorage.setItem(SESSION_KEY, user.username);
  elements.loginForm.reset();
  await refreshUI();
  showToast(`登入成功，歡迎 ${user.username}。`);
  redirectAfterAuth();
}

async function handleMessageSubmit(event) {
  event.preventDefault();

  if (!state.currentUser) {
    showToast("請先登入後再留言。");
    return;
  }

  const content = elements.messageInput.value.trim();
  if (!content) {
    showToast("留言內容不能空白。");
    return;
  }

  if (content.length > 300) {
    showToast("留言請控制在 300 字以內。");
    return;
  }

  await transaction(MESSAGE_STORE, "readwrite", (store) => {
    store.add({
      author: state.currentUser.username,
      content,
      createdAt: new Date().toISOString(),
    });
  });

  elements.messageForm.reset();
  await renderMessages();
  showToast("留言已送出。");
}

async function handleDeleteMessage(messageId) {
  if (!state.currentUser) {
    showToast("請先登入。");
    return;
  }

  const messages = await getAllMessages();
  const target = messages.find((message) => message.id === messageId);

  if (!target) {
    showToast("找不到要刪除的留言。");
    return;
  }

  if (target.author !== state.currentUser.username) {
    showToast("只能刪除自己的留言。");
    return;
  }

  await transaction(MESSAGE_STORE, "readwrite", (store) => {
    store.delete(messageId);
  });

  await renderMessages();
  showToast("留言已刪除。");
}

function handleLogout() {
  state.currentUser = null;
  localStorage.removeItem(SESSION_KEY);
  updateSessionPanel();
  renderMessages().catch((error) => {
    console.error(error);
    showToast("登出後重新整理留言失敗。");
  });
  showToast("已安全登出。");
}

function showToast(message) {
  if (!elements.toast) {
    return;
  }

  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 2600);
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

function redirectAfterAuth() {
  const redirectTarget = document.body.dataset.authRedirect;
  if (!redirectTarget) return;

  window.setTimeout(() => {
    window.location.href = redirectTarget;
  }, 650);
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

async function hashText(text) {
  const encoded = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(hashBuffer)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function formatDate(isoString) {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
