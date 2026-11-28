import { describe, it, expect } from 'vitest';
import type { LifeStage } from '@/components/dashboard/DashboardHeader';
import { LIFE_STAGES } from './lifeStage';
import { contraceptionRows } from './contraceptionSchedule';
import { rankedTodayItems, todayItems, MAX_TODAY, RECORDS, STAGE_PAGE, type TodaySignals } from './todayItems';

// Round 10: Home's Today list ranks urgent rows first (a result the lab
// marked critical, warning signs she logged, an overdue injection), then
// what is due today, then time-bound heads-ups, then nudges. Home shows
// the first MAX_TODAY rows and a "N more" link for the rest.

// Monday 2026-11-23, 09:00 local
const NOW = new Date(2026, 10, 23, 9, 0);
const at = (days: number, h = 10, m = 30) => new Date(2026, 10, 23 + days, h, m);
const ids = (mode: LifeStage, s: TodaySignals) => rankedTodayItems(mode, { now: NOW, ...s }).map(i => i.id);

/** Everything due today and later, for one stage, to bury an urgent row under. */
const busy: TodaySignals = {
  appointmentToday: at(0, 14),
  newDoctorNotes: 1,
  flaggedResults: 2,
  medicinesDue: [{ name: 'Iron', time: '08:00' }],
  medicinesRunningOut: [{ name: 'Iron', label: 'Iron runs out in 2 days' }],
  nextVisit: at(3),
  setup: { done: 1, total: 3 },
};

describe('Today ranking: urgent rows always first', () => {
  it('a critical lab result tops a full list, in every stage', () => {
    for (const m of LIFE_STAGES) {
      const rows = rankedTodayItems(m, { now: NOW, ...busy, urgentResults: ['Potassium'] });
      expect(rows[0], m).toEqual({ id: 'urgent-result', label: 'Potassium marked urgent by the lab: call your doctor', target: RECORDS });
      expect(todayItems(m, { now: NOW, ...busy, urgentResults: ['Potassium'] })[0].id).toBe('urgent-result');
    }
  });

  it('several critical results are counted; the flagged row keeps the Records total', () => {
    const rows = rankedTodayItems('menopause', { now: NOW, urgentResults: ['Potassium', 'Sodium'], flaggedResults: 3 });
    expect(rows.map(r => [r.id, r.label])).toEqual([
      ['urgent-result', '2 results marked urgent: call your doctor'],
      ['flagged-results', '3 results to talk to your doctor about'],
    ]);
  });

  it('no second row when every flagged result is already an urgent one', () => {
    expect(ids('menopause', { urgentResults: ['Potassium'], flaggedResults: 1 })).toEqual(['urgent-result']);
  });

  it('IVF: a warning sign logged in the two-week wait comes before a trigger shot today', () => {
    const rows = rankedTodayItems('ivf', {
      now: NOW, ...busy, ivfWarningSign: true,
      ivfDates: [{ key: 'trigger', label: 'Trigger shot', daysUntil: 0, time: '21:30' }],
    });
    expect(rows[0]).toEqual({ id: 'ivf-warning', label: 'You logged a warning sign: call your clinic now', target: `${STAGE_PAGE}#ivf-tww` });
    expect(rows.map(r => r.id).slice(0, 3)).toEqual(['ivf-warning', 'visit-today', 'doctor-note']);
    expect(ids('pregnancy', { ivfWarningSign: true })).toEqual([]);
  });

  it('after the birth: heavy bleeding in a recent check-in comes first, named; other red flags generic', () => {
    const rows = rankedTodayItems('postpartum', { now: NOW, ...busy, lastMoodCheck: null, recoveryRedFlags: ['fever', 'heavy-bleeding'] });
    expect(rows[0]).toEqual({ id: 'recovery-red-flag', label: 'Heavy bleeding logged: call your doctor or 144 now', target: `${STAGE_PAGE}#recovery` });
    expect(rankedTodayItems('postpartum', { now: NOW, recoveryRedFlags: ['leg'] })[0].label).toBe('You logged a warning sign: call your doctor or 144 now');
    expect(ids('pregnancy', { recoveryRedFlags: ['heavy-bleeding'] })).toEqual([]);
  });

  it('contraception: an overdue injection comes first; due today ranks with the tasks, soon as a heads-up', () => {
    const overdue = contraceptionRows('injection', { next: '2026-11-20' }, NOW);
    expect(overdue).toEqual([expect.objectContaining({ id: 'method-injection', overdue: true, urgent: true })]);
    expect(ids('contraception', { ...busy, contraceptionDue: overdue })[0]).toBe('method-injection');

    const today = contraceptionRows('injection', { next: '2026-11-23' }, NOW);
    expect(today[0].overdue).toBeUndefined();
    expect(ids('contraception', { ...busy, contraceptionDue: today })).toEqual(
      ['visit-today', 'doctor-note', 'flagged-results', 'method-injection', 'medicine-due', 'medicine-supply', 'visit-soon', 'setup'],
    );
    const soon = contraceptionRows('injection', { next: '2026-11-26' }, NOW);
    expect(ids('contraception', { ...busy, contraceptionDue: soon }).indexOf('method-injection'))
      .toBeGreaterThan(ids('contraception', { ...busy, contraceptionDue: soon }).indexOf('medicine-due'));
  });

  it('several urgent rows keep their own order: results, warning signs, injection', () => {
    const rows = ids('postpartum', { urgentResults: ['Haemoglobin'], recoveryRedFlags: ['heavy-bleeding'], appointmentToday: at(0, 14) });
    expect(rows).toEqual(['urgent-result', 'recovery-red-flag', 'visit-today']);
  });
});

describe('Today ranking: time-bound before nudges', () => {
  it('today > later this week > nudges, whatever order the signals arrive in', () => {
    expect(ids('pregnancy', {
      setup: { done: 1, total: 3 },
      lastMoodCheck: null,
      nextVisit: at(2),
      medicinesRunningOut: [{ name: 'Iron', label: 'Iron runs out in 2 days' }],
      vaccinesDue: ['Tdap'],
      medicinesDue: [{ name: 'Folic acid', time: '08:00' }],
    })).toEqual(['medicine-due', 'vaccination-due', 'medicine-supply', 'visit-soon', 'mood-check', 'setup']);
  });

  it('IVF: today\'s clinic date with the tasks, tomorrow\'s as a heads-up', () => {
    expect(ids('ivf', {
      lastMoodLog: null,
      ivfDates: [
        { key: 'transfer', label: 'Embryo transfer', daysUntil: 1 },
        { key: 'scan', label: 'Monitoring scan', daysUntil: 0 },
      ],
    })).toEqual(['ivf-scan', 'ivf-transfer', 'mood-weekly']);
  });

  it('the shown list is the first MAX_TODAY of the ranked list', () => {
    const all = rankedTodayItems('menstrual-cycle', { now: NOW, ...busy, urgentResults: ['TSH'] });
    expect(all.length).toBeGreaterThan(MAX_TODAY);
    expect(todayItems('menstrual-cycle', { now: NOW, ...busy, urgentResults: ['TSH'] })).toEqual(all.slice(0, MAX_TODAY));
  });

  it('every urgent label fits one 60-character row', () => {
    const rows = rankedTodayItems('postpartum', { now: NOW, urgentResults: ['Thyroid stimulating hormone (TSH), third generation assay'], recoveryRedFlags: ['heavy-bleeding'] });
    for (const r of rows) expect(r.label.length).toBeLessThanOrEqual(60);
  });
});
