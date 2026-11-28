import { describe, it, expect } from 'vitest';
import { todayItems, STAGE_PAGE } from './todayItems';

// Round 9: IVF clinic dates and the non-pill contraception methods on
// Home's Today list, plus the first-data rows for a brand-new account.
const NOW = new Date(2026, 10, 23, 9, 0);

describe('todayItems: IVF clinic dates', () => {
  it("today's date ranks with the stage tasks, tomorrow's as a heads-up; the trigger links to its timer", () => {
    const rows = todayItems('ivf', {
      now: NOW,
      nextVisit: new Date(2026, 10, 25, 10, 0),
      ivfDates: [
        { key: 'scan', label: 'Monitoring scan', daysUntil: 0 },
        { key: 'trigger', label: 'Trigger shot', daysUntil: 1, time: '21:30' },
      ],
    });
    expect(rows).toEqual([
      { id: 'ivf-scan', label: 'Monitoring scan today', target: `${STAGE_PAGE}#ivf-tracker` },
      { id: 'ivf-trigger', label: 'Trigger shot tomorrow at 21:30', target: `${STAGE_PAGE}#ivf-trigger` },
      expect.objectContaining({ id: 'visit-soon' }),
    ]);
  });

  it('asks a brand-new account for the clinic dates; other stages ignore IVF signals', () => {
    expect(todayItems('ivf', { now: NOW, ivfSetupNeeded: true })).toEqual([
      { id: 'ivf-setup', label: "Add the dates from your clinic's plan", target: `${STAGE_PAGE}#ivf-tracker` },
    ]);
    expect(todayItems('pregnancy', { now: NOW, ivfSetupNeeded: true, ivfDates: [{ key: 'scan', label: 'Monitoring scan', daysUntil: 0 }] })).toEqual([]);
  });
});

describe('todayItems: contraception methods', () => {
  it('urgent rows with the stage tasks, heads-ups after the visit-free tasks', () => {
    const rows = todayItems('contraception', {
      now: NOW,
      medicinesRunningOut: [{ name: 'Iron', label: 'Iron runs out in 2 days' }],
      contraceptionDue: [
        { id: 'method-check', label: 'IUD check on Wednesday', urgent: false },
        { id: 'method-replace', label: 'IUD replacement date passed: check with your clinic', urgent: true },
      ],
    });
    expect(rows.map(r => r.id)).toEqual(['method-replace', 'method-check', 'medicine-supply']);
    expect(rows[0].target).toBe(`${STAGE_PAGE}#contraception`);
  });

  it('asks for the method on a brand-new account; other stages ignore it', () => {
    expect(todayItems('contraception', { now: NOW, methodMissing: true })).toEqual([
      { id: 'method-setup', label: 'Choose your contraception method', target: `${STAGE_PAGE}#contraception` },
    ]);
    expect(todayItems('menstrual-cycle', { now: NOW, methodMissing: true, contraceptionDue: [{ id: 'x', label: 'x', urgent: true }] })).toEqual([]);
  });
});
