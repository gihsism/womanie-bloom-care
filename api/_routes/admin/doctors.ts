import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminUser, auditLogInsert } from '../../_lib/admin.js';
import { checkGln, MEDREG_URL } from '../../_lib/doctor-invite.js';
import { withSentry } from '../../_lib/sentry.js';

// Admin-only: the doctor verification queue.
//
//   GET  /api/admin/doctors   -> { pending, approved, rejected, log, medregUrl }
//   POST /api/admin/doctors   body: { userId, action: 'approve' | 'reject' | 'revoke', reason? }
//
// Admin = ADMIN_EMAILS + Google-verified account (api/_lib/admin.ts).
//
// Approve: is_verified=true, verification_status='approved', role
// 'doctor' granted. Reject / revoke: is_verified=false, status set, role
// removed, and a REASON is required: it is stored in
// doctor_profiles.verification_note and shown to the doctor on her login
// screen (the in-app notice; no email provider). Every action writes an
// admin_audit_log row (who, when, what, reason) in the SAME transaction,
// so an unlogged action cannot commit.
//
// Rejected rows stay in place (the attempt is kept); auth_users is never
// deleted in case the person later uses the app as a patient.

const REASON_MAX = 500;

type Row = Record<string, unknown>;

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
      // Columns added by migration 023 are read through to_jsonb so the
      // queue still loads before it is applied (they come back NULL).
      const rows = await sql.query(
        `SELECT
            u.id AS user_id, u.email, u.created_at,
            p.full_name, p.specialties, p.license_number, p.bio,
            p.is_verified, p.verification_status,
            to_jsonb(p)->>'verification_note' AS verification_note,
            to_jsonb(p)->>'verified_at' AS verified_at,
            to_jsonb(p)->>'verified_by' AS verified_by
          FROM auth_users u
          JOIN doctor_profiles p ON p.user_id = u.id
          WHERE p.verification_status IN ('pending', 'approved', 'rejected', 'revoked')
          ORDER BY
            CASE p.verification_status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
            u.created_at ASC`
      ) as Row[];
      const withHints: Row[] = rows.map(r => ({ ...r, gln_check: checkGln(r.license_number) }));
      const pending = withHints.filter(r => r.verification_status === 'pending');
      const approved = withHints.filter(r => r.verification_status === 'approved');
      const rejected = withHints.filter(r => r.verification_status === 'rejected' || r.verification_status === 'revoked');

      let log: Row[] = [];
      try {
        log = await sql.query(
          `SELECT id, admin_email, action, target_user_id, target_email, detail, created_at
             FROM admin_audit_log ORDER BY created_at DESC LIMIT 50`
        ) as Row[];
      } catch {
        log = []; // migration 023 not applied yet
      }
      return res.status(200).json({ pending, approved, rejected, log, medregUrl: MEDREG_URL });
    } catch (error) {
      console.error('admin/doctors GET error:', error);
      return res.status(500).json({ error: 'Failed to load doctors' });
    }
  }

  if (req.method === 'POST') {
    const { userId, action, reason } = (req.body ?? {}) as {
      userId?: string;
      action?: 'approve' | 'reject' | 'revoke';
      reason?: unknown;
    };
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'Missing userId' });
    }
    if (action !== 'approve' && action !== 'reject' && action !== 'revoke') {
      return res.status(400).json({ error: "action must be 'approve', 'reject', or 'revoke'" });
    }
    const why = typeof reason === 'string' ? reason.trim() : '';
    if ((action === 'reject' || action === 'revoke') && why.length < 3) {
      return res.status(400).json({ error: 'A reason is required: the doctor sees it when she logs in.' });
    }
    if (why.length > REASON_MAX) {
      return res.status(400).json({ error: `Reason is too long (max ${REASON_MAX} characters).` });
    }

    try {
      const found = await sql.query(
        `SELECT u.email, p.verification_status, p.license_number
           FROM doctor_profiles p JOIN auth_users u ON u.id = p.user_id
          WHERE p.user_id = $1 LIMIT 1`,
        [userId]
      ) as Array<{ email: string | null; verification_status: string | null; license_number: string | null }>;
      const target = found[0];
      if (!target) return res.status(404).json({ error: 'No doctor profile for this user' });

      const log = auditLogInsert(admin, `doctor_${action}`, { userId, email: target.email }, {
        reason: why || null,
        from_status: target.verification_status,
        license_number: target.license_number,
      });

      if (action === 'approve') {
        // Profile, role and log commit together: is_verified without the
        // role leaves a verified-but-unusable profile; the role without
        // is_verified hides the doctor from the directory.
        await sql.transaction([
          sql.query(
            `UPDATE doctor_profiles
                SET is_verified = true, verification_status = 'approved',
                    verification_note = NULL, verified_at = now(), verified_by = $2
              WHERE user_id = $1`,
            [userId, admin.id]
          ),
          // Idempotent — safe to re-run if the admin clicks twice.
          sql.query(
            `INSERT INTO user_roles (user_id, role)
               VALUES ($1, 'doctor')
             ON CONFLICT DO NOTHING`,
            [userId]
          ),
          sql.query(log[0], log[1]),
        ]);
      } else {
        // Reject (pending signup) or revoke (approved doctor turned bad):
        // de-verify, keep the history in verification_status, strip the
        // role. Existing approved connection rows stay (so a re-approval
        // restores them), but every chart read and note write also
        // requires the 'doctor' role, so they open nothing meanwhile.
        const status = action === 'reject' ? 'rejected' : 'revoked';
        await sql.transaction([
          sql.query(
            `UPDATE doctor_profiles
                SET is_verified = false, verification_status = $2,
                    verification_note = $3, verified_at = now(), verified_by = $4
              WHERE user_id = $1`,
            [userId, status, why, admin.id]
          ),
          sql.query(
            `DELETE FROM user_roles WHERE user_id = $1 AND role = 'doctor'`,
            [userId]
          ),
          sql.query(log[0], log[1]),
        ]);
      }
      return res.status(200).json({ success: true, email: target.email });
    } catch (error) {
      console.error('admin/doctors POST error:', error);
      return res.status(500).json({ error: 'Failed to update doctor' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default withSentry(handler);
