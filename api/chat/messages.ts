import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../_lib/auth.js';
import { withSentry } from '../_lib/sentry.js';

async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const sql = neon(process.env.DATABASE_URL!);

  if (req.method === 'GET') {
    const rows = await sql.query(
      'SELECT id, role, content, model, created_at FROM chat_messages WHERE user_id = $1 ORDER BY created_at ASC',
      [user.id]
    );
    return res.status(200).json({ messages: rows });
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
