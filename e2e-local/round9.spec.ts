import type { Page } from '@playwright/test';
import { test, expect, mockAccount, accountFor } from './fixtures';

// Round 9 (2026-11-28): IVF clinic dates incl. monitoring scans, and the
// dates for contraception methods other than the pill. Both start from a
// brand-new account right after onboarding: Home asks for the first data,
// she enters it on the stage page, Home's Today list and the visit prep
// sheet pick it up.

const pad = (n: number) => String(n).padStart(2, '0');
function day(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const today = (page: Page) => page.getByRole('region', { name: 'Today', exact: true });

test.describe('IVF: a brand-new account enters the clinic dates', () => {
  test('Home asks for the dates; a scan today shows on Today and the prep sheet', async ({ page, consoleErrors }) => {
    const { profile } = accountFor('ivf');
    const api = await mockAccount(page, 'ivf', { tables: { profiles: [{ ...profile, ivf_start_date: null, ivf_phase: null }] } });
    await page.goto('/dashboard');

    // Round 10: the hero asks; no second Today row saying the same.
    await expect(today(page).getByRole('button', { name: /clinic/ })).toHaveCount(0);
    await page.getByRole('link', { name: "Add your clinic's dates" }).click();

    const journey = page.getByTestId('ivf-journey');
    await expect(journey).toBeVisible();
    await journey.getByTestId('ivf-edit-dates').click();
    await journey.getByLabel('Stimulation day 1').fill(day(-2));
    await journey.getByRole('button', { name: 'Add a scan date' }).click();
    await journey.getByLabel('Monitoring scan 1', { exact: true }).fill(day(0));
    await journey.getByTestId('ivf-save-dates').click();
    await expect(journey.getByTestId('ivf-scans')).toContainText('Monitoring scans:');
    await expect(journey.getByTestId('ivf-stim-day')).toHaveText('Stim day 3');
    await expect.poll(() => api.tables.ivf_plans?.length ?? 0).toBe(1);
    expect(JSON.parse(String(api.tables.ivf_plans[0].plan)).scans).toEqual([day(0)]);

    await page.goto('/dashboard');
    await expect(today(page).getByRole('button', { name: 'Monitoring scan today' })).toBeVisible();

    await page.goto('/dashboard/appointments/apt-1/prep');
    const section = page.getByTestId('visit-prep-sheet').locator('[data-section="ivf-dates"]');
    await expect(section).toContainText('Stimulation day 1');
    await expect(section).toContainText('Monitoring scan');

    expect(api.unhandled).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('Contraception: a brand-new account picks a method and enters its dates', () => {
  test('Home asks for the method; an implant end date shows on Today and the prep sheet', async ({ page, consoleErrors }) => {
    const api = await mockAccount(page, 'contraception');
    await page.goto('/dashboard');

    // No pill reminder for someone who has not said she takes one, and no
    // "Log today's pill" button either (round 10); the hero asks for the
    // method, with no second Today row saying the same.
    await expect(today(page).getByRole('button', { name: /pill|method/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: "Log today's pill" })).toHaveCount(0);
    await page.getByRole('link', { name: 'Choose your method' }).click();

    const picker = page.getByTestId('method-picker');
    await expect(picker).toContainText('Which method do you use?');
    await picker.getByRole('button', { name: /Implant/ }).click();

    const card = page.getByTestId('method-dates');
    await expect(card).toContainText('Your implant dates');
    await card.getByTestId('method-edit-dates').click();
    await card.getByLabel('Remove or replace by').fill(day(5));
    await card.getByTestId('method-save-dates').click();
    await expect(card.getByTestId('method-due')).toContainText('Implant replacement due');

    await page.goto('/dashboard');
    await expect(today(page).getByRole('button', { name: /^Implant replacement due .*: book a visit$/ })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Implant' })).toBeVisible();

    await page.goto('/dashboard/appointments/apt-1/prep');
    const section = page.getByTestId('visit-prep-sheet').locator('[data-section="contraception"]');
    await expect(section).toContainText('Method: Implant');
    await expect(section).toContainText('Replace by:');

    expect(api.unhandled).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('Ring: the change day today is a Today row', async ({ page, consoleErrors }) => {
    const api = await mockAccount(page, 'contraception');
    await page.addInitScript(([start]) => {
      localStorage.setItem('contraception:e2e-user-1:method', JSON.stringify('ring'));
      localStorage.setItem('contraception:e2e-user-1:methodDates', JSON.stringify({ ring: { cycleStart: start, schedule: 'usual' } }));
    }, [day(-21)]);
    await page.goto('/dashboard');
    await expect(today(page).getByRole('button', { name: 'Ring out (ring-free week) today' })).toBeVisible();

    expect(api.unhandled).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
