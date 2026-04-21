function sendJson(response, statusCode, payload) {
  response.status(statusCode).json(payload);
}

function methodNotAllowed(response, allowedMethods) {
  response.setHeader("Allow", allowedMethods.join(", "));
  sendJson(response, 405, {
    message: `Only ${allowedMethods.join(" / ")} requests are allowed.`,
  });
}

async function readJsonBody(request) {
  if (request.body !== undefined && request.body !== null) {
    if (typeof request.body === "string") {
      return request.body ? JSON.parse(request.body) : {};
    }
    return request.body;
  }

  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function parseRequestUrl(request) {
  return new URL(request.url, `https://${request.headers.host}`);
}

module.exports = {
  methodNotAllowed,
  parseRequestUrl,
  readJsonBody,
  sendJson,
};
