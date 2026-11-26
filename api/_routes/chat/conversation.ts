import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../../_lib/auth.js';
import { withSentry } from '../../_lib/sentry.js';
import { parseConversationId } from '../../_lib/chatConversation.js';

// DELETE /api/chat/conversation — delete ONE chat from "Past chats".
//
// Body: { conversationId: "<uuid>" } for chats stored with an id
// (migration 013), or { messageIds: ["<uuid>", ...] } for older chats that
// have none (the browser groups those by time, so it names their rows).
//
// Ownership: every DELETE is scoped by user_id = the session user ($1), so
// an id belonging to someone else matches no row and deletes nothing. 404
// when no row was the user's.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 500;

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
    conversationId?: unknown;
    messageIds?: unknown;
  };
  const conversationId = body.conversationId == null ? null : parseConversationId(body.conversationId);
  if (body.conversationId != null && !conversationId) {
    return res.status(400).json({ error: 'conversationId must be a UUID' });
  }

  let messageIds: string[] | null = null;
  if (!conversationId) {
    const ids = body.messageIds;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'conversationId or messageIds[] required' });
    }
    if (ids.length > MAX_IDS || !ids.every((id) => typeof id === 'string' && UUID_RE.test(id))) {
      return res.status(400).json({ error: `messageIds must be 1-${MAX_IDS} UUIDs` });
    }
    messageIds = (ids as string[]).map((id) => id.toLowerCase());
  }

  const sql = neon(process.env.DATABASE_URL!);
  const rows = conversationId
    ? await sql.query(
        'DELETE FROM chat_messages WHERE user_id = $1 AND conversation_id = $2 RETURNING id',
        [user.id, conversationId],
      )
    : await sql.query(
        'DELETE FROM chat_messages WHERE user_id = $1 AND id = ANY($2::uuid[]) RETURNING id',
        [user.id, messageIds],
      );
  if (rows.length === 0) return res.status(404).json({ error: 'Chat not found' });
  return res.status(200).json({ deleted: rows.length });
}

export default withSentry(handler);
