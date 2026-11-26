import type { APIRequestContext } from '@playwright/test';
import { test, expect, apiDb, currentUserId } from './helpers';

// Flows added in the 2026-11 feature round (no chat calls):
//   a) booking: Find a Doctor -> doctor profile -> book a next free time
//      (first try answers 409 "taken") -> "Your visit is booked" ->
//      Notifications shows "Booking confirmed". Every doctor/booking API is
//      mocked in the browser (there are no verified doctors yet), so it
//      changes no data.
//   b) contraction timer (pregnancy week 36+): with a fake clock, short
//      contractions give no banner, 3 at the 5-1-1 pace say "building",
//      ~52 minutes of them show "time to call"; one saved while offline is
//      marked "not synced yet" and syncs when back online.
//   c) menopause: "Questions for your doctor about HRT" -> Add to
//      Questions to bring (no booked visit -> unscheduled list) -> they are
//      on the printable visit summary; adding again adds nothing.
//
// (b) and (c) change the stage / due date: afterAll puts profiles.life_stage
// and pregnancy_due_date back and deletes every row the tests created.

test.describe.configure({ mode: 'serial', retries: 1 });

type Profile = { life_stage: string | null; pregnancy_due_date: string | null };

let userId = '';
let original: Profile | null = null;
let contractionsBefore = new Set<string>();
let hadUnscheduled = true;

async function readProfile(request: APIRequestContext): Promise<Profile> {
  const rows = await apiDb<Profile>(request, {
    table: 'profiles', operation: 'select', selectColumns: 'life_stage, pregnancy_due_date',
    filters: [['id', 'eq', userId]], isMaybeSingle: true,
  });
  return rows[0] ?? { life_stage: null, pregnancy_due_date: null };
}

async function setProfile(request: APIRequestContext, values: Partial<Profile>) {
  await apiDb(request, { table: 'profiles', operation: 'update', updateData: values, filters: [['id', 'eq', userId]] });
}

async function contractionIds(request: APIRequestContext): Promise<string[]> {
  const rows = await apiDb<{ id: string }>(request, {
    table: 'life_events', operation: 'select', selectColumns: 'id',
    filters: [['user_id', 'eq', userId], ['kind', 'eq', 'contraction']],
  });
  return rows.map((r) => r.id);
}

test.beforeAll(async ({ request }) => {
  userId = await currentUserId(request);
  original = await readProfile(request);
  contractionsBefore = new Set(await contractionIds(request));
  const unscheduled = await apiDb(request, {
    table: 'visit_questions', operation: 'select', selectColumns: 'id',
    filters: [['user_id', 'eq', userId], ['appointment_id', 'eq', 'unscheduled']],
  });
  hadUnscheduled = unscheduled.length > 0;
});

test.afterAll(async ({ request }) => {
  if (!userId) return;
  for (const id of await contractionIds(request)) {
    if (!contractionsBefore.has(id)) {
      await apiDb(request, { table: 'life_events', operation: 'delete', filters: [['user_id', 'eq', userId], ['id', 'eq', id]] });
    }
  }
  if (!hadUnscheduled) {
    await apiDb(request, {
      table: 'visit_questions', operation: 'delete',
      filters: [['user_id', 'eq', userId], ['appointment_id', 'eq', 'unscheduled']],
    });
  }
  if (original) await setProfile(request, original);
});

test('book a visit with a doctor (mocked API) and see the booking confirmed', async ({ page, consoleErrors }) => {
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const doctor = {
    user_id: 'e2e-doctor', full_name: 'Anna Muster', title: 'Dr. med.', specialties: ['Gynaecology'],
    years_experience: 12, bio: 'Test doctor.', avatar_url: null, rating: null, review_count: null,
    languages: ['German'], credentials: [], practice_address: 'Bahnhofstrasse 1, 8001 Zürich', is_verified: true,
    consultation_settings: { consultation_price: 0, currency: 'CHF', consultation_duration: 30, video_enabled: true, is_available: true, visit_types: ['in_person', 'video'] },
    schedule: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ day_of_week: d, start_time: '08:00', end_time: '18:00', is_active: true })),
  };
  let bookCalls = 0;
  let bookedAt: string | null = null;
  await page.route('**/api/doctors/list*', (r) => r.fulfill({ json: { doctors: [doctor] } }));
  await page.route('**/api/doctors/profile*', (r) => r.fulfill({
    json: { doctor, next_slots: [2, 3, 4].map((n) => `${day(n)}T09:00:00.000Z`), time_zone: 'Europe/Zurich' },
  }));
  await page.route('**/api/doctors/availability*', (r) => r.fulfill({ json: { busy: [] } }));
  await page.route('**/api/appointments/book', async (r) => {
    bookCalls++;
    if (bookCalls === 1) return r.fulfill({ status: 409, json: { error: 'taken', code: 'slot_taken' } });
    const body = r.request().postDataJSON() as { scheduled_at: string; consultation_type: string };
    bookedAt = body.scheduled_at;
    return r.fulfill({ json: { appointment: { id: 'e2e-apt', scheduled_at: body.scheduled_at, consultation_type: body.consultation_type } } });
  });
  await page.route('**/api/me/appointments*', (r) => r.fulfill({
    json: {
      appointments: bookedAt ? [{
        id: 'e2e-apt', scheduled_at: bookedAt, duration: 30, status: 'scheduled', consultation_type: 'in_person',
        notes: null, doctor_id: 'e2e-doctor', doctor_name: 'Anna Muster', doctor_title: 'Dr. med.',
        booked_at: new Date().toISOString(), practice_address: doctor.practice_address,
      }] : [],
    },
  }));

  await page.goto('/find-doctor');
  await page.getByRole('link', { name: /View profile/ }).first().click();
  await expect(page).toHaveURL(/\/doctors\/e2e-doctor$/);
  await expect(page.getByText('Next free times')).toBeVisible();
  await page.getByRole('button', { name: /, 10:00$/ }).first().click();

  const dialog = page.getByTestId('booking-dialog');
  const confirm = dialog.getByRole('button', { name: 'Confirm booking' });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  // 409: the time was taken a moment ago; nothing booked, pick another.
  await expect(dialog.getByText('Someone booked that time a moment ago.', { exact: false })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Pick a time to continue' })).toBeDisabled();
  await dialog.getByRole('radiogroup', { name: 'Free times' }).getByRole('radio').nth(2).click();
  await confirm.click();
  await expect(dialog.getByTestId('booking-confirmed')).toBeVisible();
  await expect(dialog.getByText('Your visit is booked')).toBeVisible();
  expect(bookCalls).toBe(2);

  await page.goto('/dashboard/notifications');
  const card = page.getByTestId('booking-confirmations');
  await expect(card.getByText('Booking confirmed')).toBeVisible();
  await expect(card.getByText('Dr. med. Anna Muster')).toBeVisible();
  // The mocked 409 is logged by the browser as a failed resource load.
  expect(consoleErrors.filter((e) => !/status of 409/.test(e))).toEqual([]);
});

test('contraction timer: 5-1-1 banner logic and offline save', async ({ page, context, request }) => {
  test.setTimeout(180_000);
  const due = new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10); // week 37
  await setProfile(request, { life_stage: 'pregnancy', pregnancy_due_date: due });

  const S = 1000;
  const M = 60 * S;
  await page.clock.install();
  await page.goto('/dashboard/stage#contraction-timer');
  const timer = page.locator('#contraction-timer');
  await expect(timer.getByText('Contraction timer')).toBeVisible({ timeout: 30_000 });
  const start = timer.getByRole('button', { name: 'Start a contraction' });
  const stop = timer.getByRole('button', { name: 'Stop', exact: true });
  const status = timer.locator('[role=status]');
  const one = async (durationMs: number, restMs: number) => {
    await start.click();
    await page.clock.fastForward(durationMs);
    await stop.click();
    await expect(start).toBeVisible();
    await page.clock.fastForward(restMs);
  };

  // Short ones (20 s every 2 min): nothing to say yet.
  for (let i = 0; i < 3; i++) await one(20 * S, 100 * S);
  await expect(status).toHaveCount(0);

  // A gap, then 3 at the 5-1-1 pace (65 s, every 4 min): "building".
  await page.clock.fastForward(12 * M);
  for (let i = 0; i < 3; i++) await one(65 * S, 4 * M - 65 * S);
  await expect(status).toContainText('Your last 3 contractions fit the 5-1-1 pace');

  // Held for ~52 minutes: time to call.
  for (let i = 0; i < 11; i++) await one(65 * S, 4 * M - 65 * S);
  await expect(status).toContainText('5-1-1 rule: time to call your midwife or hospital.');

  // Offline: kept on the phone, marked, synced when back online.
  await context.setOffline(true);
  await one(70 * S, 10 * S);
  await expect(timer.getByLabel('Not synced yet')).toHaveCount(1);
  await expect(timer.getByText('1 saved on this phone; they sync when you are back online.')).toBeVisible();
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(timer.getByLabel('Not synced yet')).toHaveCount(0, { timeout: 20_000 });
  const created = (await contractionIds(request)).filter((id) => !contractionsBefore.has(id));
  expect(created).toHaveLength(18);

  // Clear history removes them again.
  page.once('dialog', (d) => d.accept());
  await timer.getByRole('button', { name: 'Clear history' }).click();
  await expect(timer.getByText('No contractions timed yet')).toBeVisible({ timeout: 30_000 });
});

test('menopause: HRT questions go to Questions to bring and the visit summary', async ({ page, request }) => {
  await setProfile(request, { life_stage: 'menopause' });
  await page.goto('/dashboard/stage#symptom-trends');
  const trends = page.locator('#symptom-trends');
  await expect(trends.getByText('Your symptoms over time')).toBeVisible({ timeout: 30_000 });
  const questions = trends.locator('ol li');
  await expect(questions.first()).toBeVisible();
  const first = (await questions.first().innerText()).trim();

  const add = trends.getByRole('button', { name: 'Add to Questions to bring' });
  await add.click();
  await expect(trends.getByText(/Added \d+ questions? to Questions to bring|already in your Questions to bring/)).toBeVisible();
  await add.click();
  await expect(trends.getByText('These questions are already in your Questions to bring.')).toBeVisible();

  await trends.getByRole('link', { name: 'Visit summary to print' }).click();
  await expect(page).toHaveURL(/\/dashboard\/visit-summary\/print$/);
  await expect(page.getByText(first, { exact: true }).first()).toBeVisible();
});
