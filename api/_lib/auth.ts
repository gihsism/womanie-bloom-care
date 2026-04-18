import type { VercelRequest } from '@vercel/node';
import * as jose from 'jose';

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
