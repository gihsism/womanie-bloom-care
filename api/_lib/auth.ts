import type { VercelRequest } from '@vercel/node';
import * as jose from 'jose';
import { neon } from '@neondatabase/serverless';
import { readCookie } from './oauth-state.js';

export function getAuthSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'AUTH_SECRET is missing or too short. Set AUTH_SECRET to a random string of at least 32 characters in Vercel env and .env.local.'
    );
  }
  return new TextEncoder().encode(secret);
}

// Session tokens are only ever signed with HS256. Pinning it means a token
// whose header names another algorithm is refused outright.
export const SESSION_JWT_ALGS = ['HS256'];

// The session cookie by its exact name: an anchored match, so a cookie
// such as `x_womanie_session=...` (for example one set by another site on
// a sibling subdomain) is never mistaken for it.
export function readSessionCookie(cookieHeader: string | undefined): string | null {
  return readCookie(cookieHeader, 'womanie_session');
}

export interface AuthUser {
  id: string;
  email?: string;
  name?: string;
  sessionId?: string;
}

export async function getAuthUser(req: VercelRequest): Promise<AuthUser | null> {
  const token = readSessionCookie(req.headers.cookie);
  if (!token) return null;

  try {
    const { payload } = await jose.jwtVerify(token, getAuthSecret(), { algorithms: SESSION_JWT_ALGS });
    // A valid signature isn't enough: logout, password change and account
    // deletion revoke by deleting the auth_sessions row, so the token must
    // still map to a live session (same check as /api/auth/me).
    if (!payload.sid || !payload.sub) return null;
    const sql = neon(process.env.DATABASE_URL!);
    const live = await sql.query(
      'SELECT 1 FROM auth_sessions WHERE id = $1 AND user_id = $2 AND expires_at > now()',
      [payload.sid, payload.sub]
    );
    if (live.length === 0) return null;
    return {
      id: payload.sub as string,
      email: payload.email as string | undefined,
      name: payload.name as string | undefined,
      sessionId: payload.sid as string | undefined,
    };
  } catch {
    return null;
  }
}
