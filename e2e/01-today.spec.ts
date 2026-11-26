import { test, expect } from './helpers';

// Flow 2 — Today (Home) loads for a logged-in patient, with no console errors.

test('Today loads with no console errors', async ({ page, consoleErrors }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard$/);
  // The greeting (classic Home) or the stage header's one big fact (idea 4).
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Today' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Change life stage/ })).toBeVisible();
  // Let the page's own data calls settle before judging the console.
  await page.waitForLoadState('networkidle');
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});
