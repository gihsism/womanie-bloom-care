import { test, expect, mockAccount, resolveTokens } from './fixtures';
import type { Row } from './mock-api';

// Baby Vaccines tab: the BAG Swiss schedule 2026 (birth to 18 months)
// grouped as Due now or soon / Later / Done, "Mark done" with a date (one
// dose, or the whole visit), Undo, other vaccinations, the visible BAG
// source line, and the vaccinations table on the paediatrician print
// summary. Baby Lou, born 70 days ago: the 2-month visit is due, the
// 6-in-1 dose 1 is already marked done, and an old free-text entry
// ("Vitamin K") stays under Other vaccinations.

const at = (daysAgo: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
};
const ev = (id: string, occurred_at: string, data: Row): Row => ({
  id, user_id: 'e2e-user-1', baby_id: 'baby-1', kind: 'baby_vaccine', occurred_at, ended_at: null, data: JSON.stringify(data), created_at: occurred_at,
});
function tables(birth: string | null = resolveTokens('{{day:-70}}')): Record<string, Row[]> {
  return {
    babies: [{ id: 'baby-1', user_id: 'e2e-user-1', name: 'Lou', birth_date: birth, sex: 'female', created_at: at(70) }],
    life_events: [
      ev('v-1', at(8), { name: '6-in-1 vaccine, dose 1 of 3', dose: 'hexa-1' }),
      ev('v-old', at(69), { name: 'Vitamin K' }),
    ],
  };
}
const vaxRows = (t: Record<string, Row[]>) =>
  (t.life_events ?? []).filter(r => r.kind === 'baby_vaccine').map(r => ({ id: r.id, occurred_at: r.occurred_at, data: typeof r.data === 'string' ? JSON.parse(r.data) : r.data }));
const noSideScroll = async (page: import('@playwright/test').Page) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
};

test.describe('Baby vaccines (BAG Swiss schedule)', () => {
  test('due / later / done, Mark done with a date, Undo, Mark all; source line; no sideways scroll', async ({ page, consoleErrors }, testInfo) => {
    const api = await mockAccount(page, 'postpartum', { tables: tables() });
    await page.goto('/dashboard/baby?tab=vax');
    await expect(page.getByRole('heading', { name: 'Swiss vaccination schedule' })).toBeVisible();
    const source = page.getByTestId('vax-source');
    await expect(source.getByRole('link', { name: 'Source: BAG Swiss vaccination schedule 2026' })).toHaveAttribute('href', 'https://www.bag.admin.ch/de/schweizerischer-impfplan');
    await expect(source).toContainText('Ask your paediatrician');

    // 2-month visit is due: 6-in-1 done, pneumococcal and rotavirus open.
    const due = page.getByTestId('vax-due');
    const v2 = due.getByTestId('vax-visit-2 months');
    await expect(v2.getByTestId('vax-dose-hexa-1')).toContainText('Done');
    await expect(v2.getByTestId('vax-dose-pcv-1')).toContainText('Pneumococcal vaccine, dose 1 of 3');
    await expect(v2.getByTestId('vax-dose-rota-1')).toContainText('extra');
    // Later: 9-month MMRV and the 12-18-month meningococcal doses.
    const later = page.getByTestId('vax-later');
    await expect(later.getByTestId('vax-visit-9 months')).toContainText('MMRV vaccine, dose 1 of 2');
    await expect(later.getByTestId('vax-visit-12-18 months')).toContainText('Meningococcal ACWY vaccine');
    await expect(page.getByTestId('vax-other')).toContainText('Vitamin K');
    await noSideScroll(page);
    await page.screenshot({ path: testInfo.outputPath('vaccines-tab.png'), fullPage: true });

    // One dose: Mark done -> date -> Save; Undo removes it.
    await page.getByRole('button', { name: 'Mark done, Pneumococcal vaccine, dose 1 of 3' }).click();
    const date = page.getByLabel('Date given: Pneumococcal vaccine, dose 1 of 3');
    await date.fill(resolveTokens('{{day:-3}}'));
    await noSideScroll(page);
    await page.getByTestId('vax-mark-row').getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('baby-notice')).toContainText('Marked done ✓');
    expect(vaxRows(api.tables)).toContainEqual(expect.objectContaining({ data: { name: 'Pneumococcal vaccine, dose 1 of 3', dose: 'pcv-1' } }));
    await expect(v2.getByTestId('vax-dose-pcv-1')).toContainText('Done');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByTestId('baby-notice')).toContainText('Removed.');
    expect(vaxRows(api.tables).map(r => r.id).sort()).toEqual(['v-1', 'v-old']);

    // Whole visit: both open doses with one date; the visit moves to Done.
    await v2.getByRole('button', { name: 'Mark all 2 done' }).click();
    await page.getByLabel('Date given: all 2 at 2 months').fill(resolveTokens('{{day:-2}}'));
    await page.getByTestId('vax-mark-row').getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('baby-notice')).toContainText('2 marked done ✓');
    expect(vaxRows(api.tables).map(r => r.data.dose).filter(Boolean).sort()).toEqual(['hexa-1', 'pcv-1', 'rota-1']);
    await expect(page.getByTestId('vax-done').getByTestId('vax-visit-2 months')).toBeVisible();
    await page.getByTestId('vax-done').scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('vaccines-marked.png'), fullPage: true });

    // A done mark can be removed again.
    await page.getByRole('button', { name: 'Remove done mark, Rotavirus drops, dose 1 of 2' }).click();
    await expect(due.getByTestId('vax-dose-rota-1').getByRole('button', { name: /Mark done/ })).toBeVisible();

    expect(api.unhandled).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('no birth date: asks for it, then shows the dates', async ({ page, consoleErrors }) => {
    const api = await mockAccount(page, 'postpartum', { tables: tables(null) });
    await page.goto('/dashboard/baby?tab=vax');
    await expect(page.getByTestId('vax-birth-picker')).toContainText('Add Lou’s birth date');
    await expect(page.getByTestId('vax-later').getByTestId('vax-visit-2 months')).toBeVisible();
    await page.getByLabel('Birth date').fill(resolveTokens('{{day:-70}}'));
    await page.getByTestId('vax-birth-picker').getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('vax-due').getByTestId('vax-visit-2 months')).toBeVisible();
    expect(api.tables.babies[0].birth_date).toBe(resolveTokens('{{day:-70}}'));
    await noSideScroll(page);
    expect(api.unhandled).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('print summary lists the vaccinations with the BAG source', async ({ page, consoleErrors }, testInfo) => {
    const api = await mockAccount(page, 'postpartum', { tables: tables() });
    await page.goto('/dashboard/baby/summary/print?baby=baby-1');
    const sec = page.locator('[data-section="vaccines"]');
    await expect(sec.getByRole('heading', { name: 'Vaccinations (Swiss schedule)' })).toBeVisible();
    await expect(sec.locator('tbody tr')).toHaveCount(15);
    await expect(sec.locator('[data-dose="hexa-1"]')).toContainText('Done');
    await expect(sec.locator('[data-dose="pcv-1"]')).toContainText('Not marked yet');
    await expect(sec).toContainText('Other vaccinations: Vitamin K');
    await expect(sec).toContainText('Source: BAG Swiss vaccination schedule 2026');
    await noSideScroll(page);
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByTestId('baby-summary-print')).toBeHidden();
    await expect(sec).toBeVisible();
    await sec.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('print-vaccines.png'), fullPage: true });
    expect(api.unhandled).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
