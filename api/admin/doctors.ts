import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminUser } from '../_lib/admin.js';
import { withSentry } from '../_lib/sentry.js';

// Admin-only endpoint for managing pending doctor signups.
//
//   GET  /api/admin/doctors              → list pending doctors
//   POST /api/admin/doctors              body: { userId, action: 'approve' | 'reject' }
//
// Approve: flips doctor_profiles.is_verified=true,
// verification_status='approved', and inserts a user_roles row with
// role='doctor' under server authority (the /api/db WRITE_BLOCKED set
// forbids client writes). Reject: sets verification_status='rejected'
// and leaves the doctor_profiles row in place so the record of the
// attempt isn't lost — we don't delete auth_users in case the person
// later tries again as a patient.

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const admin = await getAdminUser(req);
  if (!admin) return res.status(403).json({ error: 'Admin only' });

  const sql = neon(process.env.DATABASE_URL!);

  if (req.method === 'GET') {
    try {
      const rows = await sql.query(
        `SELECT
            u.id AS user_id, u.email, u.created_at,
            p.full_name, p.specialties, p.license_number, p.bio,
            p.is_verified, p.verification_status
          FROM auth_users u
          JOIN doctor_profiles p ON p.user_id = u.id
          WHERE p.verification_status = 'pending'
          ORDER BY u.created_at ASC`
      );
      return res.status(200).json({ pending: rows });
    } catch (error) {
      console.error('admin/doctors GET error:', error);
      return res.status(500).json({ error: 'Failed to load pending doctors' });
    }
  }

  if (req.method === 'POST') {
    const { userId, action } = (req.body ?? {}) as { userId?: string; action?: 'approve' | 'reject' };
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'Missing userId' });
    }
    if (action !== 'approve' && action !== 'reject') {
      return res.status(400).json({ error: "action must be 'approve' or 'reject'" });
    }

    try {
      if (action === 'approve') {
        await sql.query(
          `UPDATE doctor_profiles
              SET is_verified = true, verification_status = 'approved'
            WHERE user_id = $1`,
          [userId]
        );
        // Idempotent — safe to re-run if the admin clicks twice.
        await sql.query(
          `INSERT INTO user_roles (user_id, role)
             VALUES ($1, 'doctor')
           ON CONFLICT DO NOTHING`,
          [userId]
        );
      } else {
        await sql.query(
          `UPDATE doctor_profiles
              SET verification_status = 'rejected', is_verified = false
            WHERE user_id = $1`,
          [userId]
        );
        // If a role was mistakenly granted before, revoke it.
        await sql.query(
          `DELETE FROM user_roles WHERE user_id = $1 AND role = 'doctor'`,
          [userId]
        );
      }
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('admin/doctors POST error:', error);
      return res.status(500).json({ error: 'Failed to update doctor' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default withSentry(handler);
