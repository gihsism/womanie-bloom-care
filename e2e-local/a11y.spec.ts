import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { test, expect, mockAccount, mockDoctor, STAGES } from './fixtures';

// Automated accessibility check (axe-core 4.14.1, vendored as
// vendor/axe.min.js because the repo does not depend on it) over the key
// screens, all 9 life stages and the doctor side, at 390 px. WCAG 2.0/2.1/2.2
// A + AA rules. A test fails on any critical finding, and on any serious
// finding except the ones listed in KNOWN_SERIOUS (each needs a decision
// outside a code fix; see docs/e2e.md "Accessibility check"). Also checks
// that focus lands somewhere sensible around the in-app dialogs and "N more".

const AXE = join(dirname(fileURLToPath(import.meta.url)), 'vendor', 'axe.min.js');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const KNOWN_SERIOUS: Record<string, string> = {
  // Muted text and faded (opacity) rows on the cream background, and the
  // primary-on-tint chips: fixing them changes the colour tokens.
  'color-contrast': 'needs a design-token decision',
  // Radix Toast renders <li role="status"> inside its <ol> viewport.
  list: 'Radix Toast markup',
};

interface Finding { id: string; impact: string; targets: string[] }

async function axe(page: Page, where: string): Promise<Finding[]> {
  await page.waitForLoadState('networkidle');
  await page.addScriptTag({ path: AXE });
  const found = await page.evaluate(async (tags) => {
    type AxeResult = { violations: { id: string; impact: string; nodes: { target: string[] }[] }[] };
    const run = (window as unknown as { axe: { run: (c: Document, o: object) => Promise<AxeResult> } }).axe.run;
    const r = await run(document, { runOnly: { type: 'tag', values: tags } });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')) }));
  }, TAGS);
  return found.map((f) => ({ ...f, id: `${where}: ${f.id}` }));
}

/** Critical always fails; serious fails unless its rule is a known, listed one. */
function blocking(findings: Finding[]) {
  return findings.filter((f) => f.impact === 'critical'
    || (f.impact === 'serious' && !(f.id.split(': ').pop()! in KNOWN_SERIOUS)));
}

const focused = (page: Page) => page.evaluate(() => {
  const el = document.activeElement;
  return el && el !== document.body ? `${el.tagName.toLowerCase()}:${(el.textContent ?? '').trim().slice(0, 40)}` : 'body';
});

test.beforeEach(({ browserName: _b }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-390', 'accessibility sweep runs at 390 px only');
});

const PAGES = [
  '/dashboard',
  '/dashboard/stage',
  '/dashboard/medical-history',
  '/dashboard/ai-doctor',
  '/dashboard/appointments',
  '/dashboard/appointments/apt-1/prep',
  '/dashboard/settings',
];

for (const stage of STAGES) {
  test(`${stage.label}: key screens have no critical (or new serious) findings`, async ({ page, consoleErrors }) => {
    test.setTimeout(90_000);
    const api = await mockAccount(page, stage.key);
    const findings: Finding[] = [];
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      findings.push(...await axe(page, path));
    }

    // Today's log sheet (a dialog) and, where Today has more rows than
    // fit, "N more": focus moves to the first revealed row.
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    const more = page.getByRole('button', { name: /^\d+ more$/ });
    if (await more.count()) {
      await more.first().click();
      await expect.poll(() => focused(page)).toMatch(/^button:/);
      expect(await focused(page)).not.toMatch(/more$/);
    }
    await page.getByRole('button', { name: /^(Log today|Log symptoms|Log medication)$/ }).first().click();
    await expect(page.getByRole('dialog').first()).toBeVisible();
    findings.push(...await axe(page, 'log sheet'));

    expect(blocking(findings)).toEqual([]);
    expect(api.unhandled).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
}

test('Ask AI error and the rename dialog: no findings, focus goes back', async ({ page, consoleErrors }) => {
  const api = await mockAccount(page, 'menstrual-cycle');
  await page.context().route((u) => u.pathname === '/api/ai-doctor-chat', (r) =>
    r.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"Too many requests"}' }));
  const findings: Finding[] = [];

  await page.goto('/dashboard/ai-doctor');
  await page.getByRole('textbox', { name: 'Your question' }).fill('Is this normal?');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Try again' })).toBeVisible();
  findings.push(...await axe(page, 'ask ai error'));

  await page.goto('/dashboard/medical-history');
  await page.getByRole('tab', { name: 'Documents' }).click();
  await page.getByRole('tabpanel', { name: 'Documents' }).getByRole('button', { name: /Blood test - iron and vitamin D/ }).click();
  const rename = page.getByRole('button', { name: 'Rename', exact: true });
  await rename.focus();
  await rename.click();
  const dialog = page.getByRole('alertdialog', { name: 'Rename document' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Document name')).toBeFocused();
  findings.push(...await axe(page, 'rename dialog'));
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(rename).toBeFocused();

  expect(blocking(findings)).toEqual([]);
  // The 429 is the point of this test; the page reports it itself.
  expect(consoleErrors.filter((e) => !/429|Too Many Requests/i.test(e))).toEqual([]);
  expect(api.unhandled).toEqual([]);
});

test('doctor side: dashboard, settings, chart and the confirm dialog', async ({ page, consoleErrors }) => {
  test.setTimeout(90_000);
  const api = await mockDoctor(page);
  const findings: Finding[] = [];

  await page.goto('/doctor/dashboard');
  await expect(page.getByTestId('doctor-day-schedule')).toBeVisible();
  findings.push(...await axe(page, 'doctor dashboard'));
  for (const name of ['Appointments', 'Profile & settings']) {
    await page.getByRole('tab', { name }).click();
    findings.push(...await axe(page, `doctor ${name}`));
  }

  await page.goto('/doctor/patient/pat-1');
  await expect(page.locator('[aria-labelledby="visit-brief-title"]')).toBeVisible();
  findings.push(...await axe(page, 'chart summary'));
  for (const name of ['Results', 'Trends']) {
    await page.getByRole('tab', { name }).click();
    findings.push(...await axe(page, `chart ${name}`));
  }

  await page.getByRole('button', { name: 'Write a note' }).click();
  await page.getByLabel('Title').fill('Iron follow-up');
  await page.getByLabel('Note', { exact: true }).fill('Re-check ferritin.');
  findings.push(...await axe(page, 'note form'));
  await page.getByRole('button', { name: 'Save note' }).click();
  const del = page.getByRole('button', { name: 'Delete note: Iron follow-up' });
  await del.focus();
  await del.click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toBeVisible();
  await expect.poll(async () => confirm.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  findings.push(...await axe(page, 'confirm dialog'));
  await confirm.getByRole('button', { name: 'Keep note' }).click();
  await expect(confirm).toBeHidden();
  await expect(del).toBeFocused();

  expect(blocking(findings)).toEqual([]);
  expect(api.unhandled).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
