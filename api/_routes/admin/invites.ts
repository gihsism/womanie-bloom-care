import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminUser, auditLogInsert } from '../../_lib/admin.js';
import {
  generateInviteToken,
  hashInviteToken,
  inviteLink,
  normalizeEmail,
  INVITE_TTL_MS,
} from '../../_lib/doctor-invite.js';
import { withSentry } from '../../_lib/sentry.js';

// Admin-only: one-time doctor invitation links.
//
//   GET  /api/admin/invites                         -> { invites }
//   POST /api/admin/invites  { email, note? }       -> { link, expiresAt }
//   POST /api/admin/invites  { action: 'revoke', id }
//
// The link is shown ONCE in the create response; only its SHA-256 hash is
// stored, so it can never be listed again (lost link -> create a new
// one). Creating an invite revokes any earlier open invite for the same
// email, so at most one live link per doctor exists. Links expire after 7
// days and work once (/api/auth/doctor-signup consumes them).
//
// An invited signup is approved straight away (the admin who sends the
// link vouches for the doctor): check the doctor in MedReg BEFORE sending.
// Every create / revoke is written to admin_audit_log in the same
// transaction.

type Row = Record<string, unknown>;

function statusOf(r: Row, now = Date.now()): 'used' | 'revoked' | 'expired' | 'open' {
  if (r.used_at) return 'used';
  if (r.revoked_at) return 'revoked';
  if (new Date(String(r.expires_at)).getTime() <= now) return 'expired';
  return 'open';
}

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
        `SELECT id, email, note, created_by, created_at, expires_at, used_at, used_by_user_id, revoked_at
           FROM doctor_invites ORDER BY created_at DESC LIMIT 100`
      ) as Row[];
      return res.status(200).json({ invites: rows.map(r => ({ ...r, status: statusOf(r) })) });
    } catch (error) {
      console.error('admin/invites GET error:', error);
      return res.status(503).json({ error: 'Invites are not available yet (migration 023).' });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = (req.body ?? {}) as { action?: string; id?: unknown; email?: unknown; note?: unknown };

  if (body.action === 'revoke') {
    if (typeof body.id !== 'string' || !body.id) return res.status(400).json({ error: 'Missing id' });
    try {
      const found = await sql.query(
        'SELECT id, email FROM doctor_invites WHERE id = $1 AND used_at IS NULL AND revoked_at IS NULL LIMIT 1',
        [body.id]
      ) as Array<{ id: string; email: string }>;
      if (!found[0]) return res.status(404).json({ error: 'No open invite with this id' });
      const log = auditLogInsert(admin, 'invite_revoke', { email: found[0].email }, { invite_id: body.id });
      await sql.transaction([
        sql.query(
          'UPDATE doctor_invites SET revoked_at = now() WHERE id = $1 AND used_at IS NULL AND revoked_at IS NULL',
          [body.id]
        ),
        sql.query(log[0], log[1]),
      ]);
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('admin/invites revoke error:', error);
      return res.status(500).json({ error: 'Failed to revoke invite' });
    }
  }

  const email = normalizeEmail(body.email);
  if (!email) return res.status(400).json({ error: 'A valid doctor email is required' });
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) : '';

  try {
    const existing = await sql.query('SELECT id FROM auth_users WHERE email = $1 LIMIT 1', [email]) as unknown[];
    if (existing.length > 0) {
      return res.status(409).json({
        error: 'This email already has a Womanie account. Approve it from the queue instead.',
      });
    }

    const token = generateInviteToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const log = auditLogInsert(admin, 'invite_create', { email }, {
      note: note || null,
      expires_at: expiresAt.toISOString(),
    });
    await sql.transaction([
      // One live link per doctor: an older open invite stops working.
      sql.query(
        `UPDATE doctor_invites SET revoked_at = now()
          WHERE lower(email) = $1 AND used_at IS NULL AND revoked_at IS NULL`,
        [email]
      ),
      sql.query(
        `INSERT INTO doctor_invites (email, token_hash, note, created_by, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [email, hashInviteToken(token), note || null, admin.id, expiresAt.toISOString()]
      ),
      sql.query(log[0], log[1]),
    ]);
    return res.status(200).json({ link: inviteLink(token), email, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    console.error('admin/invites POST error:', error);
    return res.status(500).json({ error: 'Failed to create invite' });
  }
}

export default withSentry(handler);
