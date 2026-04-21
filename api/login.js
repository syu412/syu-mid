const { createSession, getSessionUser, setSessionCookie, verifyPassword } = require("./_lib/auth");
const { query } = require("./_lib/db");
const { MAX_JSON_BODY_BYTES, normalizePassword, normalizeUsername } = require("./_lib/security");
const { methodNotAllowed, readJsonBody, sendError, sendJson } = require("./_lib/http");

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

    const { username, password } = await readJsonBody(request, {
      maxBytes: MAX_JSON_BODY_BYTES,
    });
    const normalizedUsername = normalizeUsername(username);
    const normalizedPassword = normalizePassword(password);

    if (!normalizedUsername || !normalizedPassword) {
      sendJson(response, 400, { message: "Please enter both username and password." });
      return;
    }

    if (normalizedUsername.length < 3 || normalizedUsername.length > 20) {
      sendJson(response, 400, { message: "Username must be between 3 and 20 characters." });
      return;
    }

    if (normalizedPassword.length < 3 || normalizedPassword.length > 20) {
      sendJson(response, 400, { message: "Password must be between 3 and 20 characters." });
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
    sendError(response, error, "Login failed. Please try again later.");
  }
};
