import { describe, it, expect } from 'vitest';
import {
  cycleDay,
  medicineLine,
  moodSummary,
  flaggedResults,
  isFlagged,
  normalizePatientTab,
  pregnancyWeek,
  statusRank,
  visitSummary,
} from './doctorPatient';

const NOW = Date.parse('2026-11-23T12:00:00Z');

describe('statusRank / isFlagged', () => {
  it('ranks critical above high/low/abnormal above borderline above normal', () => {
    expect(statusRank('Critical')).toBe(0);
    expect(statusRank('LOW')).toBe(1);
    expect(statusRank('borderline')).toBe(2);
    expect(statusRank(null)).toBe(3);
    expect(isFlagged('high')).toBe(true);
    expect(isFlagged('borderline')).toBe(false);
  });
});

describe('flaggedResults', () => {
  it('keeps only the newest reading per test and sorts by urgency', () => {
    const rows = [
      { id: '1', title: 'TSH', status: 'high', date_recorded: '2026-01-01' },
      { id: '2', title: 'tsh ', status: 'normal', date_recorded: '2026-06-01' },
      { id: '3', title: 'Ferritin', status: 'low', date_recorded: '2026-05-01' },
      { id: '4', title: 'Potassium', status: 'critical', date_recorded: '2026-02-01' },
      { id: '5', title: 'Vitamin D', status: 'low', date_recorded: '2026-07-01' },
    ];
    expect(flaggedResults(rows).map(r => r.id)).toEqual(['4', '5', '3']);
  });
});

describe('flaggedResults matches tests like the patient screens (labFlags)', () => {
  it('merges titles that differ only in spacing, so the newer normal reading wins', () => {
    const rows = [
      { id: '1', title: 'Free  T4', status: 'abnormal', date_recorded: '2026-01-01' },
      { id: '2', title: 'free t4', status: 'normal', date_recorded: '2026-06-01' },
    ];
    expect(flaggedResults(rows)).toEqual([]);
  });
});

describe('pregnancyWeek', () => {
  it('derives the week from the due date', () => {
    // 112 days to due -> (280-112)/7 = 24
    const due = new Date(NOW + 112 * 86_400_000).toISOString();
    expect(pregnancyWeek(due, NOW)).toEqual({ week: 24, daysToDue: 112 });
    expect(pregnancyWeek('nonsense', NOW)).toBeNull();
    expect(pregnancyWeek(null, NOW)).toBeNull();
  });
});

describe('visitSummary', () => {
  it('finds the last visit that happened and the next booked one', () => {
    const visits = [
      { id: 'a', scheduled_at: '2026-10-01T09:00:00Z', status: 'completed' },
      { id: 'b', scheduled_at: '2026-11-20T09:00:00Z', status: 'no_show' },
      { id: 'c', scheduled_at: '2026-11-25T09:00:00Z', status: 'cancelled' },
      { id: 'd', scheduled_at: '2026-12-02T09:00:00Z', status: 'scheduled' },
      { id: 'e', scheduled_at: '2026-11-30T09:00:00Z', status: 'scheduled' },
    ];
    const { last, next } = visitSummary(visits, NOW);
    expect(last?.id).toBe('a');
    expect(next?.id).toBe('e');
  });
});

describe('normalizePatientTab', () => {
  it('accepts new names and maps old deep links', () => {
    expect(normalizePatientTab('documents')).toBe('documents');
    expect(normalizePatientTab('labs')).toBe('results');
    expect(normalizePatientTab('overview')).toBe('summary');
    expect(normalizePatientTab('health')).toBe('summary');
    expect(normalizePatientTab('bogus')).toBeNull();
  });
});


describe('cycleDay', () => {
  const now = Date.parse('2026-11-25T12:00:00Z');
  it('counts the first day of the latest period as day 1', () => {
    expect(cycleDay([{ period_start_date: '2026-10-20' }, { period_start_date: '2026-11-25' }], 'menstrual-cycle', now)).toBe(1);
    expect(cycleDay([{ period_start_date: '2026-11-12' }], null, now)).toBe(14);
  });
  it('is null for stages without a cycle, nothing logged, or a stale period', () => {
    expect(cycleDay([{ period_start_date: '2026-11-12' }], 'pregnancy', now)).toBeNull();
    expect(cycleDay([{ period_start_date: '2026-11-12' }], 'menopause', now)).toBeNull();
    expect(cycleDay([], 'menstrual-cycle', now)).toBeNull();
    expect(cycleDay([{ period_start_date: '2026-08-01' }], 'menstrual-cycle', now)).toBeNull();
    expect(cycleDay([{ period_start_date: 'junk' }], 'menstrual-cycle', now)).toBeNull();
  });
  it('ignores a future-dated start', () => {
    expect(cycleDay([{ period_start_date: '2026-11-12' }, { period_start_date: '2026-12-10' }], 'conception', now)).toBe(14);
  });
});

describe('moodSummary', () => {
  it('counts days, not mentions, and ranks low moods', () => {
    const m = moodSummary([
      { mood: ['sad', 'anxious'] },
      { mood: ['anxious', 'anxious'] },
      { mood: ['happy'] },
      { mood: null },
      { mood: [] },
    ]);
    expect(m.loggedDays).toBe(3);
    expect(m.lowDays).toBe(2);
    expect(m.low).toEqual([
      { key: 'anxious', label: 'Anxious', days: 2 },
      { key: 'sad', label: 'Sad', days: 1 },
    ]);
    expect(m.needsAttention).toBe(false);
  });
  it('marks the row from 5 low-mood days', () => {
    const five = Array.from({ length: 5 }, () => ({ mood: ['sad'] }));
    expect(moodSummary(five).needsAttention).toBe(true);
    expect(moodSummary(five.slice(1)).needsAttention).toBe(false);
  });
});

describe('medicineLine', () => {
  it('joins name, dose and frequency when known', () => {
    expect(medicineLine({ name: 'Iron', dose: '50 mg', times_per_day: 2 })).toBe('Iron 50 mg, 2× a day');
    expect(medicineLine({ name: 'Vitamin D ', dose: null, times_per_day: null })).toBe('Vitamin D');
    expect(medicineLine({ name: 'Folic acid', dose: '', times_per_day: 0 })).toBe('Folic acid');
  });
});
