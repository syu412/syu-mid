const { createSession, getSessionUser, setSessionCookie, verifyPassword } = require("./_lib/auth");
const { query } = require("./_lib/db");
const { methodNotAllowed, readJsonBody, sendJson } = require("./_lib/http");

module.exports = async (request, response) => {
  if (request.method !== "POST") {
    methodNotAllowed(response, ["POST"]);
    return;
  }

  try {
    const activeSession = await getSessionUser(request);
    if (activeSession) {
      sendJson(response, 200, {
        message: `已登入為 ${activeSession.user.username}。`,
        user: activeSession.user,
      });
      return;
    }

    const { username, password } = await readJsonBody(request);
    const normalizedUsername = String(username || "").trim();
    const normalizedPassword = String(password || "");

    if (!normalizedUsername || !normalizedPassword) {
      sendJson(response, 400, { message: "請輸入帳號與密碼後再登入。" });
      return;
    }

    const result = await query(
      `
        SELECT
          id,
          username,
          password_hash,
          password_salt,
          avatar_data_url AS "avatarDataUrl"
        FROM users
        WHERE LOWER(username) = LOWER($1)
        LIMIT 1
      `,
      [normalizedUsername]
    );

    if (!result.rows.length) {
      sendJson(response, 404, { message: "找不到這個帳號，請先註冊。" });
      return;
    }

    const userRecord = result.rows[0];
    const passwordValid = await verifyPassword(
      normalizedPassword,
      userRecord.password_salt,
      userRecord.password_hash
    );

    if (!passwordValid) {
      sendJson(response, 401, { message: "密碼不正確，請再試一次。" });
      return;
    }

    const token = await createSession(userRecord.id);
    setSessionCookie(response, request, token);

    sendJson(response, 200, {
      message: `登入成功，歡迎 ${userRecord.username}。`,
      user: {
        id: userRecord.id,
        username: userRecord.username,
        avatarDataUrl: userRecord.avatarDataUrl,
      },
    });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, {
      message: error.message || "登入失敗，請稍後再試。",
    });
  }
};
