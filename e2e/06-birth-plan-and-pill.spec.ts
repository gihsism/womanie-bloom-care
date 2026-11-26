import type { APIRequestContext } from '@playwright/test';
import { test, expect, apiDb, currentUserId } from './helpers';

// Flows added in QA round 5 (no chat calls):
//   a) birth plan (pregnancy week 28+): tick a wish and add a note, wait
//      for "Saved", open "Print or save PDF" -> the sheet lists the wish
//      and the note, the due date, the footer; the toolbar is hidden on
//      paper (print media).
//   b) contraception: "Missed-pill steps for your pill" opens the sheet;
//      "Under 3 h" is a late pill (still protected, no extra protection),
//      "48 h or more" is missed for every pill type (extra protection and
//      at least two steps); "change pill type" closes it.
//
// afterAll puts back profiles.life_stage / pregnancy_due_date and the
// birth_plans row exactly as they were (deleted if there was none).

test.describe.configure({ mode: 'serial', retries: 1 });

type Profile = { life_stage: string | null; pregnancy_due_date: string | null };
type PlanRow = { plan: unknown; shared_with_doctor: boolean | null };

let userId = '';
let original: Profile | null = null;
let planBefore: PlanRow | null | undefined; // undefined = not read yet

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

async function readPlan(request: APIRequestContext): Promise<PlanRow | null> {
  const rows = await apiDb<PlanRow>(request, {
    table: 'birth_plans', operation: 'select', selectColumns: 'plan, shared_with_doctor',
    filters: [['user_id', 'eq', userId]], isMaybeSingle: true,
  });
  return rows[0] ?? null;
}

test.beforeAll(async ({ request }) => {
  userId = await currentUserId(request);
  original = await readProfile(request);
  planBefore = await readPlan(request);
});

test.afterAll(async ({ request }) => {
  if (!userId) return;
  if (planBefore === null) {
    await apiDb(request, { table: 'birth_plans', operation: 'delete', filters: [['user_id', 'eq', userId]] });
  } else if (planBefore) {
    await apiDb(request, {
      table: 'birth_plans', operation: 'update',
      updateData: { plan: JSON.stringify(planBefore.plan), shared_with_doctor: planBefore.shared_with_doctor === true },
      filters: [['user_id', 'eq', userId]],
    });
  }
  if (original) await setProfile(request, original);
});

test('birth plan: a wish and a note reach the printable sheet', async ({ page, request, consoleErrors }) => {
  const due = new Date(Date.now() + 56 * 86_400_000).toISOString().slice(0, 10); // week 32
  await setProfile(request, { life_stage: 'pregnancy', pregnancy_due_date: due });
  const note = `e2e note ${Date.now()}`;

  await page.goto('/dashboard/stage');
  const card = page.getByTestId('birth-plan-card');
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Feeding' }).click();
  const wish = card.locator('button[aria-pressed]').first();
  const wishText = (await wish.innerText()).trim();
  if ((await wish.getAttribute('aria-pressed')) !== 'true') await wish.click();
  await expect(wish).toHaveAttribute('aria-pressed', 'true');
  await card.getByRole('textbox', { name: 'Feeding: your own words' }).fill(note);
  await expect(card.getByText('Saved', { exact: true })).toBeVisible();

  await card.getByRole('button', { name: 'Print or save PDF' }).click();
  await expect(page).toHaveURL(/\/dashboard\/birth-plan\/print$/);
  const sheet = page.getByTestId('birth-plan-sheet');
  const feeding = sheet.locator('section[data-section="feeding"]');
  await expect(feeding.getByRole('listitem').filter({ hasText: wishText })).toBeVisible();
  await expect(feeding.getByText(note)).toBeVisible();
  await expect(sheet.getByText(/^Due /)).toBeVisible();
  await expect(sheet.getByText('These are my wishes for the birth', { exact: false })).toBeVisible();

  await expect(page.getByTestId('birth-plan-print')).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByTestId('birth-plan-print')).toBeHidden();
  await expect(feeding.getByText(note)).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('contraception: the missed-pill sheet tells a late pill from a missed one', async ({ page, request, consoleErrors }) => {
  await setProfile(request, { life_stage: 'contraception' });
  await page.goto('/dashboard/stage');
  const link = page.getByRole('button', { name: 'Missed-pill steps for your pill' });
  await expect(link).toBeVisible();
  await link.click();

  const sheet = page.getByTestId('missed-pill-guidance');
  await expect(sheet).toBeVisible();
  const box = await sheet.boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= page.viewportSize()!.width).toBeTruthy();
  const title = sheet.getByRole('heading');

  await sheet.getByRole('button', { name: 'Under 3 h', exact: true }).click();
  await expect(sheet.getByRole('button', { name: 'Under 3 h', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(title).toHaveText('Late, but you are still protected');
  await expect(sheet.getByText('Extra protection:')).toHaveCount(0);

  await sheet.getByRole('button', { name: '48 h or more', exact: true }).click();
  await expect(title).toHaveText(/missed/i);
  await expect(sheet.getByText('Extra protection:')).toBeVisible();
  expect(await sheet.getByRole('list').first().getByRole('listitem').count()).toBeGreaterThanOrEqual(2);
  await expect(sheet.getByText('If you are unsure, ask your pharmacist or doctor', { exact: false })).toBeVisible();

  await sheet.getByRole('button', { name: 'change pill type' }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('combobox', { name: 'Pill type' })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
