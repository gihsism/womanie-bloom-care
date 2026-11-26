// When the one-time privacy consent screen (src/components/ConsentGate.tsx)
// replaces the page. Pure so it can be tested without React.
//
// /api/auth/me sets consentRequired when she has no consent_log row for
// the CURRENT privacy-policy version: a new Google account (Google sign-up
// skips the form's tick), an account from before the consent log, or
// after the version was bumped. The screen covers the whole patient app
// until she ticks the box; it never covers the public pages, the policy
// itself (so she can read it), the auth pages or the doctor portal.

export interface ConsentGateUser {
  consentRequired?: boolean;
}

const GATED_PREFIXES = [
  '/dashboard',
  '/welcome',
  '/onboarding',
  '/health-statistics',
  '/community',
];

// Inside the gated area but must stay readable: the policy she is asked
// to accept.
const ALWAYS_OPEN = ['/dashboard/privacy'];

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + '/');
}

// The path as React Router matches it: case-insensitive, each segment
// percent-decoded, empty segments and a trailing slash ignored. Without
// this, /DASHBOARD/settings or /dashboar%64 rendered the app ungated.
export function normalizeGatePath(pathname: string): string {
  const segs = pathname.split('/').filter(Boolean).map(s => {
    try { return decodeURIComponent(s); } catch { return s; }
  });
  return '/' + segs.join('/').toLowerCase();
}

export function isGatedPath(pathname: string): boolean {
  const path = normalizeGatePath(pathname);
  if (ALWAYS_OPEN.some(p => matches(path, p))) return false;
  return GATED_PREFIXES.some(p => matches(path, p));
}

export function shouldShowConsentGate(user: ConsentGateUser | null | undefined, pathname: string): boolean {
  return Boolean(user?.consentRequired) && isGatedPath(pathname);
}
