const { createPasswordSalt, createSession, getSessionUser, hashPassword, setSessionCookie } = require("./_lib/auth");
const { query } = require("./_lib/db");
const {
  MAX_JSON_BODY_BYTES,
  getPwnedPasswordMatchCount,
  isSafeUsername,
  normalizePassword,
  normalizeUsername,
  validateAvatarDataUrl,
} = require("./_lib/security");
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
        message: "You are already signed in. No need to register again.",
        user: activeSession.user,
      });
      return;
    }

    const { username, password, avatarDataUrl } = await readJsonBody(request, {
      maxBytes: MAX_JSON_BODY_BYTES,
    });
    const normalizedUsername = normalizeUsername(username);
    const normalizedPassword = normalizePassword(password);

    if (normalizedUsername.length < 3 || normalizedUsername.length > 20) {
      sendJson(response, 400, { message: "Username must be between 3 and 20 characters." });
      return;
    }

    if (!isSafeUsername(normalizedUsername)) {
      sendJson(response, 400, {
        message: "Username may only contain letters, numbers, dots, underscores, and hyphens.",
      });
      return;
    }

    if (normalizedPassword.length < 3 || normalizedPassword.length > 20) {
      sendJson(response, 400, { message: "Password must be between 3 and 20 characters." });
      return;
    }

    const pwnedPasswordMatchCount = await getPwnedPasswordMatchCount(normalizedPassword);
    if (pwnedPasswordMatchCount > 0) {
      sendJson(response, 400, {
        message: "This password has appeared in known data breaches. Please choose a new password that you have never used before.",
      });
      return;
    }

    const avatarValidation = validateAvatarDataUrl(avatarDataUrl);
    if (!avatarValidation.ok) {
      sendJson(response, 400, { message: avatarValidation.message });
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
      [normalizedUsername, passwordHash, passwordSalt, avatarValidation.normalizedDataUrl]
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
    sendError(response, error, "Registration failed. Please try again later.");
  }
};
