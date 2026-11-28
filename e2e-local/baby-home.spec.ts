import { test, expect, mockAccount, resolveTokens } from './fixtures';
import type { Row } from './mock-api';

// Home after birth: the baby card under the baby hero. Last feed, feeds
// and nappies today, a running timer, the next vaccine (BAG schedule) and
// the latest weight with its WHO percentile; every line opens its Baby
// tab; "Log feed" repeats the last feed with the 8-second Undo. Postpartum
// with no baby: no card, the hero asks to add the baby. Baby Lou, born 20
// days ago.

const minsAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();
const ev = (id: string, kind: string, occurred_at: string, data: Row, ended_at: string | null = null): Row => ({
  id, user_id: 'e2e-user-1', baby_id: 'baby-1', kind, occurred_at, ended_at, data: JSON.stringify(data), created_at: occurred_at,
});
// Feeds/nappies "today" must stay today even just after midnight.
const todayMinsAgo = (m: number) => {
  const sinceMidnight = (Date.now() - new Date().setHours(0, 0, 0, 0)) / 60000;
  return minsAgo(Math.min(m, Math.max(0, sinceMidnight - 1)));
};
function tables(events: Row[] = []): Record<string, Row[]> {
  return {
    babies: [{ id: 'baby-1', user_id: 'e2e-user-1', name: 'Lou', birth_date: resolveTokens('{{day:-20}}'), sex: 'female', created_at: minsAgo(20 * 1440) }],
    life_events: events,
  };
}
const withData = () => tables([
  ev('f-1', 'feed', todayMinsAgo(125), { method: 'bottle', ml: 90, milk: 'formula' }),
  ev('f-2', 'feed', todayMinsAgo(300), { method: 'breast_l' }, todayMinsAgo(285)),
  ev('n-1', 'nappy', todayMinsAgo(30), { type: 'wet' }),
  ev('n-2', 'nappy', todayMinsAgo(90), { type: 'both' }),
  ev('g-1', 'baby_growth', minsAgo(2 * 1440), { weight_g: 3620, source: 'typed' }),
]);
const feedsOf = (t: Record<string, Row[]>) => (t.life_events ?? []).filter(r => r.kind === 'feed');
const noSideScroll = async (page: import('@playwright/test').Page) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
};

test.describe('Home baby card', () => {
  test('postpartum with a baby: the card lines, each opening its Baby tab', async ({ page, consoleErrors }, testInfo) => {
    const api = await mockAccount(page, 'postpartum', { tables: withData() });
    await page.goto('/dashboard');
    const card = page.getByTestId('baby-home-card');
    await expect(card).toBeVisible();
    await expect(card.getByTestId('baby-home-last-feed')).toContainText(/2h 0\d ago · bottle 90 ml/);
    await expect(card.getByTestId('baby-home-feeds')).toContainText('2');
    await expect(card.getByTestId('baby-home-nappies')).toContainText('2 wet · 1 dirty');
    await expect(card.getByTestId('baby-home-vaccine')).toContainText(/ · due /);
    await expect(card.getByTestId('baby-home-weight')).toContainText(/3\.6 kg · \d+(st|nd|rd|th) percentile/);
    await expect(card.getByTestId('home-feed-quick-log')).toContainText('Log feed: Bottle · 90 ml · formula');
    await expect(page.getByTestId('baby-home-timer')).toHaveCount(0);
    // The hero keeps its headline; the counts moved to the card.
    await expect(page.getByRole('heading', { name: /Last feed/ })).toBeVisible();
    await noSideScroll(page);
    await page.screenshot({ path: testInfo.outputPath('home-baby-card.png'), fullPage: true });

    for (const [line, tab] of [['baby-home-nappies', 'Nappy'], ['baby-home-vaccine', 'Vaccines'], ['baby-home-weight', 'Growth'], ['baby-home-last-feed', 'Feed']] as const) {
      await page.getByTestId(line).click();
      await expect(page).toHaveURL(/\/dashboard\/baby\?tab=/);
      await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
      await page.goBack();
      await expect(page.getByTestId('baby-home-card')).toBeVisible();
    }
    expect(api.unhandled).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('Log feed on Home repeats the last feed; Undo removes it', async ({ page, consoleErrors }, testInfo) => {
    const api = await mockAccount(page, 'postpartum', { tables: withData() });
    await page.goto('/dashboard');
    await page.getByTestId('home-feed-quick-log').click();
    await expect(page.getByTestId('baby-notice')).toContainText('Bottle · 90 ml · formula logged ✓');
    await expect(page.getByTestId('baby-home-feeds')).toContainText('3');
    await expect(page.getByTestId('baby-home-last-feed')).toContainText(/^Last feed0 min ago · bottle 90 ml/);
    await expect(page.getByRole('heading', { name: /Last feed/ })).toContainText('0 min ago');
    expect(feedsOf(api.tables)).toHaveLength(3);
    await noSideScroll(page);
    await page.screenshot({ path: testInfo.outputPath('home-baby-card-undo.png'), fullPage: true });

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByTestId('baby-notice')).toContainText('Removed.');
    await expect(page.getByTestId('baby-home-feeds')).toContainText('2');
    expect(feedsOf(api.tables).map(r => r.id).sort()).toEqual(['f-1', 'f-2']);
    expect(api.unhandled).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('a running breastfeeding timer shows on Home and opens the Feed tab with it', async ({ page, consoleErrors }, testInfo) => {
    const api = await mockAccount(page, 'postpartum', { tables: withData() });
    await page.addInitScript((start) => {
      localStorage.setItem('womanie_baby_feed_active_baby-1', JSON.stringify({ side: 'breast_l', start }));
    }, Date.now() - 7 * 60000);
    await page.goto('/dashboard');
    const timer = page.getByTestId('baby-home-timer');
    await expect(timer).toContainText('Feeding now · Left breast');
    await expect(timer).toContainText(/[78]:\d\d$/);
    await expect(page.getByTestId('home-feed-quick-log')).toHaveCount(0);
    await noSideScroll(page);
    await page.screenshot({ path: testInfo.outputPath('home-baby-card-timer.png'), fullPage: true });
    await timer.click();
    await expect(page).toHaveURL(/tab=feed/);
    await expect(page.getByTestId('baby-timer')).toContainText('Left breast · feeding now');
    expect(api.unhandled).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('a running sleep timer shows on Home and opens the Sleep tab', async ({ page, consoleErrors }) => {
    const api = await mockAccount(page, 'postpartum', { tables: withData() });
    await page.addInitScript((start) => {
      localStorage.setItem('womanie_baby_sleep_active_baby-1', String(start));
    }, Date.now() - 40 * 60000);
    await page.goto('/dashboard');
    const timer = page.getByTestId('baby-home-timer');
    await expect(timer).toContainText(/Asleep\s*4[01]:\d\d/);
    await timer.click();
    await expect(page).toHaveURL(/tab=sleep/);
    await expect(page.getByTestId('baby-timer')).toContainText('Sleeping');
    expect(api.unhandled).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('postpartum with no baby yet: no card, the hero asks to add the baby', async ({ page, consoleErrors }, testInfo) => {
    const api = await mockAccount(page, 'postpartum', { tables: { babies: [], life_events: [] } });
    await page.goto('/dashboard');
    await expect(page.getByRole('link', { name: 'Add your baby' })).toBeVisible();
    await expect(page.getByTestId('baby-home-card')).toHaveCount(0);
    await noSideScroll(page);
    await page.screenshot({ path: testInfo.outputPath('home-no-baby.png'), fullPage: true });
    expect(api.unhandled).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('a baby with no entries: zeros, no Log feed button, no weight line', async ({ page, consoleErrors }) => {
    const api = await mockAccount(page, 'postpartum', { tables: tables() });
    await page.goto('/dashboard');
    await expect(page.getByTestId('baby-home-last-feed')).toContainText('None yet');
    await expect(page.getByTestId('baby-home-nappies')).toContainText('0 wet · 0 dirty');
    await expect(page.getByTestId('baby-home-vaccine')).toBeVisible();
    await expect(page.getByTestId('baby-home-weight')).toHaveCount(0);
    await expect(page.getByTestId('home-feed-quick-log')).toHaveCount(0);
    expect(api.unhandled).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
