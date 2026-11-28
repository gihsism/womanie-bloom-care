import { test, expect, mockAccount, resolveTokens } from './fixtures';
import type { Row } from './mock-api';

// Baby Growth tab: WHO weight-, length- and head-for-age charts (tabs),
// the one "Add a measurement" form (typed weight, a weight read from a
// photo of the scale via mocked /api/baby/scale-photo, optional length and
// head, one record), and asking for the sex before any percentile is
// shown. Baby Lou, born 56 days ago.

const at = (daysAgo: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
};
function tables(sex: string | null): Record<string, Row[]> {
  return {
    babies: [{ id: 'baby-1', user_id: 'e2e-user-1', name: 'Lou', birth_date: resolveTokens('{{day:-56}}'), sex, created_at: at(56) }],
    life_events: [
      { id: 'g-1', user_id: 'e2e-user-1', baby_id: 'baby-1', kind: 'baby_growth', occurred_at: at(56), ended_at: null, data: JSON.stringify({ weight_g: 3300 }), created_at: at(56) },
      { id: 'g-2', user_id: 'e2e-user-1', baby_id: 'baby-1', kind: 'baby_growth', occurred_at: at(28), ended_at: null, data: JSON.stringify({ weight_g: 4000, length_cm: 53.5, head_cm: 36.4 }), created_at: at(28) },
    ],
  };
}
// 1x1 PNG: the browser decodes it, the app re-encodes it as JPEG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const growthRows = (tablesNow: Record<string, Row[]>) =>
  (tablesNow.life_events ?? []).filter(r => r.kind === 'baby_growth').map(r => (typeof r.data === 'string' ? JSON.parse(r.data) : r.data));

test.describe('Baby growth chart', () => {
  test('type a weight: saved, chart line updates; no sideways scroll', async ({ page, consoleErrors }, testInfo) => {
    const api = await mockAccount(page, 'postpartum', { tables: tables('female') });
    await page.goto('/dashboard/baby?tab=growth');
    await expect(page.getByTestId('growth-chart')).toBeVisible();
    await expect(page.getByTestId('growth-latest')).toHaveText(/^4\.0 kg at 4 weeks, around the \d+(st|nd|rd|th) percentile$/);
    await expect(page.getByText('Babies often move between lines in the first weeks. Your midwife or paediatrician looks at the trend.')).toBeVisible();
    // The five WHO curves are labelled at the right end.
    for (const p of ['3rd', '15th', '50th', '85th', '97th']) {
      await expect(page.getByTestId('growth-chart').getByText(p, { exact: true })).toBeVisible();
    }

    await page.getByTestId('add-measurement').getByLabel('Weight (kg)').fill('30');
    await page.getByRole('button', { name: 'Save measurement' }).click();
    await expect(page.getByText('Enter a weight between 0.5 kg and 25 kg.')).toBeVisible();
    await page.getByRole('button', { name: 'g', exact: true }).click();
    await page.getByTestId('add-measurement').getByLabel('Weight (g)').fill('4600');
    await page.getByRole('button', { name: 'Save measurement' }).click();
    await expect(page.getByText('Measurement saved.')).toBeVisible();
    await expect(page.getByTestId('growth-latest')).toHaveText(/^4\.6 kg at 8 weeks, around the \d+(st|nd|rd|th) percentile$/);
    expect(growthRows(api.tables)).toContainEqual(expect.objectContaining({ weight_g: 4600, source: 'typed' }));

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.getByTestId('growth-chart').scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('growth-tab.png'), fullPage: true });

    expect(api.unhandled).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('one form: weight, length and head saved as one record; Length and Head charts', async ({ page, consoleErrors }, testInfo) => {
    const api = await mockAccount(page, 'postpartum', { tables: tables('female') });
    await page.goto('/dashboard/baby?tab=growth');
    await expect(page.getByTestId('growth-chart')).toBeVisible();
    // The old second form is gone: one Save button on the tab.
    await expect(page.getByRole('button', { name: 'Save measurement' })).toHaveCount(1);
    await expect(page.getByText('Weight, length and head')).toHaveCount(0);

    const form = page.getByTestId('add-measurement');
    await form.getByLabel('Weight (kg)').fill('4.7');
    await form.getByLabel('Length (cm)').fill('57.5');
    await form.getByLabel('Head circumference (cm)').fill('38.5');
    await page.getByRole('button', { name: 'Save measurement' }).click();
    await expect(page.getByText('Measurement saved.')).toBeVisible();
    const rows = growthRows(api.tables);
    expect(rows).toHaveLength(3);
    expect(rows).toContainEqual({ weight_g: 4700, length_cm: 57.5, head_cm: 38.5, source: 'typed' });
    expect(api.calls.filter(c => c.startsWith('db insert life_events'))).toHaveLength(1);

    await page.getByRole('tab', { name: 'Length' }).click();
    await expect(page.getByRole('heading', { name: 'Length for age' })).toBeVisible();
    await expect(page.getByTestId('growth-latest')).toHaveText(/^57\.5 cm at 8 weeks, around the \d+(st|nd|rd|th) percentile$/);
    for (const p of ['3rd', '50th', '97th']) await expect(page.getByTestId('growth-chart').getByText(p, { exact: true })).toBeVisible();
    let overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: testInfo.outputPath('growth-length.png'), fullPage: true });

    await page.getByRole('tab', { name: 'Head' }).click();
    await expect(page.getByRole('heading', { name: 'Head circumference for age' })).toBeVisible();
    await expect(page.getByTestId('growth-latest')).toHaveText(/^38\.5 cm at 8 weeks, around the \d+(st|nd|rd|th) percentile$/);
    await expect(page.getByText('Babies often move between lines in the first weeks. Your midwife or paediatrician looks at the trend.')).toBeVisible();
    overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: testInfo.outputPath('growth-head.png'), fullPage: true });

    // The saved record is listed once with all three values.
    await expect(page.getByText('4.70 kg · 57.5 cm long · head 38.5 cm')).toHaveCount(1);
    expect(api.unhandled).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('photo of the scale: value pre-filled, saved only after Save', async ({ page, consoleErrors }, testInfo) => {
    const api = await mockAccount(page, 'postpartum', { tables: tables('male') });
    await page.goto('/dashboard/baby?tab=growth');
    await expect(page.getByTestId('growth-chart')).toBeVisible();
    await page.getByTestId('scale-photo-input').setInputFiles({ name: 'scale.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByTestId('add-measurement').getByLabel('Weight (kg)')).toHaveValue('4.62');
    await expect(page.getByTestId('scale-photo-note')).toContainText('Read from the photo: 4.62 kg.');
    expect(api.calls.filter(c => c.startsWith('db insert life_events'))).toEqual([]);
    expect(growthRows(api.tables)).toHaveLength(2);
    await page.screenshot({ path: testInfo.outputPath('growth-photo-prefilled.png'), fullPage: true });

    await page.getByRole('button', { name: 'Save measurement' }).click();
    await expect(page.getByText('Measurement saved.')).toBeVisible();
    expect(growthRows(api.tables)).toContainEqual(expect.objectContaining({ weight_g: 4620, source: 'photo' }));
    await expect(page.getByTestId('growth-latest')).toHaveText(/^4\.6 kg at 8 weeks, around the/);

    expect(api.unhandled).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('unreadable photo: friendly message, nothing filled or saved', async ({ page, consoleErrors }) => {
    const api = await mockAccount(page, 'postpartum', {
      tables: tables('female'),
      json: { '/api/baby/scale-photo': { weight_kg: null, confidence: 0 } },
    });
    await page.goto('/dashboard/baby?tab=growth');
    await page.getByTestId('scale-photo-input').setInputFiles({ name: 'blurry.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByTestId('scale-photo-note')).toContainText('couldn’t read a number on this photo');
    await expect(page.getByTestId('add-measurement').getByLabel('Weight (kg)')).toHaveValue('');
    expect(growthRows(api.tables)).toHaveLength(2);
    expect(api.unhandled).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('sex unknown: asks first, then shows the girls chart', async ({ page, consoleErrors }, testInfo) => {
    const api = await mockAccount(page, 'postpartum', { tables: tables(null) });
    await page.goto('/dashboard/baby?tab=growth');
    await expect(page.getByText('The WHO growth charts are different for girls and boys. Is Lou a girl or a boy?')).toBeVisible();
    await expect(page.getByTestId('growth-chart')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('growth-ask-sex.png'), fullPage: true });
    await page.getByRole('button', { name: 'Girl' }).click();
    await expect(page.getByTestId('growth-chart')).toBeVisible();
    await expect(page.getByText('WHO Child Growth Standards, girls, birth to 2 years')).toBeVisible();
    expect(api.tables.babies[0].sex).toBe('female');
    expect(api.unhandled).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
