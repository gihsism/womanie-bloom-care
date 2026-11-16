import { isNativeApp } from '@/lib/platform';

// Where a "Log In" button should take someone. On a device that last
// signed in with Google, skip the login form and go straight to Google —
// Google returns them directly to their own Home page. Everyone else
// gets the normal login page.
export function loginTarget(): { external: string } | { route: string } {
  try {
    if (!isNativeApp() && localStorage.getItem('womanie_last_method') === 'google') {
      return { external: '/api/auth/google' };
    }
  } catch { /* storage blocked */ }
  return { route: '/auth/login' };
}

export function startLogin(navigate: (to: string) => void): void {
  const t = loginTarget();
  if ('external' in t) window.location.href = t.external;
  else navigate(t.route);
}
