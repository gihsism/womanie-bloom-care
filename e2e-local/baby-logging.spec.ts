import { test, expect, mockAccount, resolveTokens } from './fixtures';
import type { Row } from './mock-api';

// Baby Feed / Sleep / Nappy logging like the official apps: one-tap quick
// log with her last choices, editable time on every entry, timers for
// breastfeeding and sleep that survive a reload, Undo for the last entry.
// Then the Stats tab (last-7-days charts incl. sleep, numbers only), the
// Growth list with percentiles, and the WHO charts on the printed weekly
// summary. Baby Lou, born 56 days ago.

const at = (daysAgo: number, hour = 12, min = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
};
const ev = (id: string, kind: string, occurred_at: string, data: Row, ended_at: string | null = null): Row => ({
  id, user_id: 'e2e-user-1', baby_id: 'baby-1', kind, occurred_at, ended_at, data: JSON.stringify(data), created_at: occurred_at,
});
function tables(events: Row[] = []): Record<string, Row[]> {
  return {
    babies: [{ id: 'baby-1', user_id: 'e2e-user-1', name: 'Lou', birth_date: resolveTokens('{{day:-56}}'), sex: 'female', created_at: at(56) }],
    life_events: events,
  };
}
const rowsOf = (t: Record<string, Row[]>, kind: string) =>
  (t.life_events ?? []).filter(r => r.kind === kind).map(r => ({ ...r, data: typeof r.data === 'string' ? JSON.parse(r.data) : r.data }));
const noSideScroll = async (page: import('@playwright/test').Page) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
};
const minutesBetween = (a: unknown, b: unknown) => (Date.parse(String(b)) - Date.parse(String(a))) / 60000;

test.describe('Baby logging', () => {
  test('Feed: quick log repeats her last bottle, Undo removes it; form opens with the last choices', async ({ page, consoleErrors }, testInfo) => {
    const api = await mockAccount(page, 'postpartum', {
      tables: tables([ev('f-1', 'feed', at(1, 0, 30), { method: 'bottle', ml: 90, milk: 'formula' })]),
    });
    await page.goto('/dashboard/baby?tab=feed');
    const quick = page.getByTestId('feed-quick-log');
    await expect(quick).toContainText('Quick log: Bottle · 90 ml · formula');
    await noSideScroll(page);
    await page.screenshot({ path: testInfo.outputPath('feed-tab.png'), fullPage: true });

    await quick.click();
    await expect(page.getByTestId('baby-notice')).toContainText('Bottle · 90 ml · formula logged ✓');
    expect(rowsOf(api.tables, 'feed')).toHaveLength(2);
    expect(rowsOf(api.tables, 'feed')).toContainEqual(expect.objectContaining({ data: { method: 'bottle', ml: 90, milk: 'formula' } }));
    await page.screenshot({ path: testInfo.outputPath('feed-undo.png'), fullPage: true });

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByTestId('baby-notice')).toContainText('Removed.');
    expect(rowsOf(api.tables, 'feed').map(r => r.id)).toEqual(['f-1']);

    await page.getByRole('button', { name: 'Add a feed' }).click();
    await expect(page.getByRole('radio', { name: 'Bottle' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByLabel('Amount (ml)')).toHaveValue('90');
    await expect(page.getByLabel('When did it start?')).toBeVisible();
    await noSideScroll(page);
    expect(api.unhandled).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('Feed: quick log after a breastfeed offers the other side for the same time', async ({ page, consoleErrors }) => {
    const api = await mockAccount(page, 'postpartum', {
      tables: tables([ev('f-1', 'feed', at(1, 0, 10), { method: 'breast_l' }, at(1, 0, 22))]),
    });
    await page.goto('/dashboard/baby?tab=feed');
    await expect(page.getByTestId('feed-quick-log')).toContainText('Quick log: Right breast · 12 min');
    await page.getByTestId('feed-quick-log').click();
    await expect(page.getByTestId('baby-notice')).toContainText('Right breast · 12 min logged ✓');
    const added = rowsOf(api.tables, 'feed').find(r => r.id !== 'f-1');
    expect(added?.data).toEqual({ method: 'breast_r' });
    expect(Math.round(minutesBetween(added?.occurred_at, added?.ended_at))).toBe(12);
    expect(api.unhandled).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('Breastfeeding timer survives a reload; start time can be corrected; Undo brings the timer back', async ({ page, consoleErrors }, testInfo) => {
    const api = await mockAccount(page, 'postpartum', { tables: tables() });
    await page.goto('/dashboard/baby?tab=feed');
    await page.getByRole('button', { name: /^Left/ }).click();
    const timer = page.getByTestId('baby-timer');
    await expect(timer).toContainText('Left breast · feeding now');
    await expect(page.getByTestId('baby-timer-clock')).toHaveText(/^0:0\d$/);

    await page.reload();
    await expect(page.getByTestId('baby-timer')).toContainText('Left breast · feeding now');

    // She started 10 minutes before she remembered the timer.
    await page.getByRole('button', { name: 'Change start time' }).click();
    const tenAgo = new Date(Date.now() - 10 * 60000);
    const pad = (n: number) => String(n).padStart(2, '0');
    await page.getByLabel('Started at').fill(`${tenAgo.getFullYear()}-${pad(tenAgo.getMonth() + 1)}-${pad(tenAgo.getDate())}T${pad(tenAgo.getHours())}:${pad(tenAgo.getMinutes())}`);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('baby-timer-clock')).toHaveText(/^1\d:\d\d$/);
    await noSideScroll(page);
    await page.screenshot({ path: testInfo.outputPath('feed-timer.png'), fullPage: true });

    await page.getByRole('button', { name: 'Finished — save feed' }).click();
    await expect(page.getByTestId('baby-notice')).toContainText('Feed saved ✓');
    const [feed] = rowsOf(api.tables, 'feed');
    expect(feed.data).toEqual({ method: 'breast_l' });
    expect(minutesBetween(feed.occurred_at, feed.ended_at)).toBeGreaterThanOrEqual(10);

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByTestId('baby-timer')).toContainText('Left breast · feeding now');
    expect(rowsOf(api.tables, 'feed')).toHaveLength(0);
    await page.getByRole('button', { name: 'Discard timer' }).click();
    await expect(page.getByTestId('baby-timer')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: /^Left/ })).toBeVisible();
    expect(rowsOf(api.tables, 'feed')).toHaveLength(0);
    expect(api.unhandled).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('Sleep timer survives a reload and saves; an entry’s time can be changed', async ({ page, consoleErrors }, testInfo) => {
    const api = await mockAccount(page, 'postpartum', {
      tables: tables([ev('s-1', 'baby_sleep', at(1, 0, 5), {}, at(1, 0, 50))]),
    });
    await page.goto('/dashboard/baby?tab=sleep');
    await page.getByRole('button', { name: 'Fell asleep now' }).click();
    await expect(page.getByTestId('baby-timer')).toContainText('Sleeping');
    await page.reload();
    await expect(page.getByTestId('baby-timer')).toContainText('Sleeping');
    await page.getByRole('button', { name: 'Woke up — save sleep' }).click();
    await expect(page.getByTestId('baby-notice')).toContainText('Sleep saved ✓');
    expect(rowsOf(api.tables, 'baby_sleep')).toHaveLength(2);

    // Move the earlier sleep 30 minutes later: its length stays 45 minutes.
    await page.getByRole('button', { name: /^Change time, 00:05$/ }).click();
    const row = page.getByTestId('retime-row');
    const d = new Date(at(1, 0, 35));
    const pad = (n: number) => String(n).padStart(2, '0');
    await row.getByLabel('Started at').fill(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:35`);
    await noSideScroll(page);
    await page.screenshot({ path: testInfo.outputPath('sleep-retime.png'), fullPage: true });
    await row.getByRole('button', { name: 'Save time' }).click();
    await expect(page.getByRole('button', { name: /^Change time, 00:35$/ })).toBeVisible();
    const moved = rowsOf(api.tables, 'baby_sleep').find(r => r.id === 's-1');
    expect(new Date(String(moved?.occurred_at)).getMinutes()).toBe(35);
    expect(minutesBetween(moved?.occurred_at, moved?.ended_at)).toBe(45);

    // "Add an earlier sleep" starts with the length of her last sleep.
    await page.getByRole('button', { name: 'Add an earlier sleep' }).click();
    await expect(page.getByLabel('Slept for (minutes)')).not.toHaveValue('60');
    expect(api.unhandled).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('Nappy: one tap, Undo, change the time of an entry', async ({ page, consoleErrors }, testInfo) => {
    const api = await mockAccount(page, 'postpartum', { tables: tables() });
    await page.goto('/dashboard/baby?tab=nappy');
    await page.getByRole('button', { name: '+ Wet' }).click();
    await expect(page.getByTestId('baby-notice')).toContainText('Wet nappy added ✓');
    expect(rowsOf(api.tables, 'nappy')).toHaveLength(1);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByTestId('baby-notice')).toContainText('Removed.');
    expect(rowsOf(api.tables, 'nappy')).toHaveLength(0);

    await page.getByRole('button', { name: /^\+ Dirty/ }).click();
    await expect(page.getByTestId('baby-notice')).toContainText('Dirty nappy added ✓');
    await expect(page.getByRole('button', { name: '+ Dirty (last time)' })).toBeVisible();
    await page.getByRole('button', { name: /^Change time, / }).click();
    const d = new Date(Date.now() - 2 * 3600_000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const want = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    await page.getByTestId('retime-row').getByLabel('Time').fill(want);
    await page.getByRole('button', { name: 'Save time' }).click();
    await expect(page.getByRole('button', { name: `Change time, ${pad(d.getHours())}:${pad(d.getMinutes())}` })).toBeVisible();
    const [n] = rowsOf(api.tables, 'nappy');
    expect(Math.abs(Date.parse(String(n.occurred_at)) - d.getTime())).toBeLessThan(60_000);
    await noSideScroll(page);
    await page.screenshot({ path: testInfo.outputPath('nappy-tab.png'), fullPage: true });
    expect(api.unhandled).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('Stats: feeds, nappies and sleep per day, numbers only', async ({ page, consoleErrors }, testInfo) => {
    const api = await mockAccount(page, 'postpartum', {
      tables: tables([
        ev('f-1', 'feed', at(1, 8), { method: 'bottle', ml: 90, milk: 'formula' }),
        ev('f-2', 'feed', at(2, 9), { method: 'breast_l' }, at(2, 9, 15)),
        ev('n-1', 'nappy', at(1, 9), { type: 'wet' }),
        ev('s-1', 'baby_sleep', at(1, 13), {}, at(1, 15, 30)),
      ]),
    });
    await page.goto('/dashboard/baby?tab=stats');
    await expect(page.getByText('Feeds per day')).toBeVisible();
    await expect(page.getByText('Nappies per day')).toBeVisible();
    await expect(page.getByText('Sleep per day (hours)')).toBeVisible();
    await expect(page.getByTestId('sleep-chart')).toHaveAttribute('aria-label', /2h 30m/);
    const text = (await page.getByRole('tabpanel').innerText()).toLowerCase();
    expect(text).not.toMatch(/\b(normal|good|great|enough|too (few|many|little|much)|low|high|below average|above average)\b/);
    await noSideScroll(page);
    await page.screenshot({ path: testInfo.outputPath('stats-tab.png'), fullPage: true });
    expect(api.unhandled).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('Growth list shows the percentile next to each value; print summary has the WHO charts', async ({ page, consoleErrors }, testInfo) => {
    const api = await mockAccount(page, 'postpartum', {
      tables: tables([
        ev('g-1', 'baby_growth', at(56), { weight_g: 3300 }),
        ev('g-2', 'baby_growth', at(28), { weight_g: 4000, length_cm: 53.5, head_cm: 36.4 }),
        ev('f-1', 'feed', at(1, 8), { method: 'bottle', ml: 90 }),
      ]),
    });
    await page.goto('/dashboard/baby?tab=growth');
    const list = page.getByTestId('growth-list');
    await expect(list.getByTestId('growth-row')).toHaveCount(2);
    const newest = list.getByTestId('growth-row').first();
    await expect(newest).toContainText('4.00 kg');
    await expect(newest).toContainText('53.5 cm');
    await expect(newest).toContainText('36.4 cm');
    await expect(newest).toContainText('4 weeks');
    expect(((await newest.innerText()).match(/\d+(st|nd|rd|th)/g) ?? [])).toHaveLength(3);
    await expect(list).toContainText('Under each value: its WHO percentile for the age on that day.');
    await noSideScroll(page);
    await list.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('growth-list.png'), fullPage: true });

    await page.goto('/dashboard/baby/summary/print?baby=baby-1');
    const sheet = page.getByTestId('baby-summary-sheet');
    await expect(sheet.getByRole('heading', { name: 'Growth' })).toBeVisible();
    for (const m of ['weight', 'length', 'head']) await expect(page.getByTestId(`print-growth-${m}`)).toBeVisible();
    await expect(sheet).toContainText('Latest: 4.0 kg at 4 weeks, around the');
    const table = page.getByTestId('print-growth-table');
    await expect(table.locator('tbody tr')).toHaveCount(2);
    await expect(table).toContainText(/4\.00 kg\s*\(\d+(st|nd|rd|th)\)/);
    await noSideScroll(page);
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByTestId('baby-summary-print')).toBeHidden();
    await expect(page.getByTestId('print-growth-weight')).toBeVisible();
    await noSideScroll(page);
    await page.screenshot({ path: testInfo.outputPath('print-summary.png'), fullPage: true });
    expect(api.unhandled).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
