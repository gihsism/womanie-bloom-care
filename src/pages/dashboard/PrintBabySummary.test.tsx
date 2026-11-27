import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BabySummarySheet, babyAge, type BabySummaryData } from './PrintBabySummary';

const NOW = new Date(2026, 10, 25, 10, 0);
const at = (d: number, h: number) => new Date(2026, 10, 25 + d, h, 0).toISOString();
const plus = (iso: string, min: number) => new Date(Date.parse(iso) + min * 60000).toISOString();

const data: BabySummaryData = {
  name: 'Mia',
  birthDate: '2026-10-14',
  feeds: [
    { occurred_at: at(-1, 6), ended_at: null, data: { method: 'breast_l' } },
    { occurred_at: at(-1, 9), ended_at: null, data: { method: 'bottle', ml: 80 } },
    { occurred_at: at(0, 7), ended_at: null, data: { method: 'breast_r' } }, // today: not counted
  ],
  nappies: [
    { occurred_at: at(-1, 7), ended_at: null, data: { type: 'both' } },
    { occurred_at: at(-2, 7), ended_at: null, data: { type: 'wet' } },
  ],
  sleeps: [{ occurred_at: at(-1, 13), ended_at: plus(at(-1, 13), 150), data: {} }],
};

describe('BabySummarySheet', () => {
  it('prints the daily averages, the day-by-day table and totals', () => {
    const { container } = render(<BabySummarySheet data={data} now={NOW} />);
    expect(container.textContent).toContain('Mia');
    expect(container.textContent).toContain('6 weeks old (born 14 October 2026)');
    const avg = container.querySelector('[data-section="averages"]')!;
    expect(avg.textContent).toContain('Feeds: 2 a day (1 of 7 days logged). Bottle: 80 ml in total.');
    expect(avg.textContent).toContain('Nappies: 1 wet and 0.5 dirty a day (2 of 7 days logged).');
    expect(avg.textContent).toContain('Sleep: 2h 30m a day (1 of 7 days logged).');
    const rows = container.querySelectorAll('[data-section="days"] tbody tr');
    expect(rows).toHaveLength(8); // 7 days + total
    expect(rows[7].textContent).toContain('Total');
    expect(rows[7].textContent).toContain('2h 30m');
    expect(container.textContent).toMatch(/Not a diagnosis/);
  });

  it('nothing logged: says so and leaves out the table', () => {
    const { container } = render(<BabySummarySheet data={{ ...data, feeds: [], nappies: [], sleeps: [] }} now={NOW} />);
    expect(container.textContent).toContain('Feeds: none logged.');
    expect(container.querySelector('[data-section="days"]')).toBeNull();
  });

  it('babyAge handles days, weeks, months and a missing date', () => {
    expect(babyAge('2026-11-20', NOW)).toBe('5 days old (born 20 November 2026)');
    expect(babyAge('2026-05-01', NOW)).toMatch(/^6 months old/);
    expect(babyAge(null, NOW)).toBeNull();
    expect(babyAge('2026-12-01', NOW)).toBeNull();
  });
});
