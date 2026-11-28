import { test, expect, mockDoctor } from './fixtures';

// Doctor side (round 12): the fake doctor in fixtures/doctor.json with
// Lena (approved, shared her chart) and Sara (still waiting for her
// approval). Lena's TSH was high on an OLD report she uploaded 5 days ago
// and normal on the newer test, so every screen must count it as in range
// (shared lab-flag rule, latest reading per test): 1 result out of range
// (ferritin) on the day list, the Summary and the Results tab alike.

test('dashboard: the day, the patient list, appointments and opening hours', async ({ page, consoleErrors }) => {
  const api = await mockDoctor(page);
  await page.goto('/doctor/dashboard');

  const day = page.getByTestId('doctor-day-schedule');
  const lena = day.getByRole('button', { name: /Lena Muster/ });
  await expect(lena).toContainText('New: 1 result out of range, 2 new documents');
  await expect(lena).toContainText('1 open question');
  await expect(lena).toContainText(/^\d{2}:\d{2}/); // 24-hour time
  await expect(day.getByText('Sara Beispiel')).toBeVisible();
  await expect(day.getByText(/waiting for her approval/)).toBeVisible();
  await expect(page.getByText('Waiting for the patient to approve')).toBeVisible();

  await page.getByRole('tab', { name: 'Appointments' }).click();
  // Only Lena's chart can open; Sara's visit says when it will.
  await expect(page.getByRole('button', { name: 'Open chart' })).toHaveCount(1);
  await expect(page.getByText('Chart opens once she approves')).toBeVisible();

  await page.getByRole('tab', { name: 'Profile & settings' }).click();
  // Saved hours are Monday and Wednesday only: the other weekdays must
  // not show as ticked (they used to keep the Mon-Fri defaults).
  await expect(page.getByRole('button', { name: 'Work on Monday' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Work on Wednesday' })).toHaveAttribute('aria-pressed', 'true');
  for (const d of ['Tuesday', 'Thursday', 'Friday']) {
    await expect(page.getByRole('button', { name: `Work on ${d}` })).toHaveAttribute('aria-pressed', 'false');
  }
  // No sideways scrolling on a phone.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  expect(api.unhandled).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('open a patient who shared: Before the visit, the same flagged count everywhere, trends', async ({ page, consoleErrors }) => {
  const api = await mockDoctor(page);
  await page.goto('/doctor/dashboard');
  await page.getByTestId('doctor-day-schedule').getByRole('button', { name: /Lena Muster/ }).click();
  await expect(page).toHaveURL(/\/doctor\/patient\/pat-1/);

  const brief = page.locator('[aria-labelledby="visit-brief-title"]');
  await expect(brief).toContainText(/Next visit \w{3} \d{1,2} \w{3}, \d{2}:\d{2}/);
  await expect(brief).toContainText('Iron 100 mg');
  await expect(brief).toContainText('Low mood on 3 of 4 logged days');
  await expect(page.getByTestId('brief-results')).toContainText('Ferritin');
  await expect(page.getByTestId('brief-questions')).toHaveText('How long should I take iron?');

  // One result out of range (ferritin), not the superseded TSH.
  await expect(page.getByRole('button', { name: /^1 result out of range/ })).toBeVisible();
  await expect(page.getByText('Result · high on an older test, re-tested since')).toBeVisible();

  await page.getByRole('tab', { name: 'Results' }).click();
  await expect(page.getByText('Latest reading of each test, most urgent first.')).toBeVisible();

  await page.getByRole('tab', { name: 'Trends' }).click();
  await expect(page.getByText('Cycles 28 days, regular (last 2).')).toBeVisible();
  await expect(page.getByText(/^Periods 5–6 days/)).toBeVisible();
  expect(api.calls).toContain('GET /api/doctors/patient-trends');

  expect(api.unhandled).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('write a note and delete it with the in-app dialog', async ({ page, consoleErrors }) => {
  const api = await mockDoctor(page);
  const browserDialogs: string[] = [];
  page.on('dialog', (d) => { browserDialogs.push(d.type()); void d.dismiss(); });
  await page.goto('/doctor/patient/pat-1');

  await page.getByRole('button', { name: 'Write a note' }).click();
  await page.getByLabel('Title').fill('Iron follow-up');
  await page.getByLabel('Note', { exact: true }).fill('Re-check ferritin in 3 months.');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.getByRole('heading', { name: 'Iron follow-up' })).toBeVisible();
  expect(api.tables.doctor_notes.map((n) => n.title)).toContain('Iron follow-up');

  await page.getByRole('button', { name: 'Delete note: Iron follow-up' }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText('Delete this note?');
  await confirm.getByRole('button', { name: 'Keep note' }).click();
  await expect(page.getByRole('heading', { name: 'Iron follow-up' })).toBeVisible();

  await page.getByRole('button', { name: 'Delete note: Iron follow-up' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete note' }).click();
  await expect(page.getByRole('heading', { name: 'Iron follow-up' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'First visit' })).toBeVisible();
  expect(api.tables.doctor_notes.map((n) => n.title)).toEqual(['First visit']);
  expect(browserDialogs).toEqual([]);

  expect(api.unhandled).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('a doctor whose role was revoked sees no patient', async ({ page, consoleErrors }) => {
  const api = await mockDoctor(page, { revoked: true });
  await page.goto('/doctor/dashboard');
  await expect(page).toHaveURL(/\/auth\/doctor-login/);
  await expect(page.getByText('Lena Muster')).toHaveCount(0);

  await page.goto('/doctor/patient/pat-1');
  await expect(page).toHaveURL(/\/auth\/doctor-login/);
  await expect(page.getByText('Lena Muster')).toHaveCount(0);
  await expect(page.getByText('Ferritin')).toHaveCount(0);
  // The chart is never even asked for.
  expect(api.calls).not.toContain('GET /api/doctors/patient');

  expect(api.unhandled).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
