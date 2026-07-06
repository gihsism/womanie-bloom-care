import { randomUUID } from 'crypto';

// CSRF protection for the Google OAuth flow.
//
// /api/auth/google mints a random state token, stores it in a short-lived
// HttpOnly cookie, and passes the same value to Google as the `state`
// param. /api/auth/callback then requires the returned `state` to match
// the cookie before it trusts the `code`. Without this, an attacker can
// feed a victim a callback URL bearing the attacker's authorization code
// (login CSRF / session fixation).

export const STATE_COOKIE = 'womanie_oauth_state';
// Short window — the user is bouncing to Google and straight back.
const STATE_MAX_AGE_SEC = 10 * 60;

export function newStateToken(): string {
  return randomUUID().replace(/-/g, '');
}

// Constant-time string comparison so a mismatch can't be timed. Returns
// false for empty/absent values rather than treating "" === "" as a pass.
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Read a named cookie out of a raw Cookie header. Kept dependency-free to
// match the existing session-cookie parsing in _lib/auth.ts.
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = header.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`));
  return match ? match[1] : null;
}

export function stateCookie(value: string): string {
  return `${STATE_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${STATE_MAX_AGE_SEC}`;
}

// Expired cookie used to clear the state after the callback consumes it.
export function clearStateCookie(): string {
  return `${STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
