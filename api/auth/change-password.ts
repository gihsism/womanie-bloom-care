import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import { getAuthUser } from '../_lib/auth.js';
import { withSentry } from '../_lib/sentry.js';
import { checkAndConsume } from '../_lib/ratelimit.js';

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await getAuthUser(req);
  if (!auth) return res.status(401).json({ error: 'Not signed in' });

  // Cap retries so a stolen session can't grind through password guesses.
  const limit = checkAndConsume('change-password', auth.id, 10);
  if (!limit.ok) {
    return res.status(429).json({
      error: `Too many attempts. Try again in ${Math.ceil(limit.retryInSec / 60)} minutes.`,
    });
  }

  try {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    if (newPassword === currentPassword) {
      return res.status(400).json({ error: 'New password must differ from current password' });
    }

    const sql = neon(process.env.DATABASE_URL!);
    const users = await sql.query('SELECT id, password_hash FROM auth_users WHERE id = $1', [auth.id]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }
    const user = users[0];
    if (!user.password_hash) {
      // Google-only accounts have no password to change.
      return res.status(400).json({
        error: 'This account uses Google sign-in. Password changes are managed in your Google account.',
      });
    }

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await sql.query(
      'UPDATE auth_users SET password_hash = $1 WHERE id = $2',
      [newHash, auth.id]
    );

    // Revoke every OTHER session for this user — keeps the caller signed in,
    // boots out anything that may have been signed in with the old password
    // (lost device, abandoned phone, etc.).
    if (auth.sessionId) {
      await sql.query(
        'DELETE FROM auth_sessions WHERE user_id = $1 AND id != $2',
        [auth.id, auth.sessionId]
      );
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('change-password error:', error);
    return res.status(500).json({ error: 'Failed to change password' });
  }
}

export default withSentry(handler);
