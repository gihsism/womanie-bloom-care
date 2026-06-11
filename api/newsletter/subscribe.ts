import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkAndConsume } from '../_lib/ratelimit.js';
import { withSentry } from '../_lib/sentry.js';

// Public single-opt-in newsletter capture for the footer form.
//
// Deliberately quiet about duplicates: re-subscribing an existing email
// returns the same 200 as a fresh signup, so the endpoint can't be used
// to probe which emails are on the list. Per-IP rate limit (in-memory,
// same soft-ceiling caveats as api/_lib/ratelimit.ts) keeps a script
// from bulk-inserting junk rows.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LEN = 254;
const SIGNUPS_PER_IP_PER_DAY = 20;

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip =
    (typeof req.headers['x-forwarded-for'] === 'string'
      ? req.headers['x-forwarded-for'].split(',')[0].trim()
      : null) || req.socket.remoteAddress || 'unknown';

  const rl = checkAndConsume('newsletter-subscribe', ip, SIGNUPS_PER_IP_PER_DAY);
  if (!rl.ok) {
    return res.status(429).json({ error: 'Too many requests', retryInSec: rl.retryInSec });
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email || email.length > MAX_EMAIL_LEN || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  const sql = neon(process.env.DATABASE_URL!);
  await sql.query(
    `INSERT INTO newsletter_subscribers (email, source)
     VALUES ($1, 'footer')
     ON CONFLICT (email) DO NOTHING`,
    [email],
  );

  return res.status(200).json({ ok: true });
}

export default withSentry(handler);
