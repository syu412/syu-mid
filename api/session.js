const { clearSessionCookie, getSessionUser } = require("./_lib/auth");
const { methodNotAllowed, sendJson } = require("./_lib/http");

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
    sendJson(response, 500, {
      message: error.message || "無法取得登入狀態。",
    });
  }
};
