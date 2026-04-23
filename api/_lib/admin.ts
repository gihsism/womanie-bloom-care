import type { VercelRequest } from '@vercel/node';
import { getAuthUser, type AuthUser } from './auth.js';

// Admin-role detection, kept deliberately minimal: the session user's
// email must be listed in the ADMIN_EMAILS env var (comma-separated,
// case-insensitive). There is no user_roles.role='admin' check right
// now because role assignment itself is an admin operation — chicken
// and egg. When an admin UI and bootstrapped role exist, this helper
// should also consult user_roles.
//
// Fails closed: if ADMIN_EMAILS is unset, no one is an admin.

export async function getAdminUser(req: VercelRequest): Promise<AuthUser | null> {
  const user = await getAuthUser(req);
  if (!user || !user.email) return null;

  const list = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return null;

  return list.includes(user.email.toLowerCase()) ? user : null;
}
