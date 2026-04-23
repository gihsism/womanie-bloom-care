import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../_lib/auth.js';
import { withSentry } from '../_lib/sentry.js';

async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const sql = neon(process.env.DATABASE_URL!);

  if (req.method === 'GET') {
    // Paginate from newest backwards — defaults to the most-recent
    // 50 messages, then the client can pass `?before=<created_at>`
    // to fetch the previous page. Chat is typically short and
    // browsers seldom need ancient history; bounding the common
    // case at 50 rows keeps mount latency low for heavy users.
    const before = typeof req.query.before === 'string' ? req.query.before : null;
    const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 50, 1), 200);

    let rows: Array<Record<string, unknown>>;
    if (before) {
      rows = await sql.query(
        `SELECT id, role, content, model, created_at
           FROM chat_messages
          WHERE user_id = $1 AND created_at < $2
          ORDER BY created_at DESC
          LIMIT $3`,
        [user.id, before, limit]
      ) as Array<Record<string, unknown>>;
    } else {
      rows = await sql.query(
        `SELECT id, role, content, model, created_at
           FROM chat_messages
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT $2`,
        [user.id, limit]
      ) as Array<Record<string, unknown>>;
    }
    // Return oldest-first so the client can append to message state
    // in natural reading order.
    const ordered = [...rows].reverse();
    const hasMore = rows.length === limit;
    const earliestCursor = ordered.length > 0 ? ordered[0].created_at : null;
    return res.status(200).json({
      messages: ordered,
      hasMore,
      earliestCursor,
    });
  }

  if (req.method === 'POST') {
    // One-time localStorage → DB migration. Idempotent: only imports if
    // user currently has zero messages on the server.
    const { messages } = req.body || {};
    if (!Array.isArray(messages)) return res.status(400).json({ error: 'messages[] required' });

    const existing = await sql.query(
      'SELECT 1 FROM chat_messages WHERE user_id = $1 LIMIT 1',
      [user.id]
    );
    if (existing.length > 0) {
      return res.status(200).json({ imported: 0, reason: 'user already has messages' });
    }

    let imported = 0;
    for (const m of messages) {
      if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
      if (typeof m.content !== 'string' || !m.content) continue;
      await sql.query(
        'INSERT INTO chat_messages (user_id, role, content) VALUES ($1, $2, $3)',
        [user.id, m.role, m.content]
      );
      imported++;
    }
    return res.status(200).json({ imported });
  }

  if (req.method === 'DELETE') {
    await sql.query('DELETE FROM chat_messages WHERE user_id = $1', [user.id]);
    return res.status(200).json({ cleared: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default withSentry(handler);
