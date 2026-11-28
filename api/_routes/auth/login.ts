import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { bodyObject, isEmailLike, isPasswordInput } from '../../_lib/input.js';
import * as jose from 'jose';
import bcrypt from 'bcryptjs';
import { getAuthSecret } from '../../_lib/auth.js';
import { withSentry } from '../../_lib/sentry.js';
import { checkAndConsume, peekLimit } from '../../_lib/ratelimit.js';

// Brute-force brakes (shared across instances, see ratelimit.ts): attempts per IP and
// failed attempts per target email per day. Generous enough that a real user never hits them.
const ATTEMPTS_PER_IP_PER_DAY = 100;
const ATTEMPTS_PER_EMAIL_PER_DAY = 30;

// A bcrypt hash (cost 10, same as signup) of a throwaway string. Compared
// against when the email has no account, so that answer takes as long as
// a wrong password for a real one.
export const DUMMY_HASH = '$2b$10$0zb0r/mL5aJbaMHKFj6J5.ycza4h2N0WArLIgOHRpc5aab/AxozlG';

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, password } = bodyObject(req.body);

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (!isEmailLike(email) || !isPasswordInput(password)) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const ip =
      (typeof req.headers['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for'].split(',')[0].trim()
        : null) || req.socket?.remoteAddress || 'unknown';
    // Per IP every attempt counts. Per email only FAILED attempts count:
    // the counter is read first and bumped after a failure, so signing in
    // successfully on several devices never uses up her own allowance.
    // Both windows end at midnight UTC, so a lock never outlasts the day.
    const emailKey = String(email).toLowerCase();
    const byIp = await checkAndConsume('login-ip', ip, ATTEMPTS_PER_IP_PER_DAY);
    const byEmail = await peekLimit('login-email', emailKey, ATTEMPTS_PER_EMAIL_PER_DAY);
    if (!byIp.ok || !byEmail.ok) {
      return res.status(429).json({
        error: 'Too many sign-in attempts. Please try again later, or use "Forgot password?".',
        retryInSec: Math.max(byIp.retryInSec, byEmail.retryInSec),
      });
    }
    const failed = async (status: number, error: string) => {
      await checkAndConsume('login-email', emailKey, ATTEMPTS_PER_EMAIL_PER_DAY);
      return res.status(status).json({ error });
    };

    const sql = neon(process.env.DATABASE_URL!);

    const users = await sql.query('SELECT * FROM auth_users WHERE email = $1', [emailKey]);
    if (users.length === 0) {
      // Same bcrypt cost as a real check, so the response time doesn't
      // tell whether an email has an account.
      await bcrypt.compare(password, DUMMY_HASH);
      return failed(401, 'Invalid email or password');
    }

    const user = users[0];

    if (!user.password_hash) {
      return failed(401, 'This account uses Google sign-in. Click "Continue with Google" instead.');
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return failed(401, 'Invalid email or password');
    }

    // Create session
    const sessionId = 'sess_' + crypto.randomUUID().replace(/-/g, '').slice(0, 20);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await sql.query(
      'INSERT INTO auth_sessions (id, user_id, expires_at) VALUES ($1, $2, $3)',
      [sessionId, user.id, expiresAt.toISOString()]
    );

    // Create JWT
    const token = await new jose.SignJWT({ sub: user.id, sid: sessionId, email: user.email, name: user.name })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('30d')
      .sign(getAuthSecret());

    res.setHeader('Set-Cookie', `womanie_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`);
    return res.status(200).json({ success: true, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
}

export default withSentry(handler);
