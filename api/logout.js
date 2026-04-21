const { clearSessionCookie, destroySessionByToken, getSessionUser } = require("./_lib/auth");
const { methodNotAllowed, sendJson } = require("./_lib/http");

module.exports = async (request, response) => {
  if (request.method !== "POST") {
    methodNotAllowed(response, ["POST"]);
    return;
  }

  try {
    const session = await getSessionUser(request);
    if (session) {
      await destroySessionByToken(session.token);
    }

    clearSessionCookie(response, request);
    sendJson(response, 200, { message: "Logged out successfully." });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, {
      message: error.message || "Logout failed. Please try again later.",
    });
  }
};
