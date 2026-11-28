import type { Page } from '@playwright/test';
import { test, expect, mockAccount, accountFor, resolveTokens } from './fixtures';

// Round 10 (2026-11-28): polish. A result the lab marked critical is the
// first Today row; the rest of a long list sits behind "N more"; Records
// lists flagged results once; a visit in progress stays "Your next visit"
// on Visits (as Home's "Visit today" row says) instead of moving to Past.

const today = (page: Page) => page.getByRole('region', { name: 'Today', exact: true });

const critical = {
  id: 'res-9', user_id: 'e2e-user-1', document_id: 'doc-1', data_type: 'lab_result', title: 'Potassium',
  value: '6.4', unit: 'mmol/L', reference_range: '3.5-5.1', status: 'critical', date_recorded: '{{day:-1}}', created_at: '{{at:-1}}',
};

test('a critical result tops Today; Records lists the flagged results once, in plain words', async ({ page, consoleErrors }) => {
  const { tables } = accountFor('menopause');
  const base = await mockAccount(page, 'menopause', {
    tables: { current_extracted_data: [...tables.current_extracted_data, resolveTokens(critical)] },
  });

  await page.goto('/dashboard');
  const first = today(page).getByRole('listitem').first();
  await expect(first).toHaveText('Potassium marked urgent by the lab: call your doctor');
  await expect(today(page).getByRole('button', { name: '2 results to talk to your doctor about' })).toBeVisible();

  await page.goto('/dashboard/medical-history');
  await expect(page.getByText('Talk to your doctor about')).toBeVisible();
  await expect(page.getByText('Results that need attention')).toHaveCount(0);
  await expect(page.getByText(/The lab marked this as urgent/)).toBeVisible();
  // 12 against a lower limit of 15 is 20% below (not "2%", the share of the range width).
  await expect(page.getByText('20% below').first()).toBeVisible();

  expect(base.unhandled).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('a visit that started a few minutes ago is still "Your next visit" on Visits', async ({ page, consoleErrors }) => {
  const { appointments } = accountFor('menstrual-cycle');
  const api = await mockAccount(page, 'menstrual-cycle', {
    appointments: [
      { ...appointments[0], id: 'apt-now', scheduled_at: new Date(Date.now() - 5 * 60_000).toISOString(), duration: 30 },
    ],
  });
  await page.goto('/dashboard');
  await expect(today(page).getByRole('button', { name: /^Visit today at / })).toBeVisible();

  await page.goto('/dashboard/appointments');
  await expect(page.getByText('Your next visit', { exact: true })).toBeVisible();
  await expect(page.getByText(/^Today · .* · now/)).toBeVisible();
  await expect(page.getByText('No visits yet.')).toHaveCount(0);

  expect(api.unhandled).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
