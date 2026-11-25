import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../../_lib/auth.js';
import { withSentry } from '../../_lib/sentry.js';
import { sendPush, vapidConfig } from '../../_lib/push-send.js';
import type { SubscriptionRow } from '../../_lib/push-schedule.js';

// "Send a test notification" in Me -> Reminders: one notification to the
// signed-in user's OWN devices only.

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const cfg = vapidConfig();
  if (!cfg) return res.status(503).json({ error: 'Phone notifications are not available yet' });

  const sql = neon(process.env.DATABASE_URL!);
  try {
    const subs = await sql.query(
      'SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
      [user.id],
    ) as SubscriptionRow[];
    let sent = 0;
    for (const s of subs) {
      if (s.user_id !== user.id) continue;
      const r = await sendPush(cfg, s, {
        title: 'Womanie',
        body: 'Notifications are on. Your reminders will arrive like this.',
        url: '/dashboard/settings#reminders',
        tag: 'test',
      });
      if (r === 'sent') sent++;
      if (r === 'gone') await sql.query('DELETE FROM push_subscriptions WHERE id = $1 AND user_id = $2', [s.id, user.id]);
    }
    return res.status(200).json({ sent, devices: subs.length });
  } catch (error) {
    console.error('push/test error:', (error as Error)?.message);
    return res.status(503).json({ error: 'Phone notifications are not available yet' });
  }
}

export default withSentry(handler);
