import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withSentry } from '../_lib/sentry.js';
import { newStateToken, stateCookie } from '../_lib/oauth-state.js';

// Redirect to Google OAuth
function handler(req: VercelRequest, res: VercelResponse) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = `${process.env.SITE_URL || 'https://womanie.info'}/api/auth/callback`;

  // CSRF token: stored in an HttpOnly cookie and echoed to Google as
  // `state`, then verified in the callback (see _lib/oauth-state).
  const state = newStateToken();

  const params = new URLSearchParams({
    client_id: clientId!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
    state,
  });

  res.setHeader('Set-Cookie', stateCookie(state));
  res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

export default withSentry(handler);
