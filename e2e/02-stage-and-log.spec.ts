import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { test, expect, apiDb, currentUserId, localDate } from './helpers';

// Flows 3 and 4, run in order on one known life stage:
//   a) Me -> Life stage: switch to "Period tracking" (or "Menopause" if the
//      account already tracks periods) and see Home follow it;
//   b) on that stage, log a mood and a symptom in Home's Log sheet, check
//      they were stored, and remove them again;
//   c) switch back to the original stage.
// The filled button is not the Log sheet in every stage (pregnancy from
// week 28 shows "Count kicks", with a quiet "Log today" link under it),
// which is why (b) runs on the stage (a) chose.
//
// afterAll puts back the life stage and today's log row exactly as they
// were (the row is deleted if there was none). Other tools sometimes use
// this account at the same moment, so the group gets one retry.

test.describe.configure({ mode: 'serial', retries: 1 });

type Signal = { id: string; mood: string[] | null; symptoms: string[] | null };

let userId = '';
let originalStage: string | null = null; // stored value, e.g. 'pregnancy'
let originalLabel = '';                  // shown label, e.g. 'Pregnancy'
let target = '';
let targetValue = '';
let today = '';
let rowBefore: Signal | null | undefined; // undefined = not read yet

// ---- life stage -----------------------------------------------------------

async function readStage(request: APIRequestContext): Promise<string | null> {
  const rows = await apiDb<{ life_stage: string | null }>(request, {
    table: 'profiles', operation: 'select', selectColumns: 'life_stage',
    filters: [['id', 'eq', userId]], isMaybeSingle: true,
  });
  return rows[0]?.life_stage ?? null;
}

/**
 * Open Me -> Life stage and wait for the stored stage to load. Before it
 * arrives the picker shows a default; a tap in that window was undone by
 * the late load (fixed in Settings.tsx, stagePicked).
 */
async function openStagePicker(page: Page) {
  const loaded = page.waitForResponse((r) => r.url().includes('/api/db')
    && (r.request().postData() ?? '').includes('"table":"profiles"')
    && (r.request().postData() ?? '').includes('"selectColumns":"life_stage, full_name"'));
  // Already on the page, goto would only change the hash and load nothing.
  if (page.url().includes('/dashboard/settings')) await page.goto('about:blank');
  await page.goto('/dashboard/settings#life-stage');
  expect((await loaded).ok()).toBeTruthy();
}

async function pickStage(page: Page, label: string) {
  await openStagePicker(page);
  const radio = page.getByRole('radio', { name: label, exact: true });
  await expect(radio).toBeVisible();
  const saved = page.waitForResponse((r) => r.url().includes('/api/db')
    && (r.request().postData() ?? '').includes('"life_stage"') && (r.request().postData() ?? '').includes('"operation":"update"'));
  await radio.click();
  expect((await saved).ok()).toBeTruthy();
  await expect(page.getByText('Your life stage has been updated.').first()).toBeVisible();
  await expect(radio).toBeChecked();
}

async function expectHomeStage(page: Page, label: string) {
  await page.goto('/dashboard');
  await expect(page.getByRole('link', { name: `Change life stage (now ${label})` })).toBeVisible();
}

// ---- today's log ----------------------------------------------------------

async function readRow(request: APIRequestContext): Promise<Signal | null> {
  const rows = await apiDb<Signal>(request, {
    table: 'daily_health_signals', operation: 'select',
    filters: [['user_id', 'eq', userId], ['signal_date', 'eq', today]], isMaybeSingle: true,
  });
  return rows[0] ?? null;
}

async function openLogSheet(page: Page): Promise<Locator> {
  await page.goto('/dashboard');
  await page.getByRole('button', { name: /^Log (today|symptoms)$/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Log today' });
  await expect(sheet).toBeVisible();
  // Idea 4: "Log today" opens the one-tap tiles first; mood and symptoms
  // are in the full form behind "Add more detail or a note".
  const more = sheet.getByRole('button', { name: 'Add more detail or a note' });
  if (await more.isVisible()) {
    await more.click();
    await expect(page.getByRole('button', { name: 'Add more detail or a note' })).toHaveCount(0);
    await expect(sheet.getByText('How are you feeling?', { exact: true })).toBeVisible();
  }
  return sheet;
}

// The mood and symptom tap targets sit in the innermost block that holds
// their field label (the `has` locator must be page-rooted, not sheet-rooted).
const field = (sheet: Locator, label: string) =>
  sheet.locator('div', { has: sheet.page().getByText(label, { exact: true }) }).last().getByRole('button');
const moodButtons = (sheet: Locator) => field(sheet, 'How are you feeling?');
const symptomButtons = (sheet: Locator) => field(sheet, 'Symptoms');

/** aria-pressed where the build has it; older builds only show the selected style. */
async function isSelected(button: Locator): Promise<boolean> {
  const pressed = await button.getAttribute('aria-pressed');
  if (pressed !== null) return pressed === 'true';
  return /\bbg-primary\/10\b/.test((await button.getAttribute('class')) ?? '');
}

async function firstUnselected(buttons: Locator): Promise<{ index: number; name: string }> {
  const all = await buttons.all();
  for (let index = 0; index < all.length; index++) {
    if (!(await isSelected(all[index]))) return { index, name: (await all[index].innerText()).trim() };
  }
  throw new Error('every option is already selected');
}

async function save(page: Page, sheet: Locator) {
  const saved = page.waitForResponse((r) => r.url().includes('/api/db')
    && (r.request().postData() ?? '').includes('"operation":"upsert"'));
  await sheet.getByRole('button', { name: /^Save today's log$|^Saved — tap to update$/ }).click();
  expect((await saved).ok()).toBeTruthy();
  await expect(sheet.getByRole('button', { name: 'Saved — tap to update' })).toBeVisible();
}

// ---- setup / cleanup ------------------------------------------------------

test.beforeAll(async ({ request }) => {
  userId = await currentUserId(request);
  originalStage = await readStage(request);
});

test.afterAll(async ({ request }) => {
  if (!userId) return;
  // Today's log row back to how it was.
  if (rowBefore !== undefined) {
    const now = await readRow(request);
    if (now && rowBefore === null) {
      await apiDb(request, { table: 'daily_health_signals', operation: 'delete', filters: [['id', 'eq', now.id]] });
    } else if (now && rowBefore) {
      await apiDb(request, {
        table: 'daily_health_signals', operation: 'update',
        updateData: { mood: rowBefore.mood, symptoms: rowBefore.symptoms }, filters: [['id', 'eq', now.id]],
      });
    }
    const restored = await readRow(request);
    expect(restored && { mood: restored.mood, symptoms: restored.symptoms })
      .toEqual(rowBefore && { mood: rowBefore.mood, symptoms: rowBefore.symptoms });
  }
  // Life stage back, but only if it is still the one this test set: when
  // another tool changed it in the meantime, that newer choice is kept.
  if (originalStage !== null && targetValue && (await readStage(request)) === targetValue) {
    await apiDb(request, {
      table: 'profiles', operation: 'update', updateData: { life_stage: originalStage },
      filters: [['id', 'eq', userId]],
    });
  }
});

// ---- tests ----------------------------------------------------------------

test('switch life stage: Home follows', async ({ page }) => {
  await openStagePicker(page);
  const checked = page.getByRole('radio', { checked: true });
  await expect(checked).toHaveCount(1);
  originalLabel = (await page.locator(`label[for="${await checked.getAttribute('id')}"]`).innerText()).trim();
  target = originalLabel === 'Period tracking' ? 'Menopause' : 'Period tracking';
  targetValue = target === 'Menopause' ? 'menopause' : 'menstrual-cycle';

  await pickStage(page, target);
  expect(await readStage(page.request)).toBe(targetValue);
  await expectHomeStage(page, target);
});

test('log a mood and a symptom, then remove them', async ({ page }) => {
  await page.goto('/dashboard');
  today = await localDate(page);
  rowBefore = await readRow(page.request);

  // Log.
  let sheet = await openLogSheet(page);
  await expect(moodButtons(sheet).first()).toBeVisible();
  const mood = await firstUnselected(moodButtons(sheet));
  const symptom = await firstUnselected(symptomButtons(sheet));
  await moodButtons(sheet).nth(mood.index).click();
  await symptomButtons(sheet).nth(symptom.index).click();
  await expect.poll(() => isSelected(moodButtons(sheet).nth(mood.index))).toBe(true);
  await save(page, sheet);

  const logged = await readRow(page.request);
  expect(logged?.symptoms ?? []).toContain(symptom.name);
  expect((logged?.mood ?? []).length).toBe((rowBefore?.mood ?? []).length + 1);

  // Reopen (loads from the server again) and remove both.
  sheet = await openLogSheet(page);
  const moodAgain = moodButtons(sheet).nth(mood.index);
  const symptomAgain = symptomButtons(sheet).nth(symptom.index);
  await expect(symptomAgain).toHaveText(symptom.name);
  await expect.poll(() => isSelected(symptomAgain)).toBe(true);
  await expect.poll(() => isSelected(moodAgain)).toBe(true);
  await moodAgain.click();
  await symptomAgain.click();
  await save(page, sheet);

  const after = await readRow(page.request);
  expect(after?.symptoms ?? []).not.toContain(symptom.name);
  expect(after?.mood ?? []).toEqual(rowBefore?.mood ?? []);
});

test('switch back to the original life stage', async ({ page }) => {
  await pickStage(page, originalLabel);
  await expectHomeStage(page, originalLabel);
});
