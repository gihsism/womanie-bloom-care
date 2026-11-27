import type { Page } from '@playwright/test';
import { test, expect, mockAccount, STAGES } from './fixtures';
import { CANNED_ANSWER } from './mock-api';

// The key patient journeys, once per life stage, against the production
// build with the fake API (see mock-api.ts). Each test starts from a fresh
// copy of the fixtures, so tests are independent and run in parallel.

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });

async function goHome(page: Page) {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening), Mia$/ })).toBeVisible();
}

for (const stage of STAGES) {
  test.describe(`${stage.label} (${stage.key})`, () => {
    test('Home: log today and tick a medicine', async ({ page, consoleErrors }) => {
      const api = await mockAccount(page, stage.key);
      await goHome(page);
      await expect(page.getByRole('link', { name: `Change life stage (now ${stage.label})` })).toBeVisible();

      // Every stage keeps one tap from Home into today's log.
      await page.getByRole('button', { name: /^(Log today|Log symptoms|Log medication)$/ }).first().click();
      const sheet = page.getByRole('dialog', { name: /^(Log today|Medicines today)$/ });
      await expect(sheet).toBeVisible();

      const mood = sheet.locator('button[aria-pressed]').first();
      await expect(mood).toHaveAttribute('aria-pressed', 'false');
      await mood.click();
      await expect(mood).toHaveAttribute('aria-pressed', 'true');
      await sheet.getByRole('button', { name: "Save today's log" }).click();
      await expect(sheet.getByRole('button', { name: 'Saved — tap to update' })).toBeVisible();
      expect(api.tables.daily_health_signals, 'one row for today').toHaveLength(1);

      // Medicines: Vitamin D, 0 of 1 -> Taken -> 1 of 1, and a dose row.
      const med = sheet.getByRole('listitem').filter({ hasText: 'Vitamin D' }).filter({ has: page.getByRole('button', { name: 'Taken' }) });
      await expect(med).toContainText('0 of 1 today');
      await med.getByRole('button', { name: 'Taken' }).click();
      await expect(med).toContainText('1 of 1 today');
      await expect(med.getByRole('button', { name: 'Undo last' })).toBeVisible();
      expect(api.tables.life_events.filter((e) => e.kind === 'med_dose')).toHaveLength(1);

      expect(api.unhandled).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });

    test('Records: open a document', async ({ page, consoleErrors }) => {
      const api = await mockAccount(page, stage.key);
      await goHome(page);
      await nav(page).getByRole('link', { name: 'Records', exact: true }).click();
      await expect(page).toHaveURL(/\/dashboard\/medical-history/);
      await expect(page.getByRole('heading', { level: 1, name: 'Records' })).toBeVisible();
      const tab = page.getByRole('tab', { name: 'Documents' });
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');

      const panel = page.getByRole('tabpanel', { name: 'Documents' });
      await panel.getByRole('button', { name: /Blood test - iron and vitamin D/ }).click();
      await expect(panel.getByRole('button', { name: 'Ask about this' })).toBeVisible();
      await expect(panel.getByText('Ferritin').first()).toBeVisible();

      // Print / PDF opens the document's print view in a new tab.
      const popup = page.waitForEvent('popup');
      await panel.getByRole('button', { name: 'Print / PDF' }).click();
      const print = await popup;
      await expect(print).toHaveURL(/\/dashboard\/doc\/doc-1\/print$/);
      await expect(print.getByText('Ferritin').first()).toBeVisible();

      expect(api.unhandled).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });

    test('Ask AI: a canned streamed answer', async ({ page, consoleErrors }) => {
      const api = await mockAccount(page, stage.key);
      await goHome(page);
      await nav(page).getByRole('link', { name: 'Ask AI', exact: true }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Ask AI' })).toBeVisible();
      const box = page.getByRole('textbox', { name: 'Your question' });
      const send = page.getByRole('button', { name: 'Send' });
      await expect(send).toBeDisabled();
      await box.fill('Why does water help with headaches?');
      await send.click();
      await expect(page.getByText('Why does water help with headaches?', { exact: true })).toBeVisible();
      await expect(page.getByText(CANNED_ANSWER)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Copy this reply' })).toHaveCount(1);

      expect(api.calls).toContain('POST /api/ai-doctor-chat');
      expect(api.unhandled).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });

    test('Visits: open the next visit and print its prep sheet', async ({ page, consoleErrors }) => {
      const api = await mockAccount(page, stage.key);
      await page.addInitScript(() => {
        (window as unknown as { __printed: number }).__printed = 0;
        window.print = () => { (window as unknown as { __printed: number }).__printed++; };
      });
      await goHome(page);
      await nav(page).getByRole('link', { name: 'Visits', exact: true }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Visits' })).toBeVisible();
      const next = page.getByRole('region', { name: /next visit/i });
      await expect(next).toContainText('Anna Keller');

      await next.getByTestId('visit-prep-sheet-link').click();
      await expect(page).toHaveURL(/\/dashboard\/appointments\/apt-1\/prep$/);
      const sheet = page.getByTestId('visit-prep-sheet');
      await expect(sheet).toContainText('Dr. Anna Keller');
      await expect(sheet).toContainText('Vitamin D');

      await page.getByTestId('visit-prep-print').click();
      await expect.poll(() => page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
      // The toolbar is not on paper.
      await page.emulateMedia({ media: 'print' });
      await expect(page.getByTestId('visit-prep-print')).toBeHidden();
      await expect(sheet).toBeVisible();

      expect(api.unhandled).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });

    test('Me: settings and profile', async ({ page, consoleErrors }) => {
      const api = await mockAccount(page, stage.key);
      await goHome(page);
      await nav(page).getByRole('link', { name: 'Me', exact: true }).click();
      await expect(page).toHaveURL(/\/dashboard\/settings/);
      await expect(page.getByRole('heading', { level: 1, name: 'Me' })).toBeVisible();
      await page.getByTestId('me-row-profile').click();
      await expect(page).toHaveURL(/#profile$/);
      await expect(page.getByText('e2e-patient@womanie.test').first()).toBeVisible();

      // The life-stage picker shows the stored stage as the checked one.
      await page.goto('/dashboard/settings#life-stage');
      await expect(page.getByRole('radio', { name: stage.label, exact: true })).toBeChecked();

      expect(api.unhandled).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  });
}
