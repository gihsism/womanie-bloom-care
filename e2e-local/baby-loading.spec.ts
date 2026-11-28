import { test, expect, mockAccount, resolveTokens } from './fixtures';
import type { Page } from '@playwright/test';
import type { Row } from './mock-api';

// While the baby's entries are still on their way (a slow phone network),
// Home and the Baby tabs show a neutral "…" instead of an empty state:
// "No feeds yet", "None yet", zeros, or every past vaccine as due. The
// life_events reads are held back until the test releases them, then the
// real numbers appear. Plus the print summary's growth chart axis labels:
// at least 10 px on a 390 px phone and on A4 paper (print emulation).

const minsAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();
const todayMinsAgo = (m: number) => {
  const sinceMidnight = (Date.now() - new Date().setHours(0, 0, 0, 0)) / 60000;
  return minsAgo(Math.min(m, Math.max(0, sinceMidnight - 1)));
};
const ev = (id: string, kind: string, occurred_at: string, data: Row, ended_at: string | null = null): Row => ({
  id, user_id: 'e2e-user-1', baby_id: 'baby-1', kind, occurred_at, ended_at, data: JSON.stringify(data), created_at: occurred_at,
});
const tables = (): Record<string, Row[]> => ({
  babies: [{ id: 'baby-1', user_id: 'e2e-user-1', name: 'Lou', birth_date: resolveTokens('{{day:-120}}'), sex: 'female', created_at: minsAgo(120 * 1440) }],
  life_events: [
    ev('f-1', 'feed', todayMinsAgo(125), { method: 'bottle', ml: 90, milk: 'formula' }),
    ev('n-1', 'nappy', todayMinsAgo(30), { type: 'wet' }),
    ev('s-1', 'baby_sleep', todayMinsAgo(200), {}, todayMinsAgo(140)),
    ev('g-1', 'baby_growth', minsAgo(120 * 1440), { weight_g: 3300, length_cm: 50, head_cm: 34.5 }),
    ev('g-2', 'baby_growth', minsAgo(60 * 1440), { weight_g: 4900, length_cm: 57, head_cm: 38.5 }),
    ev('g-3', 'baby_growth', minsAgo(2 * 1440), { weight_g: 6200, length_cm: 62, head_cm: 40.5 }),
    // One dose marked done: the tab must not flash every past dose as due first.
    ev('v-1', 'baby_vaccine', minsAgo(60 * 1440), { name: '6-in-1 vaccine', dose: 'hexa-1' }),
  ],
});

/** Holds every life_events read until release() (registered after the mock, so it runs first). */
async function holdLifeEvents(page: Page) {
  let release!: () => void;
  const gate = new Promise<void>(r => { release = r; });
  await page.context().route(url => url.pathname === '/api/db', async route => {
    let table = '';
    try { table = String((route.request().postDataJSON() as Row | null)?.table ?? ''); } catch { /* not JSON */ }
    if (table === 'life_events') await gate;
    await route.fallback();
  });
  return release;
}

test.describe('Baby data loading', () => {
  test('Home: "…" until the feeds arrive, never "No feeds yet" for a baby with feeds', async ({ page, consoleErrors }, testInfo) => {
    const api = await mockAccount(page, 'postpartum', { tables: tables() });
    const release = await holdLifeEvents(page);
    await page.goto('/dashboard');
    const card = page.getByTestId('baby-home-card');
    await expect(card).toBeVisible();
    await expect(page.getByTestId('baby-hero-loading')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /Last feed/ })).toContainText('Loading');
    for (const id of ['baby-home-last-feed', 'baby-home-feeds', 'baby-home-nappies']) {
      await expect(card.getByTestId(id)).toContainText('…');
    }
    // Held for a while (the live delay was ~4 s): still no empty state.
    await page.waitForTimeout(1500);
    await expect(page.getByText('No feeds yet')).toHaveCount(0);
    await expect(card).not.toContainText('None yet');
    await expect(card.getByTestId('baby-home-nappies')).not.toContainText('0 wet');
    await page.screenshot({ path: testInfo.outputPath('home-baby-loading.png'), fullPage: true });

    release();
    await expect(page.getByRole('heading', { level: 2, name: /Last feed/ })).toContainText(/2h 0\d ago/);
    await expect(page.getByTestId('baby-hero-loading')).toHaveCount(0);
    await expect(card.getByTestId('baby-home-last-feed')).toContainText(/2h 0\d ago · bottle 90 ml/);
    await expect(card.getByTestId('baby-home-feeds')).toContainText('1');
    await expect(card.getByTestId('baby-home-nappies')).toContainText('1 wet · 0 dirty');
    await expect(page.getByText('No feeds yet')).toHaveCount(0);
    expect(api.unhandled).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('Baby tabs: Feed, Sleep, Nappy, Growth and Vaccines wait with "…", then show her entries', async ({ page, consoleErrors }) => {
    const api = await mockAccount(page, 'postpartum', { tables: tables() });
    const release = await holdLifeEvents(page);
    await page.goto('/dashboard/baby?tab=feed');
    const panel = page.getByRole('tabpanel');
    const tab = (name: string) => page.getByRole('tab', { name });

    await expect(panel).toContainText('Feeds today…');
    await expect(panel).not.toContainText('Feeds today0');
    await expect(page.getByTestId('feed-quick-log')).toHaveCount(0);
    await tab('Sleep').click();
    await expect(panel).toContainText('Sleep today…');
    await tab('Nappy').click();
    await expect(panel).toContainText('Wet today…');
    await expect(panel).not.toContainText('Wet today0');
    await tab('Growth').click();
    await expect(page.getByTestId('growth-loading')).toBeVisible();
    await expect(panel).not.toContainText('Add a weight to see where');
    await tab('Vaccines').click();
    await expect(page.getByTestId('vax-loading')).toBeVisible();
    await expect(page.getByTestId('vax-due')).toHaveCount(0);
    await expect(panel).toContainText('Marked done…');

    release();
    await expect(page.getByTestId('vax-loading')).toHaveCount(0);
    await expect(panel).toContainText(/Marked done1 of \d+/);
    await tab('Growth').click();
    await expect(page.getByTestId('growth-latest')).toContainText('6.2 kg');
    await tab('Nappy').click();
    await expect(panel).toContainText('Wet today1');
    await tab('Sleep').click();
    await expect(panel).toContainText('Sleep today1h');
    await tab('Feed').click();
    await expect(panel).toContainText('Feeds today1');
    await expect(page.getByTestId('feed-quick-log')).toBeVisible();
    expect(api.unhandled).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('Print summary growth chart', () => {
  /** Smallest rendered axis-label size in CSS px across the three charts. */
  const minLabelPx = (page: Page) => page.evaluate(() => {
    const svgs = [...document.querySelectorAll('svg[data-testid^="print-growth-"]')] as SVGSVGElement[];
    const sizes = svgs.flatMap(s => [...s.querySelectorAll('text')].map(t => {
      const scale = s.getBoundingClientRect().width / s.viewBox.baseVal.width;
      return Number(t.getAttribute('font-size')) * scale;
    }));
    return { n: sizes.length, min: Math.min(...sizes) };
  });

  test('axis labels at least 10 px at 390 px and on A4 paper; same curves and points', async ({ page, consoleErrors }, testInfo) => {
    const api = await mockAccount(page, 'postpartum', { tables: tables() });
    await page.goto('/dashboard/baby/summary/print?baby=baby-1');
    for (const m of ['weight', 'length', 'head']) await expect(page.getByTestId(`print-growth-${m}`)).toBeVisible();
    const weight = page.getByTestId('print-growth-weight');
    const shape = async () => ({ paths: await weight.locator('path').count(), points: await weight.locator('circle').count() });
    const onScreen = await minLabelPx(page);
    expect(onScreen.n).toBeGreaterThan(30);
    expect(onScreen.min).toBeGreaterThanOrEqual(10);
    const before = await shape();
    expect(before).toEqual({ paths: 6, points: 3 });
    await weight.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`print-growth-${testInfo.project.name}.png`), fullPage: true });

    // A4 print emulation: 210 mm at 96 dpi is 794 px wide.
    await page.setViewportSize({ width: 794, height: 1123 });
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByTestId('baby-summary-print')).toBeHidden();
    await expect(weight).toHaveAttribute('viewBox', '0 0 640 210');
    const paper = await minLabelPx(page);
    expect(paper.min).toBeGreaterThanOrEqual(10);
    expect(await shape()).toEqual(before);
    await page.screenshot({ path: testInfo.outputPath(`print-growth-a4-${testInfo.project.name}.png`), fullPage: true });
    expect(api.unhandled).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
