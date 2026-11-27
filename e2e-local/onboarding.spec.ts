import type { Page } from '@playwright/test';
import { test, expect, mockAccount } from './fixtures';

// Sign-up onboarding (Welcome -> basics -> stage -> stage questions ->
// "You're set up"), once per stage choice, with the fake API. Each run
// checks the stage that lands in the profile, that only questions the app
// uses are asked, and that nothing errors.

async function pickFirstOfMonth(page: Page, trigger = 'Pick a date') {
  await page.getByRole('button', { name: trigger }).first().click();
  await page.getByRole('gridcell', { name: '1', exact: true }).first().click();
  // Picking a day closes the calendar (it used to stay open over Finish).
  await expect(page.getByRole('grid')).toHaveCount(0);
}

const CASES: Array<{
  choice: string;
  stage: string;
  fill?: (page: Page) => Promise<void>;
  /** Questions that must NOT be asked any more (never saved or used). */
  gone?: RegExp[];
}> = [
  { choice: 'Before first period', stage: 'pre-menstrual' },
  {
    choice: 'Period tracking', stage: 'menstrual-cycle',
    fill: (p) => pickFirstOfMonth(p),
    gone: [/main focus/i],
  },
  {
    // The date is optional for contraception (an IUD or implant can stop periods).
    choice: 'Contraception', stage: 'contraception',
  },
  {
    choice: 'Trying to conceive', stage: 'conception',
    fill: async (p) => {
      await p.getByRole('combobox', { name: 'How long have you been trying?' }).click();
      await p.getByRole('option', { name: '1-3 months' }).click();
      await pickFirstOfMonth(p);
    },
    gone: [/fertility treatments\?/i],
  },
  { choice: 'IVF or fertility treatment', stage: 'ivf' },
  {
    choice: 'Pregnancy', stage: 'pregnancy',
    fill: async (p) => {
      await p.getByRole('tab', { name: 'Current Week' }).click();
      await p.getByPlaceholder('Enter week (1-42)').fill('20');
    },
    gone: [/first pregnancy/i, /complications/i],
  },
  {
    choice: 'After birth', stage: 'postpartum',
    fill: (p) => pickFirstOfMonth(p),
    gone: [/focus on/i],
  },
  {
    choice: 'Menopause or after menopause', stage: 'menopause',
    fill: async (p) => {
      await p.getByLabel("I don't remember").click();
      await p.getByLabel('Hot flashes').click();
    },
    gone: [/HRT/],
  },
];

for (const c of CASES) {
  test(`onboarding: ${c.choice}`, async ({ page, consoleErrors }) => {
    const api = await mockAccount(page, 'menstrual-cycle');
    await page.goto('/welcome');
    await page.getByRole('button', { name: /Answer a few setup questions/ }).click();
    await page.getByRole('button', { name: 'Skip for now' }).click();
    await page.getByText(c.choice, { exact: true }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    if (c.stage !== 'pre-menstrual' && c.stage !== 'ivf') {
      const finish = page.getByRole('button', { name: 'Finish Setup' });
      await expect(finish).toBeVisible();
      for (const q of c.gone ?? []) await expect(page.getByText(q)).toHaveCount(0);
      if (c.fill) {
        await expect(finish).toBeDisabled();
        await c.fill(page);
      }
      await expect(finish).toBeEnabled();
      await finish.click();
    }

    await expect(page.getByRole('heading', { name: "You're set up" })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Go to Home' })).toBeEnabled();
    expect(api.tables.profiles[0].life_stage).toBe(c.stage);
    expect(api.unhandled).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
}
