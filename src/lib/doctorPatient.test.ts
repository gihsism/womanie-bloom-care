import { describe, it, expect } from 'vitest';
import {
  patientStageKey,
  flaggedResults,
  isFlagged,
  normalizePatientTab,
  pregnancyWeek,
  safeDocumentUrl,
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

describe('safeDocumentUrl', () => {
  it('only lets https links through', () => {
    expect(safeDocumentUrl('https://x.public.blob.vercel-storage.com/a.pdf')).toBe('https://x.public.blob.vercel-storage.com/a.pdf');
    expect(safeDocumentUrl('javascript:alert(1)')).toBeNull();
    expect(safeDocumentUrl('http://example.com/a.pdf')).toBeNull();
    expect(safeDocumentUrl(null)).toBeNull();
  });
});

describe('patientStageKey', () => {
  it('maps stored stages and aliases to a colour set', () => {
    expect(patientStageKey('pregnancy')).toBe('pregnancy');
    expect(patientStageKey(' Pregnant ')).toBe('pregnancy');
    expect(patientStageKey('perimenopause')).toBe('menopause');
  });
  it('gives no chip for empty or unknown stages', () => {
    expect(patientStageKey(null)).toBeNull();
    expect(patientStageKey('')).toBeNull();
    expect(patientStageKey('something else')).toBeNull();
  });
});
