// Ask AI conversation ids (chat_messages.conversation_id, migration 013).
// The browser makes the id; the server only accepts a well-formed UUID so
// the ::uuid column never sees junk. Anything else is stored as NULL and
// that turn falls back to the old time-gap grouping.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseConversationId(value: unknown): string | null {
  return typeof value === 'string' && UUID_RE.test(value) ? value.toLowerCase() : null;
}

/** Postgres "undefined_column": migration 013 not applied yet. */
export function isMissingColumnError(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === '42703';
}

// neon(url) without options: rows as objects, no full results.
type Sql = import('@neondatabase/serverless').NeonQueryFunction<false, false>;

/**
 * Store one Ask AI turn: the user's question (when there is one) and the
 * reply, both under the same conversation_id, always owned by userId (the
 * session user, never a body field). Before migration 013 is applied the
 * column does not exist; the same rows are then written without it.
 * Returns the stored reply's id (for answer feedback), or null.
 */
export async function persistChatTurn(
  sql: Sql,
  turn: { userId: string; conversationId: string | null; userText: string | null; assistantText: string; model: string },
): Promise<string | null> {
  const { userId, conversationId, userText, assistantText, model } = turn;
  const write = (withConversation: boolean) => {
    if (userText) {
      return withConversation
        ? sql.transaction([
            sql`INSERT INTO chat_messages (user_id, role, content, conversation_id) VALUES (${userId}, 'user', ${userText}, ${conversationId})`,
            sql`INSERT INTO chat_messages (user_id, role, content, model, conversation_id) VALUES (${userId}, 'assistant', ${assistantText}, ${model}, ${conversationId}) RETURNING id`,
          ])
        : sql.transaction([
            sql`INSERT INTO chat_messages (user_id, role, content) VALUES (${userId}, 'user', ${userText})`,
            sql`INSERT INTO chat_messages (user_id, role, content, model) VALUES (${userId}, 'assistant', ${assistantText}, ${model}) RETURNING id`,
          ]);
    }
    return withConversation
      ? sql.query(
          'INSERT INTO chat_messages (user_id, role, content, model, conversation_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
          [userId, 'assistant', assistantText, model, conversationId],
        )
      : sql.query(
          'INSERT INTO chat_messages (user_id, role, content, model) VALUES ($1, $2, $3, $4) RETURNING id',
          [userId, 'assistant', assistantText, model],
        );
  };
  let result: unknown;
  try {
    result = await write(true);
  } catch (err) {
    if (!isMissingColumnError(err)) throw err;
    result = await write(false);
  }
  return assistantRowId(result);
}

// transaction([...]) -> [userRows, assistantRows]; query() -> rows.
function assistantRowId(result: unknown): string | null {
  if (!Array.isArray(result) || result.length === 0) return null;
  const rows = Array.isArray(result[result.length - 1]) ? result[result.length - 1] : result;
  const id = (rows as Array<{ id?: unknown }>)[0]?.id;
  return typeof id === 'string' && id ? id : null;
}
