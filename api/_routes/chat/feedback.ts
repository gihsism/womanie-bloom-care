import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../../_lib/auth.js';
import { checkAndConsume } from '../../_lib/ratelimit.js';
import { withSentry } from '../../_lib/sentry.js';
import { isMissingTableError, parseChatFeedback } from '../../_lib/chat-feedback.js';

// POST /api/chat/feedback — 👍/👎 on one Ask AI answer (migration 026).
//
// Body: { answerKey, rating: 1 | -1, reason?, comment?, messageId?,
//         conversationId?, model? } (validated in api/_lib/chat-feedback.ts)
// Rating the same answer again replaces the earlier rating. The row is
// always owned by the session user, never a body field.
//
// Before migration 026 is applied: 200 { stored: false } so the page keeps
// the rating in the browser and sends it again later.

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const parsed = parseChatFeedback(req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  const f = parsed.feedback;

  const rate = await checkAndConsume('chat-feedback', user.id, 300);
  if (!rate.ok) return res.status(429).json({ error: 'Too many ratings today. Try again tomorrow.' });

  const sql = neon(process.env.DATABASE_URL!);
  try {
    await sql.query(
      `INSERT INTO chat_feedback (user_id, answer_key, message_id, conversation_id, model, rating, reason, comment)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, answer_key) DO UPDATE
         SET rating = EXCLUDED.rating, reason = EXCLUDED.reason, comment = EXCLUDED.comment,
             message_id = COALESCE(EXCLUDED.message_id, chat_feedback.message_id), updated_at = now()`,
      [user.id, f.answerKey, f.messageId, f.conversationId, f.model, f.rating, f.reason, f.comment],
    );
    return res.status(200).json({ stored: true });
  } catch (err) {
    if (isMissingTableError(err)) return res.status(200).json({ stored: false, reason: 'not_available' });
    console.error('chat/feedback insert failed:', (err as Error)?.message);
    return res.status(500).json({ error: 'Could not save your rating' });
  }
}

export default withSentry(handler);
