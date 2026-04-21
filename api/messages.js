const { getSessionUser } = require("./_lib/auth");
const { query } = require("./_lib/db");
const { methodNotAllowed, parseRequestUrl, readJsonBody, sendJson } = require("./_lib/http");

async function listMessages(request, response) {
  const session = await getSessionUser(request);
  const result = await query(
    `
      SELECT
        messages.id,
        messages.content,
        messages.created_at AS "createdAt",
        users.id AS "authorId",
        users.username AS author,
        users.avatar_data_url AS "avatarDataUrl"
      FROM messages
      INNER JOIN users ON users.id = messages.user_id
      ORDER BY messages.created_at DESC, messages.id DESC
    `
  );

  const messages = result.rows.map((row) => ({
    id: row.id,
    content: row.content,
    createdAt: row.createdAt,
    author: row.author,
    avatarDataUrl: row.avatarDataUrl,
    canDelete: session ? session.user.id === row.authorId : false,
  }));

  sendJson(response, 200, { messages });
}

async function createMessage(request, response) {
  const session = await getSessionUser(request);
  if (!session) {
    sendJson(response, 401, { message: "Please log in before posting a message." });
    return;
  }

  const { content } = await readJsonBody(request);
  const normalizedContent = String(content || "").trim();

  if (!normalizedContent) {
    sendJson(response, 400, { message: "Message content cannot be empty." });
    return;
  }

  if (normalizedContent.length > 300) {
    sendJson(response, 400, { message: "Please keep your message within 300 characters." });
    return;
  }

  await query("INSERT INTO messages (user_id, content) VALUES ($1, $2)", [
    session.user.id,
    normalizedContent,
  ]);

  sendJson(response, 201, { message: "Message posted." });
}

async function deleteMessage(request, response) {
  const session = await getSessionUser(request);
  if (!session) {
    sendJson(response, 401, { message: "Please log in first." });
    return;
  }

  const url = parseRequestUrl(request);
  let messageId = Number(url.searchParams.get("id"));

  if (!messageId && request.body) {
    const body = await readJsonBody(request);
    messageId = Number(body.id);
  }

  if (!Number.isInteger(messageId) || messageId <= 0) {
    sendJson(response, 400, { message: "The message you want to delete could not be found." });
    return;
  }

  const deletion = await query(
    "DELETE FROM messages WHERE id = $1 AND user_id = $2 RETURNING id",
    [messageId, session.user.id]
  );

  if (!deletion.rows.length) {
    sendJson(response, 404, { message: "You can only delete your own message, or the message no longer exists." });
    return;
  }

  sendJson(response, 200, { message: "Message deleted." });
}

module.exports = async (request, response) => {
  try {
    if (request.method === "GET") {
      await listMessages(request, response);
      return;
    }

    if (request.method === "POST") {
      await createMessage(request, response);
      return;
    }

    if (request.method === "DELETE") {
      await deleteMessage(request, response);
      return;
    }

    methodNotAllowed(response, ["GET", "POST", "DELETE"]);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, {
      message: error.message || "The guestbook encountered an error. Please try again later.",
    });
  }
};
