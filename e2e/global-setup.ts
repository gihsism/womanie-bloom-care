import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { chromium, type Browser, type FullConfig } from '@playwright/test';
import { readPassword, TEST_EMAIL } from './helpers';

// Flow 1 — log in, through the real login form, once per project, saved as
// that project's storage state (its own session each).
//
// The server allows only 30 sign-in attempts per email per day, and other
// tools use this account too, so a saved session that is still valid is
// reused instead of logging in again (E2E_FRESH_LOGIN=1 forces a login).
// Only the iphone project logs out at the end, so a normal run costs one
// login.
//
// This runs outside the test runner's tracing, which keeps the password
// out of every trace, screenshot and report.

async function sessionStillValid(browser: Browser, statePath: string, baseURL: string): Promise<boolean> {
  if (process.env.E2E_FRESH_LOGIN === '1' || !existsSync(statePath)) return false;
  const context = await browser.newContext({ storageState: statePath, baseURL });
  try {
    const me = await (await context.request.get('/api/auth/me')).json();
    return me?.user?.email === TEST_EMAIL;
  } catch {
    return false;
  } finally {
    await context.close();
  }
}

// The app covers every page with the one-time privacy consent screen while
// the account has not accepted the CURRENT policy version (2026-11-26; it
// asks again after every version bump). Accept it once for the test account
// so the flows see the app, exactly as she would after ticking the box.
async function ensureConsent(browser: Browser, statePath: string, baseURL: string): Promise<void> {
  const context = await browser.newContext({ storageState: statePath, baseURL });
  try {
    const me = await (await context.request.get('/api/auth/me')).json();
    if (me?.user?.consentRequired) {
      const r = await context.request.post('/api/me/consents', { data: { document: 'privacy_policy', context: 'gate' } });
      if (!r.ok()) throw new Error(`accepting the privacy policy for ${TEST_EMAIL} failed: HTTP ${r.status()}`);
    }
  } finally {
    await context.close();
  }
}

export default async function globalSetup(config: FullConfig) {
  const browser = await chromium.launch();
  try {
    for (const project of config.projects) {
      const { baseURL, storageState, browserName: _b, defaultBrowserType: _d, ...device } = project.use as Record<string, unknown>;
      if (typeof storageState !== 'string' || typeof baseURL !== 'string') continue;
      const statePath = resolve(config.configFile ? dirname(config.configFile) : process.cwd(), storageState);
      mkdirSync(dirname(statePath), { recursive: true });
      if (await sessionStillValid(browser, statePath, baseURL)) {
        await ensureConsent(browser, statePath, baseURL);
        continue;
      }

      const context = await browser.newContext({ ...(device as object), baseURL });
      const page = await context.newPage();
      await page.goto('/auth/login');
      await page.getByRole('textbox', { name: 'Email' }).fill(TEST_EMAIL);
      await page.getByRole('textbox', { name: 'Password' }).fill(readPassword());
      const loginResp = page.waitForResponse((r) => r.url().includes('/api/auth/login'), { timeout: 30_000 }).catch(() => null);
      await page.getByRole('button', { name: 'Log In', exact: true }).click();
      const login = await loginResp;
      if (login && !login.ok()) {
        throw new Error(`[${project.name}] login as ${TEST_EMAIL} failed: HTTP ${login.status()} ${(await login.text()).slice(0, 200)}`);
      }
      try {
        await page.waitForURL(/\/(dashboard|welcome)/, { timeout: 30_000 });
      } catch {
        const notice = (await page.locator('[role=status], [role=alert]').allInnerTexts()).join(' | ');
        throw new Error(`[${project.name}] login as ${TEST_EMAIL} did not reach the dashboard (still on ${page.url()}; page says: ${notice || 'nothing'})`);
      }
      await context.storageState({ path: statePath });
      await context.close();
      await ensureConsent(browser, statePath, baseURL);
    }
  } finally {
    await browser.close();
  }
}
