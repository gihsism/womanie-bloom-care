import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as jose from 'jose';
import { getAuthSecret } from '../../_lib/auth.js';
import { withSentry } from '../../_lib/sentry.js';
import { isVerifiedAdmin } from '../../_lib/admin.js';
import { isMaintenanceOn } from '../../_lib/maintenance.js';
import { POLICY_VERSIONS } from '../../_lib/policy-versions.js';
import { privacyConsentStatus, type ConsentStatus } from '../../_lib/consent-status.js';

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
      // Skipped in maintenance (read-only) mode: no writes to a database
      // that is being copied.
      if (!isMaintenanceOn() && Number.isFinite(expiresAt) && expiresAt - Date.now() < 20 * 24 * 60 * 60 * 1000) {
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

    // isAdmin: the same rule as api/_lib/admin.ts (ADMIN_EMAILS + an
    // account Google has verified), so the admin menu only shows for
    // someone the admin endpoints will actually accept. Display only; the
    // real check still lives at each admin endpoint.
    let isAdmin = false;
    try {
      const q = (t: string, p: unknown[]) => sql.query(t, p) as Promise<unknown[]>;
      isAdmin = (await isVerifiedAdmin(q, String(payload.sub))).ok;
    } catch (e) {
      console.error('me: admin check failed', e);
    }

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

    // Privacy consent (consent_log, migration 024): has she accepted the
    // CURRENT policy version? If not, the app shows the one-time consent
    // screen before anything else (src/components/ConsentGate.tsx): a
    // Google sign-up, an account from before the log, or a version bump.
    // A failed lookup does not lock her out (the session itself is valid);
    // the screen simply shows on the next load.
    let consent: ConsentStatus = { required: false, reason: null };
    const privacy = POLICY_VERSIONS.privacy_policy;
    if (privacy) {
      try {
        const rows = await sql.query(
          "SELECT version FROM consent_log WHERE user_id = $1 AND document = 'privacy_policy'",
          [payload.sub]
        ) as Array<{ version: string }>;
        consent = privacyConsentStatus(rows, privacy.version);
      } catch (e) {
        console.error('me: consent lookup failed', e);
      }
    }

    return res.status(200).json({
      user: {
        id: payload.sub,
        email: payload.email,
        name: resolvedName,
        isAdmin,
        hasPassword,
        created_at: createdAt,
        consentRequired: consent.required,
        consentReason: consent.reason,
        privacyPolicyVersion: privacy?.version ?? null,
      },
    });
  } catch (error) {
    // Invalid token
    res.setHeader('Set-Cookie', 'womanie_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
    return res.status(200).json({ user: null });
  }
}

export default withSentry(handler);
