import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import { withSentry } from '../_lib/sentry.js';
import { notifyAdmin } from '../_lib/notify.js';

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

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, password, fullName, specialty, licenseNumber, bio } = req.body ?? {};

    if (!email || !password || !fullName || !licenseNumber) {
      return res.status(400).json({ error: 'Email, password, full name, and license number are required' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
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

    await sql.query(
      'INSERT INTO auth_users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)',
      [userId, emailLower, fullName, passwordHash]
    );

    // doctor_profiles with is_verified=false. Specialties is a text[]
    // in the schema (per the session-5 /api/doctors/list select), so
    // wrap the single specialty string into an array.
    await sql.query(
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
    );

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
    console.error('Doctor signup error:', error);
    return res.status(500).json({ error: 'Failed to create doctor account' });
  }
}

export default withSentry(handler);
