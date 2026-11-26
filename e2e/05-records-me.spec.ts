import { test, expect, TEST_EMAIL } from './helpers';

// Flows 6 and 7 — the Documents list (Records -> Documents) and the Me
// profile open from the bottom navigation / Me menu. Read-only.

test('open the Documents list', async ({ page }) => {
  await page.goto('/dashboard');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Records', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/medical-history/);
  await expect(page.getByRole('heading', { level: 1, name: 'Records' })).toBeVisible();
  const tab = page.getByRole('tab', { name: 'Documents' });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Documents' })).toBeVisible();
  // Either the list (with an Upload button) or the empty state with its own.
  await expect(page.getByRole('button', { name: /Upload/ }).first()).toBeVisible();
});

test('open the Me profile', async ({ page }) => {
  await page.goto('/dashboard');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Me', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/settings/);
  await expect(page.getByRole('heading', { level: 1, name: 'Me' })).toBeVisible();
  await page.getByTestId('me-row-profile').click();
  await expect(page).toHaveURL(/#profile$/);
  await expect(page.getByText(TEST_EMAIL).first()).toBeVisible();
});
