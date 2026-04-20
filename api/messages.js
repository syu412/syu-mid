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
    sendJson(response, 401, { message: "請先登入後再留言。" });
    return;
  }

  const { content } = await readJsonBody(request);
  const normalizedContent = String(content || "").trim();

  if (!normalizedContent) {
    sendJson(response, 400, { message: "留言內容不能空白。" });
    return;
  }

  if (normalizedContent.length > 300) {
    sendJson(response, 400, { message: "留言請控制在 300 字以內。" });
    return;
  }

  await query("INSERT INTO messages (user_id, content) VALUES ($1, $2)", [
    session.user.id,
    normalizedContent,
  ]);

  sendJson(response, 201, { message: "留言已送出。" });
}

async function deleteMessage(request, response) {
  const session = await getSessionUser(request);
  if (!session) {
    sendJson(response, 401, { message: "請先登入。" });
    return;
  }

  const url = parseRequestUrl(request);
  let messageId = Number(url.searchParams.get("id"));

  if (!messageId && request.body) {
    const body = await readJsonBody(request);
    messageId = Number(body.id);
  }

  if (!Number.isInteger(messageId) || messageId <= 0) {
    sendJson(response, 400, { message: "找不到要刪除的留言。" });
    return;
  }

  const deletion = await query(
    "DELETE FROM messages WHERE id = $1 AND user_id = $2 RETURNING id",
    [messageId, session.user.id]
  );

  if (!deletion.rows.length) {
    sendJson(response, 404, { message: "只能刪除自己的留言，或留言已不存在。" });
    return;
  }

  sendJson(response, 200, { message: "留言已刪除。" });
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
      message: error.message || "留言功能發生錯誤，請稍後再試。",
    });
  }
};
