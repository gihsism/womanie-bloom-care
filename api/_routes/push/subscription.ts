import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../../_lib/auth.js';
import { withSentry } from '../../_lib/sentry.js';
import { vapidConfig } from '../../_lib/push-send.js';
import { isValidTimeZone, parsePrefs } from '../../_lib/push-schedule.js';

// This device's phone-notification opt-in (Me -> Reminders).
//   GET    ?endpoint=...                       -> { subscribed, prefs }
//   POST   { subscription, timezone, prefs }   -> save / update this device
//   DELETE { endpoint }                         -> switch this device off
// Every query is scoped to the session user. A device re-subscribing under
// a different account moves to that account (the browser endpoint is
// unique), so the previous account stops getting reminders on it.

function validEndpoint(v: unknown): v is string {
  if (typeof v !== 'string' || v.length > 1000) return false;
  try { return new URL(v).protocol === 'https:'; } catch { return false; }
}
const validKey = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 200 && /^[A-Za-z0-9_\-=+/]+$/.test(v);

async function handler(req: VercelRequest, res: VercelResponse) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method ?? '')) return res.status(405).json({ error: 'Method not allowed' });
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  res.setHeader('Cache-Control', 'no-store');

  const sql = neon(process.env.DATABASE_URL!);
  try {
    if (req.method === 'GET') {
      const endpoint = req.query?.endpoint;
      if (!validEndpoint(endpoint)) return res.status(200).json({ subscribed: false });
      const rows = await sql.query(
        'SELECT prefs FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2',
        [endpoint, user.id],
      ) as Array<{ prefs: unknown }>;
      if (!rows.length) return res.status(200).json({ subscribed: false });
      return res.status(200).json({ subscribed: true, prefs: parsePrefs(rows[0].prefs as never) });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;

    if (req.method === 'DELETE') {
      if (!validEndpoint(body.endpoint)) return res.status(400).json({ error: 'Missing endpoint' });
      await sql.query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [body.endpoint, user.id]);
      return res.status(200).json({ subscribed: false });
    }

    // POST
    if (!vapidConfig()) return res.status(503).json({ error: 'Phone notifications are not available yet' });
    const sub = (body.subscription ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
    const p256dh = sub.keys?.p256dh;
    const auth = sub.keys?.auth;
    if (!validEndpoint(sub.endpoint) || !validKey(p256dh) || !validKey(auth)) {
      return res.status(400).json({ error: 'Invalid subscription' });
    }
    const timezone = isValidTimeZone(body.timezone) ? body.timezone : 'UTC';
    const prefs = parsePrefs((body.prefs ?? null) as never);
    const uaHeader = req.headers?.['user-agent'];
    const ua = typeof uaHeader === 'string' ? uaHeader.slice(0, 300) : null;
    await sql.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, timezone, prefs, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       ON CONFLICT (endpoint) DO UPDATE SET
         user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
         timezone = EXCLUDED.timezone, prefs = EXCLUDED.prefs,
         user_agent = EXCLUDED.user_agent, updated_at = now()`,
      [user.id, sub.endpoint, p256dh, auth, timezone, JSON.stringify(prefs), ua],
    );
    return res.status(200).json({ subscribed: true, prefs });
  } catch (error) {
    // Most likely: migration 015 not applied yet.
    console.error('push/subscription error:', (error as Error)?.message);
    return res.status(503).json({ error: 'Phone notifications are not available yet' });
  }
}

export default withSentry(handler);
