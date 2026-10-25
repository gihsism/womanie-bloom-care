import type { VercelRequest } from '@vercel/node';
import * as jose from 'jose';
import { neon } from '@neondatabase/serverless';

export function getAuthSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'AUTH_SECRET is missing or too short. Set AUTH_SECRET to a random string of at least 32 characters in Vercel env and .env.local.'
    );
  }
  return new TextEncoder().encode(secret);
}

export interface AuthUser {
  id: string;
  email?: string;
  name?: string;
  sessionId?: string;
}

export async function getAuthUser(req: VercelRequest): Promise<AuthUser | null> {
  const cookies = req.headers.cookie || '';
  const match = cookies.match(/womanie_session=([^;]+)/);
  if (!match) return null;

  try {
    const { payload } = await jose.jwtVerify(match[1], getAuthSecret());
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
