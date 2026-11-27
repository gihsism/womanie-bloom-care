import type { Page } from '@playwright/test';
import { test, expect, mockAccount, resolveTokens, STAGES } from './fixtures';
import { CANNED_ANSWER } from './mock-api';
import type { Row } from './mock-api';

// Journeys for the features added on 2026-11-27: prep sheet sections per
// stage, Ask AI "Ask my doctor about this" and "Print this chat", the baby
// weekly summary print page, and pregnancy check-ups "Mark done".

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });

/** window.print() is replaced by a counter (no print dialog in headless runs). */
async function stubPrint(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __printed: number }).__printed = 0;
    window.print = () => { (window as unknown as { __printed: number }).__printed++; };
  });
}
const printed = (page: Page) => page.evaluate(() => (window as unknown as { __printed: number }).__printed);

async function askOneQuestion(page: Page, question: string) {
  await page.goto('/dashboard');
  await nav(page).getByRole('link', { name: 'Ask AI', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ask AI' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Your question' }).fill(question);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(CANNED_ANSWER)).toBeVisible();
}

const MENOPAUSE = ['menopause', 'post-menopause'];

/** The question texts saved in a visit_questions row. */
const questionTexts = (row: Row) =>
  (JSON.parse(String(row.questions)) as Array<{ text: string; asked: boolean }>).map((q) => q.text);

for (const stage of STAGES) {
  test.describe(`${stage.label} (${stage.key})`, () => {
    test('Prep sheet: the sections for this stage', async ({ page, consoleErrors }) => {
      const api = await mockAccount(page, stage.key, {
        tables: {
          visit_questions: [
            { id: 'vq-1', user_id: 'e2e-user-1', appointment_id: 'apt-1', questions: JSON.stringify([{ id: 'q1', text: 'Should I take iron?', asked: false }]) },
          ],
        },
      });
      await page.goto('/dashboard/appointments/apt-1/prep');
      const sheet = page.getByTestId('visit-prep-sheet');
      await expect(sheet).toBeVisible();

      for (const s of ['stage', 'questions', 'medicines', 'results']) {
        await expect(sheet.locator(`[data-section="${s}"]`), `section ${s}`).toHaveCount(1);
      }
      await expect(sheet.locator('[data-section="questions"]')).toContainText('Should I take iron?');
      await expect(sheet.locator('[data-section="medicines"]')).toContainText('Vitamin D');
      // Ferritin 12 (range 15-150) is outside the range: it is on the list.
      await expect(sheet.locator('[data-section="results"]')).toContainText('Ferritin');
      // Stage-only blocks: the 4-week symptom diary (menopause) and the
      // cycles + ovulation tests table (trying to conceive).
      await expect(sheet.locator('[data-section="symptom-diary"]')).toHaveCount(MENOPAUSE.includes(stage.key) ? 1 : 0);
      await expect(sheet.locator('[data-section="ttc-cycles"]')).toHaveCount(stage.key === 'conception' ? 1 : 0);

      expect(api.unhandled).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  });
}

test.describe('Ask AI', () => {
  test('Ask my doctor about this: the question lands on the next visit and its prep sheet', async ({ page, consoleErrors }) => {
    const api = await mockAccount(page);
    const question = 'Why does water help with headaches?';
    await askOneQuestion(page, question);

    const ask = page.getByTestId('ask-doctor');
    await expect(ask).toHaveCount(1);
    await expect(ask).toHaveText('Ask my doctor about this');
    await ask.click();
    await expect(ask).toHaveText('In Questions to bring');
    await expect(ask).toBeDisabled();
    await expect(page.getByText('Added to Questions to bring').first()).toBeVisible();

    // Saved for the next booked visit (apt-1), not the unscheduled list.
    const rows = api.tables.visit_questions;
    expect(rows).toHaveLength(1);
    expect(rows[0].appointment_id).toBe('apt-1');
    expect(questionTexts(rows[0])).toEqual([question]);

    await page.goto('/dashboard/appointments/apt-1/prep');
    await expect(page.getByTestId('visit-prep-sheet').locator('[data-section="questions"]')).toContainText(question);

    expect(api.unhandled).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('Ask my doctor about this with no visit booked: kept for the next visit', async ({ page, consoleErrors }) => {
    const api = await mockAccount(page, 'menstrual-cycle', { appointments: [] });
    await askOneQuestion(page, 'Is a short cycle normal?');
    await page.getByTestId('ask-doctor').click();
    await expect(page.getByTestId('ask-doctor')).toHaveText('In Questions to bring');
    const rows = api.tables.visit_questions;
    expect(rows).toHaveLength(1);
    expect(rows[0].appointment_id).not.toBe('apt-1');
    expect(questionTexts(rows[0])).toEqual(['Is a short cycle normal?']);

    expect(api.unhandled).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('Print this chat: the chat on its own print page', async ({ page, consoleErrors }) => {
    const api = await mockAccount(page);
    await stubPrint(page);
    await askOneQuestion(page, 'Why does water help with headaches?');

    await page.getByRole('button', { name: 'More options' }).click();
    await page.getByRole('menuitem', { name: 'Print this chat' }).click();
    await expect(page).toHaveURL(/\/dashboard\/ai-doctor\/print$/);
    const sheet = page.getByTestId('chat-print-sheet');
    await expect(sheet.locator('[data-role="user"]')).toContainText('Why does water help with headaches?');
    await expect(sheet.locator('[data-role="assistant"]')).toContainText(CANNED_ANSWER);
    await expect(nav(page)).toHaveCount(0);

    await page.getByTestId('chat-print').click();
    await expect.poll(() => printed(page)).toBe(1);
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByTestId('chat-print')).toBeHidden();
    await expect(sheet).toBeVisible();

    expect(api.unhandled).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('Print page opened directly: says how to get there', async ({ page, consoleErrors }) => {
    const api = await mockAccount(page);
    await page.goto('/dashboard/ai-doctor/print');
    await expect(page.getByText('Nothing to print here.', { exact: false })).toBeVisible();
    await expect(page.getByTestId('chat-print')).toHaveCount(0);
    expect(api.unhandled).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});

// One baby, born 40 days ago, with two days of log in the last week.
const at = (daysAgo: number, hour: number, min = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
};
function babyTables(): Record<string, Row[]> {
  const ev = (id: string, kind: string, occurred_at: string, data: Row, ended_at: string | null = null): Row => ({
    id, user_id: 'e2e-user-1', baby_id: 'baby-1', kind, occurred_at, ended_at, data: JSON.stringify(data), created_at: occurred_at,
  });
  return {
    babies: [{ id: 'baby-1', user_id: 'e2e-user-1', name: 'Lou', birth_date: resolveTokens('{{day:-40}}'), created_at: at(40, 9) }],
    life_events: [
      ev('ev-1', 'feed', at(2, 8), { type: 'bottle', ml: 90 }),
      ev('ev-2', 'feed', at(2, 12), { type: 'breast', side: 'left' }),
      ev('ev-3', 'feed', at(3, 9), { type: 'bottle', ml: 60 }),
      ev('ev-4', 'nappy', at(2, 9), { type: 'wet' }),
      ev('ev-5', 'nappy', at(3, 10), { type: 'both' }),
      ev('ev-6', 'baby_sleep', at(2, 13), {}, at(2, 15)),
    ],
  };
}

test.describe('Baby', () => {
  test('Stats: weekly summary for the paediatrician, then its print page', async ({ page, consoleErrors }) => {
    const api = await mockAccount(page, 'postpartum', { tables: babyTables() });
    await stubPrint(page);
    await page.goto('/dashboard/baby?tab=stats');
    const week = page.getByTestId('baby-week-summary');
    await expect(week).toContainText('Last 7 days · for the paediatrician');
    await expect(week).toContainText('Feeds: 1.5 a day (2 of 7 days logged). Bottle: 150 ml in total.');
    await expect(week).toContainText('Nappies: 1 wet and 0.5 dirty a day (2 of 7 days logged).');
    await expect(week).toContainText('Sleep: 2h a day (1 of 7 days logged).');

    await week.getByRole('link', { name: 'Print weekly summary' }).click();
    await expect(page).toHaveURL(/\/dashboard\/baby\/summary\/print\?baby=baby-1$/);
    const sheet = page.getByTestId('baby-summary-sheet');
    await expect(sheet.getByRole('heading', { level: 1, name: 'Lou' })).toBeVisible();
    await expect(nav(page)).toHaveCount(0);

    await page.getByTestId('baby-summary-print').click();
    await expect.poll(() => printed(page)).toBe(1);
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByTestId('baby-summary-print')).toBeHidden();
    await expect(sheet).toBeVisible();

    expect(api.unhandled).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('Print page with no baby saved: says it could not load, no crash', async ({ page, consoleErrors }) => {
    const api = await mockAccount(page, 'postpartum', { tables: { babies: [] } });
    await page.goto('/dashboard/baby/summary/print');
    await expect(page.getByText('Could not load the baby log.', { exact: false })).toBeVisible();
    expect(api.unhandled).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('Pregnancy', () => {
  test('Check-ups and scans: mark a step done, saved to the account, then undo', async ({ page, consoleErrors }) => {
    const api = await mockAccount(page, 'pregnancy');
    await page.goto('/dashboard/stage');
    const card = page.getByTestId('pregnancy-checkups');
    await expect(card).toContainText('Check-ups and scans');
    const counter = card.getByText(/^Week \d+ · \d+ of \d+ marked done$/);
    await expect(counter).toBeVisible();
    const before = Number((await counter.textContent())!.match(/· (\d+) of/)![1]);

    const step = card.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Mark done' }) }).first();
    const label = (await step.locator('span.font-semibold').textContent())!;
    await step.getByRole('button', { name: 'Mark done' }).click();
    await expect(counter).toHaveText(new RegExp(`· ${before + 1} of`));
    const marked = card.getByRole('listitem').filter({ hasText: label });
    await expect(marked.getByRole('button', { name: 'Undo' })).toBeVisible();

    // pushAccountData saves to user_app_data after a short debounce
    // (account key without the device prefix and user id).
    const key = 'preg_checkups';
    await expect.poll(() => api.tables.user_app_data.filter((r) => r.key === key).length, { timeout: 10_000 }).toBe(1);
    const saved = api.tables.user_app_data.find((r) => r.key === key)!;
    const value = typeof saved.value === 'string' ? JSON.parse(saved.value) : saved.value;
    expect(Object.keys(value)).toHaveLength(1);

    await marked.getByRole('button', { name: 'Undo' }).click();
    await expect(counter).toHaveText(new RegExp(`· ${before} of`));
    await expect(marked.getByRole('button', { name: 'Mark done' })).toBeVisible();
    await expect.poll(() => {
      const r = api.tables.user_app_data.find((x) => x.key === key)!;
      const v = typeof r.value === 'string' ? JSON.parse(r.value) : r.value;
      return Object.keys(v).length;
    }, { timeout: 10_000 }).toBe(0);
    expect(api.tables.user_app_data.filter((r) => r.key === key)).toHaveLength(1);

    expect(api.unhandled).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
