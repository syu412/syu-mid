function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function setSecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("Cache-Control", "no-store");
}

function sendJson(response, statusCode, payload) {
  setSecurityHeaders(response);
  response.status(statusCode).json(payload);
}

function methodNotAllowed(response, allowedMethods) {
  response.setHeader("Allow", allowedMethods.join(", "));
  sendJson(response, 405, {
    message: `Only ${allowedMethods.join(" / ")} requests are allowed.`,
  });
}

async function readJsonBody(request, options = {}) {
  const maxBytes = options.maxBytes ?? 2_500_000;

  if (request.body !== undefined && request.body !== null) {
    if (typeof request.body === "string") {
      if (Buffer.byteLength(request.body, "utf8") > maxBytes) {
        throw createHttpError(413, "The request body is too large.");
      }

      try {
        return request.body ? JSON.parse(request.body) : {};
      } catch {
        throw createHttpError(400, "Invalid JSON body.");
      }
    }
    return request.body;
  }

  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > maxBytes) {
      throw createHttpError(413, "The request body is too large.");
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw createHttpError(400, "Invalid JSON body.");
  }
}

function parseRequestUrl(request) {
  return new URL(request.url, `https://${request.headers.host}`);
}

function sendError(response, error, fallbackMessage) {
  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  sendJson(response, statusCode, {
    message: statusCode >= 500 ? fallbackMessage : error.message || fallbackMessage,
  });
}

module.exports = {
  createHttpError,
  methodNotAllowed,
  parseRequestUrl,
  readJsonBody,
  sendError,
  sendJson,
};
