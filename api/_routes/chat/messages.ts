import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../../_lib/auth.js';
import { withSentry } from '../../_lib/sentry.js';

// Upper bound on a localStorage history import (see POST).
const MAX_IMPORT = 500;

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

    // One multi-row INSERT: all-or-nothing, so a timeout can't leave a
    // partial history that then blocks the rest (the zero-messages guard
    // above) while the client keeps its local copy. Capped to the most
    // recent MAX_IMPORT messages; created_at is staggered by ordinality so
    // the oldest-first order survives the shared now().
    const valid = messages
      .filter((m: unknown): m is { role: string; content: string } => {
        const r = m as { role?: unknown; content?: unknown } | null;
        return !!r && (r.role === 'user' || r.role === 'assistant') &&
          typeof r.content === 'string' && r.content.length > 0;
      })
      .slice(-MAX_IMPORT);
    if (valid.length === 0) return res.status(200).json({ imported: 0 });

    const rows = await sql.query(
      `INSERT INTO chat_messages (user_id, role, content, created_at)
       SELECT $1, m.role, m.content,
              now() - (($4::int - m.ord) * interval '1 millisecond')
         FROM unnest($2::text[], $3::text[]) WITH ORDINALITY AS m(role, content, ord)
       RETURNING id`,
      [user.id, valid.map(m => m.role), valid.map(m => m.content), valid.length]
    );
    const imported = rows.length;
    return res.status(200).json({ imported });
  }

  if (req.method === 'DELETE') {
    await sql.query('DELETE FROM chat_messages WHERE user_id = $1', [user.id]);
    return res.status(200).json({ cleared: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default withSentry(handler);
