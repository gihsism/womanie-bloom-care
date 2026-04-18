import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as jose from 'jose';
import { getAuthSecret } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cookie');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Get token from cookie
    const cookies = req.headers.cookie || '';
    const match = cookies.match(/womanie_session=([^;]+)/);
    if (!match) return res.status(200).json({ user: null });

    const token = match[1];

    // Verify JWT
    const { payload } = await jose.jwtVerify(token, getAuthSecret());

    // Check session still exists and not expired
    const sql = neon(process.env.DATABASE_URL!);
    const sessions = await sql.query(
      'SELECT * FROM auth_sessions WHERE id = $1 AND user_id = $2 AND expires_at > now()',
      [payload.sid, payload.sub]
    );

    if (sessions.length === 0) {
      // Session expired or deleted
      res.setHeader('Set-Cookie', 'womanie_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
      return res.status(200).json({ user: null });
    }

    return res.status(200).json({
      user: {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
      },
    });
  } catch (error) {
    // Invalid token
    res.setHeader('Set-Cookie', 'womanie_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
    return res.status(200).json({ user: null });
  }
}
