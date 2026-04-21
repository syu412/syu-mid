const crypto = require("crypto");
const https = require("https");

const MAX_JSON_BODY_BYTES = 2_500_000;
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,20}$/;
const HTML_TAG_PATTERN = /<\/?[a-z][^>]*>/i;
const PWNED_PASSWORD_CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const PWNED_PASSWORD_TIMEOUT_MS = 5000;
const pwnedPasswordRangeCache = new Map();

function stripControlCharacters(value) {
  return String(value || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

function normalizeUsername(value) {
  return stripControlCharacters(value).normalize("NFKC").trim();
}

function normalizePassword(value) {
  return stripControlCharacters(value).normalize("NFKC");
}

function normalizeMessageContent(value) {
  return stripControlCharacters(value)
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .trim();
}

function isSafeUsername(username) {
  return USERNAME_PATTERN.test(username);
}

function containsHtmlTag(value) {
  return HTML_TAG_PATTERN.test(String(value || ""));
}

function parseAvatarDataUrl(avatarDataUrl) {
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/i.exec(String(avatarDataUrl || ""));
  if (!match) {
    return null;
  }

  const mimeSubtype = match[1].toLowerCase();
  return {
    mimeType: mimeSubtype === "png" ? "image/png" : "image/jpeg",
    base64: match[2],
  };
}

function looksLikePng(buffer) {
  if (buffer.length < 8) return false;
  return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}

function looksLikeJpeg(buffer) {
  if (buffer.length < 4) return false;
  return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function validateAvatarDataUrl(avatarDataUrl) {
  const parsed = parseAvatarDataUrl(avatarDataUrl);
  if (!parsed) {
    return {
      ok: false,
      message: "Only jpg, jpeg, or png avatars are allowed.",
    };
  }

  const imageBuffer = Buffer.from(parsed.base64, "base64");
  if (!imageBuffer.length) {
    return {
      ok: false,
      message: "Avatar data is invalid.",
    };
  }

  const normalizedBase64 = imageBuffer.toString("base64").replace(/=+$/g, "");
  const providedBase64 = parsed.base64.replace(/=+$/g, "");
  if (normalizedBase64 !== providedBase64) {
    return {
      ok: false,
      message: "Avatar data is invalid.",
    };
  }

  if (imageBuffer.length > 1_500_000) {
    return {
      ok: false,
      message: "Avatar file is too large. Please use a smaller image.",
    };
  }

  const validSignature =
    (parsed.mimeType === "image/png" && looksLikePng(imageBuffer)) ||
    (parsed.mimeType === "image/jpeg" && looksLikeJpeg(imageBuffer));

  if (!validSignature) {
    return {
      ok: false,
      message: "Avatar content does not match the selected file type.",
    };
  }

  return {
    ok: true,
    normalizedDataUrl: `data:${parsed.mimeType};base64,${parsed.base64}`,
  };
}

function sha1Uppercase(value) {
  return crypto.createHash("sha1").update(value, "utf8").digest("hex").toUpperCase();
}

function requestText(url, headers) {
  if (typeof fetch === "function") {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), PWNED_PASSWORD_TIMEOUT_MS) : null;

    return fetch(url, {
      method: "GET",
      headers,
      redirect: "follow",
      signal: controller ? controller.signal : undefined,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Upstream password check failed with status ${response.status}.`);
        }
        return response.text();
      })
      .finally(() => {
        if (timer) {
          clearTimeout(timer);
        }
      });
  }

  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers,
        timeout: PWNED_PASSWORD_TIMEOUT_MS,
      },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Upstream password check failed with status ${response.statusCode}.`));
          return;
        }

        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("Password safety check timed out."));
    });
    request.on("error", reject);
  });
}

async function fetchPwnedPasswordRange(prefix) {
  const cached = pwnedPasswordRangeCache.get(prefix);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.body;
  }

  const body = await requestText(`https://api.pwnedpasswords.com/range/${prefix}`, {
    "Add-Padding": "true",
    "User-Agent": "syu-mid-password-check",
  });

  pwnedPasswordRangeCache.set(prefix, {
    body,
    expiresAt: Date.now() + PWNED_PASSWORD_CACHE_TTL_MS,
  });

  return body;
}

async function getPwnedPasswordMatchCount(password) {
  const hash = sha1Uppercase(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  let rangeBody;
  try {
    rangeBody = await fetchPwnedPasswordRange(prefix);
  } catch {
    const error = new Error("Unable to verify password safety right now. Please try again in a moment.");
    error.statusCode = 503;
    throw error;
  }

  for (const line of rangeBody.split(/\r?\n/)) {
    const [hashSuffix, count] = line.split(":");
    if (hashSuffix === suffix) {
      return Number.parseInt(count, 10) || 0;
    }
  }

  return 0;
}

module.exports = {
  MAX_JSON_BODY_BYTES,
  containsHtmlTag,
  getPwnedPasswordMatchCount,
  isSafeUsername,
  normalizeMessageContent,
  normalizePassword,
  normalizeUsername,
  validateAvatarDataUrl,
};
