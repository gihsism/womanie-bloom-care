import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { hashInviteToken, looksLikeInviteToken } from '../../_lib/doctor-invite.js';
import { checkAndConsume } from '../../_lib/ratelimit.js';
import { withSentry } from '../../_lib/sentry.js';

// Public: is this doctor invitation link still good?
//
//   GET /api/auth/doctor-invite?token=...  -> { email, expiresAt } | 410
//
// The doctor signup page calls it to pre-fill (and lock) the invited
// email. It does NOT consume the invite; /api/auth/doctor-signup does
// that atomically. Same answer for unknown, used, revoked and expired
// links, so the endpoint can't be used to learn which of those a token
// is. Rate-limited per IP.

const CHECKS_PER_IP_PER_DAY = 60;

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ip =
    (typeof req.headers['x-forwarded-for'] === 'string'
      ? req.headers['x-forwarded-for'].split(',')[0].trim()
      : null) || req.socket?.remoteAddress || 'unknown';
  const rl = await checkAndConsume('doctor-invite-ip', ip, CHECKS_PER_IP_PER_DAY);
  if (!rl.ok) return res.status(429).json({ error: 'Too many attempts. Please try again later.' });

  const token = req.query?.token;
  const gone = { error: 'This invitation link is no longer valid. Ask Womanie for a new one.' };
  if (!looksLikeInviteToken(token)) return res.status(410).json(gone);

  try {
    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql.query(
      `SELECT email, expires_at FROM doctor_invites
        WHERE token_hash = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
        LIMIT 1`,
      [hashInviteToken(token)]
    ) as Array<{ email: string; expires_at: string | Date }>;
    if (!rows[0]) return res.status(410).json(gone);
    return res.status(200).json({
      email: rows[0].email,
      expiresAt: new Date(String(rows[0].expires_at)).toISOString(),
    });
  } catch (error) {
    console.error('auth/doctor-invite error:', error);
    return res.status(410).json(gone);
  }
}

export default withSentry(handler);
