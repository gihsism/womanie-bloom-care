import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as jose from 'jose';
import { getAuthSecret } from '../_lib/auth.js';
import { withSentry } from '../_lib/sentry.js';
import { readCookie, safeEqual, clearStateCookie, STATE_COOKIE } from '../_lib/oauth-state.js';

async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { code, state } = req.query;
    if (!code || typeof code !== 'string') {
      return res.redirect(302, '/auth/login?error=no_code');
    }

    // CSRF check: the `state` Google echoed back must match the cookie we
    // set at /api/auth/google. Reject before spending the code otherwise.
    const cookieState = readCookie(req.headers.cookie, STATE_COOKIE);
    if (typeof state !== 'string' || !safeEqual(state, cookieState)) {
      return res.redirect(302, '/auth/login?error=bad_state');
    }

    const siteUrl = process.env.SITE_URL || 'https://womanie.info';
    const redirectUri = `${siteUrl}/api/auth/callback`;

    // Exchange code for tokens
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResp.ok) {
      console.error('Token exchange failed:', await tokenResp.text());
      return res.redirect(302, '/auth/login?error=token_failed');
    }

    const tokens = await tokenResp.json();

    // Get user info
    const userResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userResp.ok) {
      return res.redirect(302, '/auth/login?error=userinfo_failed');
    }

    const googleUser = await userResp.json();
    const sql = neon(process.env.DATABASE_URL!);

    // Find or create user
    let users = await sql.query('SELECT * FROM auth_users WHERE google_id = $1', [googleUser.id]);

    if (users.length === 0) {
      // Check by email
      users = await sql.query('SELECT * FROM auth_users WHERE email = $1', [googleUser.email]);

      if (users.length === 0) {
        // Create new user
        const userId = 'user_' + crypto.randomUUID().replace(/-/g, '').slice(0, 20);
        await sql.query(
          'INSERT INTO auth_users (id, email, name, avatar_url, google_id) VALUES ($1, $2, $3, $4, $5)',
          [userId, googleUser.email, googleUser.name, googleUser.picture, googleUser.id]
        );
        users = [{ id: userId, email: googleUser.email, name: googleUser.name, avatar_url: googleUser.picture, google_id: googleUser.id }];

        // Also create profile
        await sql.query(
          'INSERT INTO profiles (id, full_name, life_stage) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
          [userId, googleUser.name, 'menstrual-cycle']
        );
      } else {
        // Link Google ID to existing email user
        await sql.query('UPDATE auth_users SET google_id = $1, name = $2, avatar_url = $3 WHERE id = $4',
          [googleUser.id, googleUser.name, googleUser.picture, users[0].id]);
      }
    }

    const user = users[0];

    // Create session
    const sessionId = 'sess_' + crypto.randomUUID().replace(/-/g, '').slice(0, 20);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await sql.query(
      'INSERT INTO auth_sessions (id, user_id, expires_at) VALUES ($1, $2, $3)',
      [sessionId, user.id, expiresAt.toISOString()]
    );

    // Create JWT with session info
    const token = await new jose.SignJWT({
      sub: user.id,
      sid: sessionId,
      email: user.email,
      name: user.name,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('30d')
      .sign(getAuthSecret());

    // Set the session cookie and clear the now-consumed CSRF state cookie.
    res.setHeader('Set-Cookie', [
      `womanie_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`,
      clearStateCookie(),
    ]);
    res.redirect(302, '/welcome');
  } catch (error) {
    // Log full details server-side (also captured by Sentry); never leak
    // internal error messages to the client. Redirect to login with a
    // generic code, consistent with the other failure paths above.
    console.error('Auth callback error:', error);
    return res.redirect(302, '/auth/login?error=auth_failed');
  }
}

export default withSentry(handler);
