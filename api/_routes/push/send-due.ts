import { neon } from '@neondatabase/serverless';
import { timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withSentry } from '../../_lib/sentry.js';
import { sendPush, vapidConfig } from '../../_lib/push-send.js';
import { runSendDue } from '../../_lib/push-run.js';

// Sends the reminders that are due now. Called by a scheduler, never by
// the app:
//   - an external free cron (cron-job.org / GitHub Actions) every 15 min:
//       GET or POST https://womanie.info/api/push/send-due
//       Authorization: Bearer <CRON_SECRET>      (or  x-cron-secret: <CRON_SECRET>)
//   - optionally a Vercel cron as a once-a-day backstop (Hobby crons run at
//     most daily); Vercel sends "Authorization: Bearer $CRON_SECRET" itself.
// Running more often is safe: each reminder is claimed once in
// push_sent_log, so overlapping or repeated runs never send it twice.
// Refuses to run (503) without CRON_SECRET or the VAPID keys.

function secretOk(req: VercelRequest, secret: string): boolean {
  const auth = req.headers?.authorization;
  const header = req.headers?.['x-cron-secret'];
  const given = typeof auth === 'string' && auth.startsWith('Bearer ')
    ? auth.slice(7)
    : typeof header === 'string' ? header : '';
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 16) return res.status(503).json({ error: 'Scheduler not configured' });
  if (!secretOk(req, secret)) return res.status(401).json({ error: 'Unauthorized' });
  const cfg = vapidConfig();
  if (!cfg) return res.status(503).json({ error: 'Phone notifications are not configured', disabled: true });

  const sql = neon(process.env.DATABASE_URL!);
  try {
    const summary = await runSendDue(
      (text, params) => sql.query(text, params ?? []) as Promise<unknown[]>,
      (sub, payload) => sendPush(cfg, sub, payload),
      new Date(),
    );
    return res.status(200).json(summary);
  } catch (error) {
    console.error('push/send-due error:', (error as Error)?.message);
    return res.status(500).json({ error: 'Send failed' });
  }
}

export default withSentry(handler);
