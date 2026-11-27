import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, expect, type Page } from '@playwright/test';
import { installMockApi, type MockApi, type Row, type Tables } from './mock-api';

// Fixture loading for the local suite. account.json / stages.json hold the
// fake patient; date tokens are resolved against today so "next visit in 5
// days" and "period 12 days ago" stay true whenever the suite runs.

const here = dirname(fileURLToPath(import.meta.url));
const readJson = (name: string) => JSON.parse(readFileSync(join(here, 'fixtures', name), 'utf8'));

const pad = (n: number) => String(n).padStart(2, '0');
function localDay(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function resolveTokens<T>(value: T): T {
  const text = JSON.stringify(value)
    .replace(/\{\{day:(-?\d+)\}\}/g, (_, n) => localDay(Number(n)))
    .replace(/\{\{at:(-?\d+)\}\}/g, (_, n) => new Date(Date.now() + Number(n) * 86_400_000).toISOString());
  return JSON.parse(text) as T;
}

interface Account { user: Row; profile: Row; tables: Tables; appointments: Row[] }
type StageInfo = { label: string; profile: Row };

export const STAGES = Object.entries(readJson('stages.json') as Record<string, StageInfo | string>)
  .filter((e): e is [string, StageInfo] => e[0] !== '_comment')
  .map(([key, info]) => ({ key, label: info.label }));

export function accountFor(stage: string): Account & { stageLabel: string } {
  const account = resolveTokens(readJson('account.json') as Account);
  const stages = resolveTokens(readJson('stages.json') as Record<string, StageInfo>);
  const info = stages[stage];
  if (!info) throw new Error(`unknown stage ${stage}`);
  const profile = { ...account.profile, ...info.profile, life_stage: stage };
  return { ...account, profile, tables: { ...account.tables, profiles: [profile] }, stageLabel: info.label };
}

/** Starts the fake API for one stage before the first navigation. */
export async function mockAccount(
  page: Page,
  stage = 'menstrual-cycle',
  /** Replace whole fixture tables (e.g. { medications: [] }) or the appointment list. */
  override: { tables?: Tables; appointments?: Row[] } = {},
): Promise<MockApi & { account: ReturnType<typeof accountFor> }> {
  const account = accountFor(stage);
  const api = await installMockApi(page, {
    user: account.user,
    tables: { ...account.tables, ...override.tables },
    appointments: override.appointments ?? account.appointments,
  });
  return Object.assign(api, { account });
}

// Console noise that is not an app bug.
const IGNORED_CONSOLE = [/Download the React DevTools/i, /favicon/i];

/** `consoleErrors`: console.error / uncaught page errors seen during the test. */
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
