import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { bodyObject, isEmailLike, MAX_PASSWORD, optionalText } from '../../_lib/input.js';
import bcrypt from 'bcryptjs';
import { withSentry } from '../../_lib/sentry.js';
import { notifyAdmin } from '../../_lib/notify.js';
import { checkAndConsume } from '../../_lib/ratelimit.js';
import * as jose from 'jose';
import { getAuthSecret } from '../../_lib/auth.js';
import { auditLogInsert } from '../../_lib/admin.js';
import { hashInviteToken, looksLikeInviteToken } from '../../_lib/doctor-invite.js';

// Invited signup (body.inviteToken set, from /auth/doctor-signup?invite=...):
// an admin created a one-time link for this exact email
// (/api/admin/invites) and so vouches for the doctor. The account is
// created APPROVED (is_verified, role 'doctor'), signed in, and sent to
// the doctor dashboard, whose setup checklist is her first screen.
//
// Single use is enforced inside the transaction: its first statement
// consumes the invite (UPDATE ... WHERE unused, unrevoked, unexpired) and
// divides by the number of rows it changed, so a used / expired / raced
// invite raises division_by_zero (22012) and rolls back every insert.

const INVITE_GONE = 'This invitation link is no longer valid. Ask Womanie for a new one, or register without it.';

type Sql = ReturnType<typeof neon<false, false>>;

async function invitedSignup(
  _req: VercelRequest,
  res: VercelResponse,
  sql: Sql,
  a: {
    inviteToken: unknown; emailLower: string; passwordHash: string; userId: string;
    fullName: string; specialty?: string; licenseNumber: string; bio?: string;
  },
) {
  if (!looksLikeInviteToken(a.inviteToken)) return res.status(410).json({ error: INVITE_GONE });
  const tokenHash = hashInviteToken(a.inviteToken);

  const found = await sql.query(
    `SELECT i.id, i.email, i.created_by, u.email AS created_by_email
       FROM doctor_invites i LEFT JOIN auth_users u ON u.id = i.created_by
      WHERE i.token_hash = $1 AND i.used_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
      LIMIT 1`,
    [tokenHash]
  ) as Array<{ id: string; email: string; created_by: string; created_by_email: string | null }>;
  const invite = found[0];
  if (!invite) return res.status(410).json({ error: INVITE_GONE });
  if (invite.email.toLowerCase() !== a.emailLower) {
    return res.status(400).json({ error: 'This invitation is for a different email address.' });
  }

  const sessionId = 'sess_' + crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const log = auditLogInsert(
    { id: invite.created_by, email: invite.created_by_email ?? undefined },
    'invite_redeemed',
    { userId: a.userId, email: a.emailLower },
    { invite_id: invite.id, license_number: a.licenseNumber },
  );

  try {
    await sql.transaction([
      sql.query(
        `WITH used AS (
           UPDATE doctor_invites SET used_at = now(), used_by_user_id = $2
            WHERE token_hash = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
            RETURNING 1
         )
         SELECT 1 / (SELECT count(*)::int FROM used) AS ok`,
        [tokenHash, a.userId]
      ),
      sql.query(
        'INSERT INTO auth_users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)',
        [a.userId, a.emailLower, a.fullName, a.passwordHash]
      ),
      sql.query(
        `INSERT INTO doctor_profiles
           (user_id, full_name, specialties, license_number, bio, is_verified, verification_status,
            verified_at, verified_by)
         VALUES ($1, $2, $3, $4, $5, true, 'approved', now(), $6)`,
        [a.userId, a.fullName, a.specialty ? [a.specialty] : null, a.licenseNumber, a.bio ?? null, invite.created_by]
      ),
      sql.query(
        `INSERT INTO user_roles (user_id, role) VALUES ($1, 'doctor') ON CONFLICT DO NOTHING`,
        [a.userId]
      ),
      sql.query(
        'INSERT INTO auth_sessions (id, user_id, expires_at) VALUES ($1, $2, $3)',
        [sessionId, a.userId, expiresAt.toISOString()]
      ),
      sql.query(log[0], log[1]),
    ]);
  } catch (error) {
    if ((error as { code?: string }).code === '22012') {
      return res.status(410).json({ error: INVITE_GONE });
    }
    throw error;
  }

  const token = await new jose.SignJWT({ sub: a.userId, sid: sessionId, email: a.emailLower, name: a.fullName })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(getAuthSecret());
  res.setHeader('Set-Cookie', `womanie_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`);

  void notifyAdmin(`🩺 Invited doctor joined Womanie: ${a.fullName}\nLicense: ${a.licenseNumber}`);

  return res.status(200).json({ success: true, pending: false, redirect: '/doctor/dashboard' });
}

// Doctor account signup.
//
// Creates an auth_users row + an UNVERIFIED doctor_profiles row. Does
// NOT assign the 'doctor' role in user_roles — that's an admin step
// so a casual signup can't escalate themselves into the doctor-only
// surface of the app. DoctorLogIn's post-auth role check will keep
// them out until an admin marks them verified + inserts the role.
//
// No session cookie is set on success: the doctor is logged out and
// shown a "pending verification" message. This is deliberate — a
// half-authenticated "doctor" with no role would just be confusing.

// Cap doctor signups per source IP — same pattern as auth/signup.
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
  const rl = await checkAndConsume('doctor-signup-ip', ip, SIGNUPS_PER_IP_PER_DAY);
  if (!rl.ok) {
    return res.status(429).json({
      error: 'Too many signup attempts. Please try again later.',
      retryInSec: rl.retryInSec,
    });
  }

  try {
    const { email, password, fullName, specialty, licenseNumber, bio, inviteToken } = bodyObject(req.body);

    if (!email || !password || !fullName || !licenseNumber) {
      return res.status(400).json({ error: 'Email, password, full name, and license number are required' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (password.length > MAX_PASSWORD) {
      return res.status(400).json({ error: `Password must be at most ${MAX_PASSWORD} characters` });
    }
    if (!isEmailLike(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }
    if (typeof fullName !== 'string' || fullName.length > 200
        || typeof licenseNumber !== 'string' || licenseNumber.length > 100
        || !optionalText(specialty, 200) || !optionalText(bio, 5000)) {
      return res.status(400).json({ error: 'One of the fields is too long or not text' });
    }

    const sql = neon(process.env.DATABASE_URL!);

    const emailLower = String(email).toLowerCase();

    const existing = await sql.query(
      'SELECT id FROM auth_users WHERE email = $1',
      [emailLower]
    ) as unknown[];
    if (existing.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = 'user_' + crypto.randomUUID().replace(/-/g, '').slice(0, 20);

    if (inviteToken !== undefined && inviteToken !== null && inviteToken !== '') {
      return await invitedSignup(req, res, sql, {
        inviteToken, emailLower, passwordHash, userId,
        fullName: String(fullName), specialty: specialty ?? undefined, licenseNumber: String(licenseNumber), bio: bio ?? undefined,
      });
    }

    // Account + doctor profile in one transaction, so a failed profile
    // insert can't leave a login with no profile (and the email taken).
    await sql.transaction([
      sql.query(
        'INSERT INTO auth_users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)',
        [userId, emailLower, fullName, passwordHash]
      ),
      // doctor_profiles with is_verified=false. Specialties is a text[]
      // in the schema (per the session-5 /api/doctors/list select), so
      // wrap the single specialty string into an array.
      sql.query(
        `INSERT INTO doctor_profiles
           (user_id, full_name, specialties, license_number, bio, is_verified, verification_status)
         VALUES ($1, $2, $3, $4, $5, false, 'pending')`,
        [
          userId,
          fullName,
          specialty ? [specialty] : null,
          licenseNumber,
          bio ?? null,
        ]
      ),
    ]);

    // Intentionally NOT inserting into user_roles. Admin approval is
    // required before the doctor can log into the professional
    // dashboard; see audit.md HANDOFFs.

    // Ping Alena so the signup doesn't sit unnoticed waiting for
    // approval (fire-and-forget — never fails the signup).
    void notifyAdmin(
      `🩺 New doctor signup on Womanie: ${fullName}` +
      (specialty ? ` (${specialty})` : '') +
      `\nLicense: ${licenseNumber}` +
      `\nApprove or reject at https://womanie.info/admin/doctors`
    );

    return res.status(200).json({
      success: true,
      pending: true,
      message: 'Your doctor account has been submitted for verification. License review typically takes 1–3 business days; try logging in again once approved.',
    });
  } catch (error) {
    // Concurrent signups with the same email can both pass the pre-check
    // before the first transaction commits; the second hits the unique
    // constraint (23505) and should get the same friendly 409, not a 500.
    if ((error as { code?: string }).code === '23505') {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    console.error('Doctor signup error:', error);
    return res.status(500).json({ error: 'Failed to create doctor account' });
  }
}

export default withSentry(handler);
