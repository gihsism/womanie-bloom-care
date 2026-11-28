import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as jose from 'jose';
import { getAuthSecret } from '../../_lib/auth.js';
import { withSentry } from '../../_lib/sentry.js';
import { readCookie } from '../../_lib/oauth-state.js';

export function isCrossSite(req: VercelRequest): boolean {
  const site = req.headers?.['sec-fetch-site'];
  return (Array.isArray(site) ? site[0] : site) === 'cross-site';
}

async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // The app logs out by navigating to this URL (a same-origin GET). The
    // session cookie is SameSite=Lax, so a link or image on another site
    // would carry it too and sign her out without asking. Browsers mark
    // such requests Sec-Fetch-Site: cross-site; those are sent home
    // without touching the session.
    if (isCrossSite(req)) return res.redirect(302, '/');

    // Same anchored lookup as getAuthUser (api/_lib/auth.ts readSessionCookie).
    const token = readCookie(req.headers.cookie, 'womanie_session');

    if (token) {

      try {
        const { payload } = await jose.jwtVerify(token, getAuthSecret(), { algorithms: ['HS256'] });
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
