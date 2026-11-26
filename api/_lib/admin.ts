import type { VercelRequest } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { getAuthUser, type AuthUser } from './auth.js';

// Who is an admin.
//
// Two conditions, both required (fails closed on either):
//
//   1. The account's email is listed in the ADMIN_EMAILS env var
//      (comma-separated, case-insensitive). The email is read from
//      auth_users, not from the session token, so a stale token can't
//      carry an old address.
//   2. The account is linked to Google (auth_users.google_id is set).
//
// Why (2): password signup never verifies the email address, and
// auth_users has no email_verified column. Anyone could register a
// password account under an address in ADMIN_EMAILS before its owner
// did. Google sign-in is the only proof of address ownership the app
// has: /api/auth/callback only links a Google account whose email Google
// reports as verified, and linking drops any unverified password set on
// that address before. So: an admin must have signed in with Google at
// least once. After that she may also use a password she set herself in
// Settings (the account, not the login method, is what is verified).
//
// If ADMIN_EMAILS is unset, no one is an admin.

export function adminEmailList(): string[] {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

type Query = (text: string, params: unknown[]) => Promise<unknown[]>;

// The pure rule, shared with /api/auth/me (which only shows the admin
// menu) so the two can't drift.
export async function isVerifiedAdmin(query: Query, userId: string): Promise<{ ok: boolean; email?: string }> {
  const list = adminEmailList();
  if (list.length === 0 || !userId) return { ok: false };
  const rows = (await query(
    'SELECT email, google_id FROM auth_users WHERE id = $1 LIMIT 1',
    [userId],
  )) as Array<{ email: string | null; google_id: string | null }>;
  const row = rows[0];
  if (!row || !row.email || !row.google_id) return { ok: false };
  const email = row.email.toLowerCase();
  return list.includes(email) ? { ok: true, email } : { ok: false };
}

export async function getAdminUser(req: VercelRequest): Promise<AuthUser | null> {
  const user = await getAuthUser(req);
  if (!user) return null;
  if (adminEmailList().length === 0) return null;
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const q: Query = (t, p) => sql.query(t, p) as Promise<unknown[]>;
    const verdict = await isVerifiedAdmin(q, user.id);
    return verdict.ok ? { ...user, email: verdict.email } : null;
  } catch {
    return null;
  }
}

// The INSERT for one admin_audit_log row, returned as text + params so a
// caller can put it in the same sql.transaction as the action it logs.
export function auditLogInsert(
  admin: Pick<AuthUser, 'id' | 'email'>,
  action: string,
  target: { userId?: string | null; email?: string | null },
  detail?: Record<string, unknown>,
): [string, unknown[]] {
  return [
    `INSERT INTO admin_audit_log (admin_user_id, admin_email, action, target_user_id, target_email, detail)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      admin.id,
      admin.email ?? null,
      action,
      target.userId ?? null,
      target.email ?? null,
      detail ? JSON.stringify(detail) : null,
    ],
  ];
}
