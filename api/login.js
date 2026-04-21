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
        message: `Already signed in as ${activeSession.user.username}.`,
        user: activeSession.user,
      });
      return;
    }

    const { username, password } = await readJsonBody(request);
    const normalizedUsername = String(username || "").trim();
    const normalizedPassword = String(password || "");

    if (!normalizedUsername || !normalizedPassword) {
      sendJson(response, 400, { message: "Please enter both username and password." });
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
      sendJson(response, 404, { message: "This account does not exist yet. Please register first." });
      return;
    }

    const userRecord = result.rows[0];
    const passwordValid = await verifyPassword(
      normalizedPassword,
      userRecord.password_salt,
      userRecord.password_hash
    );

    if (!passwordValid) {
      sendJson(response, 401, { message: "Incorrect password. Please try again." });
      return;
    }

    const token = await createSession(userRecord.id);
    setSessionCookie(response, request, token);

    sendJson(response, 200, {
      message: `Login successful. Welcome, ${userRecord.username}.`,
      user: {
        id: userRecord.id,
        username: userRecord.username,
        avatarDataUrl: userRecord.avatarDataUrl,
      },
    });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, {
      message: error.message || "Login failed. Please try again later.",
    });
  }
};
