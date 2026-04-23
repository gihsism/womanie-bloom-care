import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as jose from 'jose';
import { getAuthSecret } from '../_lib/auth.js';
import { withSentry } from '../_lib/sentry.js';

async function handler(req: VercelRequest, res: VercelResponse) {
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

    // isAdmin is derived from the ADMIN_EMAILS env var (same rule as
    // api/_lib/admin.ts). We expose it here so the client can decide
    // whether to render admin-only nav entries without a second
    // round-trip; the actual authorization still lives at each admin
    // endpoint.
    const adminList = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
    const email = (payload.email as string | undefined)?.toLowerCase();
    const isAdmin = Boolean(email && adminList.includes(email));

    return res.status(200).json({
      user: {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        isAdmin,
      },
    });
  } catch (error) {
    // Invalid token
    res.setHeader('Set-Cookie', 'womanie_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
    return res.status(200).json({ user: null });
  }
}

export default withSentry(handler);
