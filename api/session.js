const { clearSessionCookie, getSessionUser } = require("./_lib/auth");
const { methodNotAllowed, sendError, sendJson } = require("./_lib/http");

module.exports = async (request, response) => {
  if (request.method !== "GET") {
    methodNotAllowed(response, ["GET"]);
    return;
  }

  try {
    const session = await getSessionUser(request);

    if (!session) {
      clearSessionCookie(response, request);
      sendJson(response, 200, {
        authenticated: false,
        user: null,
      });
      return;
    }

    sendJson(response, 200, {
      authenticated: true,
      user: session.user,
    });
  } catch (error) {
    console.error(error);
    sendError(response, error, "Unable to retrieve the current session.");
  }
};
