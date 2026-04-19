import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as jose from 'jose';
import { getAuthSecret } from '../_lib/auth.js';
import { withSentry } from '../_lib/sentry.js';

async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const cookies = req.headers.cookie || '';
    const match = cookies.match(/womanie_session=([^;]+)/);

    if (match) {
      const token = match[1];

      try {
        const { payload } = await jose.jwtVerify(token, getAuthSecret());
        // Delete session from database
        const sql = neon(process.env.DATABASE_URL!);
        await sql.query('DELETE FROM auth_sessions WHERE id = $1', [payload.sid]);
      } catch { /* token invalid, just clear cookie */ }
    }

    // Clear cookie and redirect
    res.setHeader('Set-Cookie', 'womanie_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
    res.redirect(302, '/');
  } catch {
    res.redirect(302, '/');
  }
}

export default withSentry(handler);
