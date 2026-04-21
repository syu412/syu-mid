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
        message: "You are already signed in. No need to register again.",
        user: activeSession.user,
      });
      return;
    }

    const { username, password, avatarDataUrl } = await readJsonBody(request);
    const normalizedUsername = String(username || "").trim();
    const normalizedPassword = String(password || "");

    if (normalizedUsername.length < 3 || normalizedUsername.length > 20) {
      sendJson(response, 400, { message: "Username must be between 3 and 20 characters." });
      return;
    }

    if (normalizedPassword.length < 6 || normalizedPassword.length > 64) {
      sendJson(response, 400, { message: "Password must be between 6 and 64 characters." });
      return;
    }

    if (!isValidAvatar(avatarDataUrl)) {
      sendJson(response, 400, { message: "Only jpg, jpeg, or png avatars are allowed." });
      return;
    }

    if (avatarDataUrl.length > 2_000_000) {
      sendJson(response, 400, { message: "Avatar file is too large. Please use a smaller image." });
      return;
    }

    const existingUser = await query(
      "SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1",
      [normalizedUsername]
    );
    if (existingUser.rows.length) {
      sendJson(response, 409, { message: "This username is already in use. Please choose another one." });
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
      message: `Registration successful. ${user.username} has been signed in automatically.`,
      user,
    });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, {
      message: error.message || "Registration failed. Please try again later.",
    });
  }
};
