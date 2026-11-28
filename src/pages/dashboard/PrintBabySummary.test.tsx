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
    expect(container.textContent).toContain('6 weeks old (born 14 Oct 2026)');
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

  it('prints the vaccinations against the BAG schedule: done with date, due, later, other', () => {
    // Born 2026-09-20: 2-month visit on 2026-11-20, NOW = 2026-11-25.
    const vaccines = [
      { id: 'v1', occurred_at: new Date(2026, 10, 21, 12).toISOString(), data: { name: '6-in-1 vaccine, dose 1 of 3', dose: 'hexa-1' } },
      { id: 'v2', occurred_at: new Date(2026, 9, 1, 12).toISOString(), data: { name: 'Flu' } },
    ];
    const { container } = render(<BabySummarySheet data={{ ...data, birthDate: '2026-09-20', vaccines }} now={NOW} />);
    const sec = container.querySelector('[data-section="vaccines"]')!;
    expect(sec.querySelectorAll('tbody tr')).toHaveLength(15);
    expect(sec.querySelector('[data-dose="hexa-1"]')!.textContent).toContain('Done 21 Nov 2026');
    expect(sec.querySelector('[data-dose="pcv-1"]')!.textContent).toContain('Not marked yet (from 20 Nov 2026)');
    expect(sec.querySelector('[data-dose="menb-1"]')!.textContent).toContain('Due soon (from 20 Dec 2026)');
    expect(sec.querySelector('[data-dose="mmrv-1"]')!.textContent).toContain('From 20 Jun 2027');
    expect(sec.textContent).toContain('Other vaccinations: Flu (1 Oct 2026).');
    expect(sec.textContent).toContain('Source: BAG Swiss vaccination schedule 2026');
  });

  it('no vaccinations loaded: no section', () => {
    const { container } = render(<BabySummarySheet data={data} now={NOW} />);
    expect(container.querySelector('[data-section="vaccines"]')).toBeNull();
  });

  it('babyAge handles days, weeks, months and a missing date', () => {
    expect(babyAge('2026-11-20', NOW)).toBe('5 days old (born 20 Nov 2026)');
    expect(babyAge('2026-05-01', NOW)).toMatch(/^6 months old/);
    expect(babyAge(null, NOW)).toBeNull();
    expect(babyAge('2026-12-01', NOW)).toBeNull();
  });
});
