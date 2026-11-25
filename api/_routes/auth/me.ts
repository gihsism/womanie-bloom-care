import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as jose from 'jose';
import { getAuthSecret } from '../../_lib/auth.js';
import { withSentry } from '../../_lib/sentry.js';

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

    // Stay logged in while she keeps using the app: once less than 20 of the
    // 30 days are left, push the session out another 30 days and re-issue the
    // cookie (same session id, so logout / delete-account still revoke it).
    try {
      const expiresAt = new Date(String((sessions[0] as { expires_at: string | Date }).expires_at)).getTime();
      if (Number.isFinite(expiresAt) && expiresAt - Date.now() < 20 * 24 * 60 * 60 * 1000) {
        const renewed = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await sql.query('UPDATE auth_sessions SET expires_at = $1 WHERE id = $2 AND user_id = $3', [renewed.toISOString(), payload.sid, payload.sub]);
        const fresh = await new jose.SignJWT({ sub: payload.sub, sid: payload.sid, email: payload.email, name: payload.name })
          .setProtectedHeader({ alg: 'HS256' })
          .setExpirationTime('30d')
          .sign(getAuthSecret());
        res.setHeader('Set-Cookie', `womanie_session=${fresh}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`);
      }
    } catch (e) {
      console.error('me: session renewal failed', e); // non-fatal, the current session is still valid
    }

    // The name she set in Me > Your profile (profiles.full_name) wins over
    // the name the JWT carried from signup, so a change shows at once;
    // the JWT name is the fallback when the profile has none.
    let resolvedName = (payload.name as string | undefined)?.trim() || null;
    try {
      const rows = await sql.query(
        'SELECT full_name FROM profiles WHERE id = $1 LIMIT 1',
        [payload.sub]
      ) as Array<{ full_name: string | null }>;
      const fromProfile = rows[0]?.full_name?.trim();
      if (fromProfile) resolvedName = fromProfile;
    } catch (e) {
      // Non-fatal — keep the JWT name (which may be null).
      console.error('me: profile name lookup failed', e);
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

    // Whether the account has a password (Google-only accounts don't), so
    // Settings can offer "Set a password" instead of "Change password".
    let hasPassword = true;
    try {
      const pw = await sql.query('SELECT password_hash IS NOT NULL AS has FROM auth_users WHERE id = $1', [payload.sub]) as Array<{ has: boolean }>;
      if (pw[0]) hasPassword = Boolean(pw[0].has);
    } catch (e) {
      console.error('me: password flag lookup failed', e);
    }

    // Account creation date for "Member since" in Settings. Separate
    // query so a schema difference can never break the session check.
    let createdAt: string | null = null;
    try {
      const r = await sql.query('SELECT created_at FROM auth_users WHERE id = $1', [payload.sub]) as Array<{ created_at: string | Date | null }>;
      if (r[0]?.created_at) createdAt = new Date(r[0].created_at).toISOString();
    } catch (e) {
      console.error('me: created_at lookup failed', e);
    }

    return res.status(200).json({
      user: {
        id: payload.sub,
        email: payload.email,
        name: resolvedName,
        isAdmin,
        hasPassword,
        created_at: createdAt,
      },
    });
  } catch (error) {
    // Invalid token
    res.setHeader('Set-Cookie', 'womanie_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
    return res.status(200).json({ user: null });
  }
}

export default withSentry(handler);
