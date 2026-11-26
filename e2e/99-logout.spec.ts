import { test, expect } from './helpers';

// Flow 8 — log out from Me. Runs last, in the iphone project only: it ends
// that project's session, so the next run logs in once again (the desktop
// session is kept and reused — sign-ins are rate-limited, see global-setup).

test('log out', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone', 'iphone project only (keeps logins to one per run)');
  await page.goto('/dashboard/settings');
  await page.getByRole('button', { name: 'Log out' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/dashboard'));
  const me = await (await page.request.get('/api/auth/me')).json();
  expect(me.user).toBeNull();
  // The dashboard no longer opens without logging in again.
  await page.goto('/dashboard');
  await expect(page).not.toHaveURL(/\/dashboard$/, { timeout: 15_000 });
});
