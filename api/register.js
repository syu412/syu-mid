const { createPasswordSalt, createSession, getSessionUser, hashPassword, setSessionCookie } = require("./_lib/auth");
const { query } = require("./_lib/db");
const { methodNotAllowed, readJsonBody, sendJson } = require("./_lib/http");

function isValidAvatar(avatarDataUrl) {
  return /^data:image\/(png|jpeg);base64,/i.test(avatarDataUrl || "");
}

module.exports = async (request, response) => {
  if (request.method !== "POST") {
    methodNotAllowed(response, ["POST"]);
    return;
  }

  try {
    const activeSession = await getSessionUser(request);
    if (activeSession) {
      sendJson(response, 200, {
        message: "目前已經登入，不需要重新註冊。",
        user: activeSession.user,
      });
      return;
    }

    const { username, password, avatarDataUrl } = await readJsonBody(request);
    const normalizedUsername = String(username || "").trim();
    const normalizedPassword = String(password || "");

    if (normalizedUsername.length < 3 || normalizedUsername.length > 20) {
      sendJson(response, 400, { message: "帳號名稱需介於 3 到 20 個字元。" });
      return;
    }

    if (normalizedPassword.length < 6 || normalizedPassword.length > 64) {
      sendJson(response, 400, { message: "密碼需介於 6 到 64 個字元。" });
      return;
    }

    if (!isValidAvatar(avatarDataUrl)) {
      sendJson(response, 400, { message: "頭貼格式只接受 jpg、jpeg 或 png。" });
      return;
    }

    if (avatarDataUrl.length > 2_000_000) {
      sendJson(response, 400, { message: "頭貼檔案過大，請改用較小的圖片。" });
      return;
    }

    const existingUser = await query(
      "SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1",
      [normalizedUsername]
    );
    if (existingUser.rows.length) {
      sendJson(response, 409, { message: "這個帳號名稱已被使用，請換一個試試看。" });
      return;
    }

    const passwordSalt = createPasswordSalt();
    const passwordHash = await hashPassword(normalizedPassword, passwordSalt);
    const createdUser = await query(
      `
        INSERT INTO users (username, password_hash, password_salt, avatar_data_url)
        VALUES ($1, $2, $3, $4)
        RETURNING id, username, avatar_data_url AS "avatarDataUrl"
      `,
      [normalizedUsername, passwordHash, passwordSalt, avatarDataUrl]
    );

    const user = createdUser.rows[0];
    const token = await createSession(user.id);
    setSessionCookie(response, request, token);

    sendJson(response, 201, {
      message: `註冊成功，${user.username} 已自動登入。`,
      user,
    });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, {
      message: error.message || "註冊失敗，請稍後再試。",
    });
  }
};
