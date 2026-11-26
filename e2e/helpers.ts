import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';

export const TEST_EMAIL = 'ux-review@womanie.test';

/**
 * The test account's password: E2E_PASSWORD, else ~/.cache/womanie-ux/.pw,
 * read at runtime. Never log it, never pass it to a traced action.
 */
export function readPassword(): string {
  const fromEnv = process.env.E2E_PASSWORD?.trim();
  if (fromEnv) return fromEnv;
  try {
    const fromFile = readFileSync(join(homedir(), '.cache', 'womanie-ux', '.pw'), 'utf8').trim();
    if (fromFile) return fromFile;
  } catch { /* fall through */ }
  throw new Error('No test password: set E2E_PASSWORD or create ~/.cache/womanie-ux/.pw');
}

/** Generic /api/db call, the same one the app's db client makes (owner-scoped server side). */
export async function apiDb<T = Record<string, unknown>>(
  request: APIRequestContext,
  body: Record<string, unknown>,
): Promise<T[]> {
  const resp = await request.post('/api/db', {
    data: {
      selectColumns: '*', insertData: null, updateData: null, upsertData: null, upsertOptions: null,
      filters: [], orderBy: null, limitCount: null, isSingle: false, isMaybeSingle: false,
      ...body,
    },
  });
  expect(resp.ok(), `/api/db ${body.operation} ${body.table} -> ${resp.status()}`).toBeTruthy();
  const json = await resp.json();
  return (json.rows ?? []) as T[];
}

export async function currentUserId(request: APIRequestContext): Promise<string> {
  const resp = await request.get('/api/auth/me');
  const json = await resp.json();
  expect(json.user?.id, 'session should be logged in (run global-setup)').toBeTruthy();
  return json.user.id as string;
}

/** The browser's local calendar date, the one DailyLogging keys rows by. */
export function localDate(page: Page): Promise<string> {
  return page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
}

// Console noise that is not an app bug (browser/extension/third-party).
const IGNORED_CONSOLE = [
  /Download the React DevTools/i,
  /favicon/i,
];

/** `consoleErrors`: every console.error / uncaught page error seen during the test. */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: async ({ page }, provide) => {
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && !IGNORED_CONSOLE.some((r) => r.test(m.text()))) errors.push(`console: ${m.text()}`);
    });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    await provide(errors);
  },
});

export { expect };
