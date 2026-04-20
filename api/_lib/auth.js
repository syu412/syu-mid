const crypto = require("crypto");
const { query } = require("./db");

const SESSION_COOKIE = "portfolio_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function parseCookies(cookieHeader = "") {
  return cookieHeader
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((accumulator, item) => {
      const separatorIndex = item.indexOf("=");
      if (separatorIndex === -1) return accumulator;
      const key = item.slice(0, separatorIndex);
      const value = item.slice(separatorIndex + 1);
      accumulator[key] = decodeURIComponent(value);
      return accumulator;
    }, {});
}

function createPasswordSalt() {
  return crypto.randomBytes(16).toString("hex");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hashPassword(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey.toString("hex"));
    });
  });
}

async function verifyPassword(password, salt, expectedHash) {
  const computedHash = await hashPassword(password, salt);
  const expectedBuffer = Buffer.from(expectedHash, "hex");
  const computedBuffer = Buffer.from(computedHash, "hex");

  if (expectedBuffer.length !== computedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, computedBuffer);
}

function isSecureRequest(request) {
  return process.env.NODE_ENV === "production" || request.headers["x-forwarded-proto"] === "https";
}

function appendSetCookie(response, cookieValue) {
  const existingHeader = response.getHeader("Set-Cookie");
  if (!existingHeader) {
    response.setHeader("Set-Cookie", cookieValue);
    return;
  }

  if (Array.isArray(existingHeader)) {
    response.setHeader("Set-Cookie", [...existingHeader, cookieValue]);
    return;
  }

  response.setHeader("Set-Cookie", [existingHeader, cookieValue]);
}

function serializeCookie(name, value, options = {}) {
  const segments = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    segments.push(`Max-Age=${options.maxAge}`);
  }
  if (options.expires) {
    segments.push(`Expires=${options.expires.toUTCString()}`);
  }
  if (options.path) {
    segments.push(`Path=${options.path}`);
  }
  if (options.httpOnly) {
    segments.push("HttpOnly");
  }
  if (options.sameSite) {
    segments.push(`SameSite=${options.sameSite}`);
  }
  if (options.secure) {
    segments.push("Secure");
  }

  return segments.join("; ");
}

function setSessionCookie(response, request, token) {
  appendSetCookie(
    response,
    serializeCookie(SESSION_COOKIE, token, {
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      maxAge: SESSION_MAX_AGE_SECONDS,
      secure: isSecureRequest(request),
    })
  );
}

function clearSessionCookie(response, request) {
  appendSetCookie(
    response,
    serializeCookie(SESSION_COOKIE, "", {
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      maxAge: 0,
      expires: new Date(0),
      secure: isSecureRequest(request),
    })
  );
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = sha256(token);

  await query(
    `
      INSERT INTO sessions (user_id, token_hash, expires_at)
      VALUES ($1, $2, NOW() + INTERVAL '7 days')
    `,
    [userId, tokenHash]
  );

  return token;
}

async function destroySessionByToken(token) {
  if (!token) return;

  await query("DELETE FROM sessions WHERE token_hash = $1", [sha256(token)]);
}

async function getSessionUser(request) {
  const cookies = parseCookies(request.headers.cookie);
  const token = cookies[SESSION_COOKIE];

  if (!token) {
    return null;
  }

  await query("DELETE FROM sessions WHERE expires_at <= NOW()");

  const result = await query(
    `
      SELECT
        sessions.id AS session_id,
        users.id AS user_id,
        users.username,
        users.avatar_data_url AS avatar_data_url
      FROM sessions
      INNER JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = $1
        AND sessions.expires_at > NOW()
      LIMIT 1
    `,
    [sha256(token)]
  );

  if (!result.rows.length) {
    return null;
  }

  const row = result.rows[0];
  return {
    sessionId: row.session_id,
    user: {
      id: row.user_id,
      username: row.username,
      avatarDataUrl: row.avatar_data_url,
    },
    token,
  };
}

module.exports = {
  clearSessionCookie,
  createPasswordSalt,
  createSession,
  destroySessionByToken,
  getSessionUser,
  hashPassword,
  setSessionCookie,
  verifyPassword,
};
