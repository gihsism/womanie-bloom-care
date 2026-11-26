import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as jose from 'jose';
import bcrypt from 'bcryptjs';
import { getAuthSecret } from '../../_lib/auth.js';
import { withSentry } from '../../_lib/sentry.js';
import { checkAndConsume } from '../../_lib/ratelimit.js';
import { POLICY_VERSIONS } from '../../_lib/policy-versions.js';

// Cap signups per source IP so scripts can't mass-create accounts or
// probe which emails are registered via the 409 conflict response.
const SIGNUPS_PER_IP_PER_DAY = 10;

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip =
    (typeof req.headers['x-forwarded-for'] === 'string'
      ? req.headers['x-forwarded-for'].split(',')[0].trim()
      : null) || req.socket?.remoteAddress || 'unknown';
  const rl = await checkAndConsume('signup-ip', ip, SIGNUPS_PER_IP_PER_DAY);
  if (!rl.ok) {
    return res.status(429).json({
      error: 'Too many signup attempts. Please try again later.',
      retryInSec: rl.retryInSec,
    });
  }

  try {
    const { email, password, name, acceptPrivacyPolicy, privacyPolicyVersion } = req.body ?? {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Consent is required, not optional: no account without the privacy
    // tick, and the tick must be for the version in force. An out-of-date
    // app (cached PWA) sends an older version and gets 409 policy_outdated,
    // so nobody is recorded as accepting wording she was not shown.
    const privacy = POLICY_VERSIONS.privacy_policy;
    if (privacy) {
      if (acceptPrivacyPolicy !== true) {
        return res.status(400).json({ error: 'Please accept the privacy policy to create an account', code: 'consent_required' });
      }
      if (privacyPolicyVersion !== privacy.version) {
        return res.status(409).json({
          error: 'The privacy policy was updated. Please reload the page and review it before signing up.',
          code: 'policy_outdated',
          currentVersion: privacy.version,
        });
      }
    }

    const sql = neon(process.env.DATABASE_URL!);

    // Check if email exists
    const existing = await sql.query('SELECT id FROM auth_users WHERE email = $1', [email.toLowerCase()]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists. Try logging in.' });
    }

    // Hash password and create user
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = 'user_' + crypto.randomUUID().replace(/-/g, '').slice(0, 20);

    const sessionId = 'sess_' + crypto.randomUUID().replace(/-/g, '').slice(0, 20);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // User, profile, session and consent in one transaction: if any insert
    // fails the email isn't left registered without a profile (which would
    // also block a retry with the 409 above), and no account ever exists
    // without the record of her accepting the privacy policy (024 applied).
    const statements = [
      sql.query(
        'INSERT INTO auth_users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)',
        [userId, email.toLowerCase(), name || null, passwordHash]
      ),
      sql.query(
        'INSERT INTO profiles (id, full_name, life_stage) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
        [userId, name || null, 'menstrual-cycle']
      ),
      sql.query(
        'INSERT INTO auth_sessions (id, user_id, expires_at) VALUES ($1, $2, $3)',
        [sessionId, userId, expiresAt.toISOString()]
      ),
    ];
    if (privacy) {
      statements.push(sql.query(
        "INSERT INTO consent_log (user_id, document, version, source) VALUES ($1, 'privacy_policy', $2, 'signup')",
        [userId, privacy.version]
      ));
    }
    await sql.transaction(statements);

    // Create JWT
    const token = await new jose.SignJWT({ sub: userId, sid: sessionId, email: email.toLowerCase(), name })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('30d')
      .sign(getAuthSecret());

    res.setHeader('Set-Cookie', `womanie_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`);
    return res.status(200).json({ success: true, user: { id: userId, email, name } });
  } catch (error) {
    // Concurrent signups with the same email can both pass the pre-check
    // before the first transaction commits; the second hits the unique
    // constraint (23505) and should get the same friendly 409 as the
    // pre-check, not a generic 500.
    if ((error as { code?: string }).code === '23505') {
      return res.status(409).json({ error: 'An account with this email already exists. Try logging in.' });
    }
    console.error('Signup error:', error);
    return res.status(500).json({ error: 'Failed to create account' });
  }
}

export default withSentry(handler);
