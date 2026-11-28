import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { formatDate, formatDayMonth, formatWeekdayDayMonth, formatDateTime, formatDayRange } from './dateFormat';

describe('one date format: day month year', () => {
  it('writes "3 Dec 2026" from a Date, an ISO instant, a bare day and a timestamp', () => {
    const d = new Date(2026, 11, 3, 9, 5);
    expect(formatDate(d)).toBe('3 Dec 2026');
    expect(formatDate('2026-12-03')).toBe('3 Dec 2026'); // a bare day is her local day, never shifted
    expect(formatDate(d.toISOString())).toBe('3 Dec 2026');
    expect(formatDate(d.getTime())).toBe('3 Dec 2026');
  });

  it('short forms keep day before month', () => {
    const d = new Date(2026, 11, 3, 9, 5);
    expect(formatDayMonth(d)).toBe('3 Dec');
    expect(formatWeekdayDayMonth(d)).toBe('Thu 3 Dec');
    expect(formatDateTime(d)).toBe('3 Dec 2026, 09:05');
  });

  it('a missing or unreadable date prints nothing instead of throwing', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
    expect(formatDate('')).toBe('');
    expect(formatDate('not a date')).toBe('');
  });

  it('day ranges name the month once, or both months across a boundary', () => {
    expect(formatDayRange(new Date(2026, 0, 18), new Date(2026, 0, 22))).toBe('18-22 Jan');
    expect(formatDayRange(new Date(2026, 0, 29), new Date(2026, 1, 4))).toBe('29 Jan-4 Feb');
    expect(formatDayRange(new Date(2026, 11, 30), new Date(2027, 0, 2))).toBe('30 Dec-2 Jan');
  });
});

describe('no month-first or phone-locale dates left in the app', () => {
  // "December 3, 2026", "Dec 3", 'PPP' ("December 3rd, 2026") and a bare
  // toLocaleDateString() (12/3/2026 on a US phone) all read differently
  // from "3 Dec 2026". Machine dates ('yyyy-MM-dd') are fine.
  const MONTH_FIRST = /format\([^;]*?,\s*['"`](PPP|M{3,4} d)/;
  // (A month-and-year label like "Member since November 2026" has no day to misorder.)
  const PHONE_LOCALE = /toLocaleDateString\((\)|(\[\]|undefined|'en-US')[^)]*\bday\b)/;
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) files.push(p);
    }
  };
  walk('src');

  it('no date-fns pattern starts with the month', () => {
    expect(files.filter(f => MONTH_FIRST.test(readFileSync(f, 'utf8')))).toEqual([]);
  });

  it('no on-screen date follows the phone language', () => {
    // AIDoctorChat builds the AI's context (not shown to her), so it may.
    const shown = files.filter(f => !f.endsWith('AIDoctorChat.tsx'));
    expect(shown.filter(f => PHONE_LOCALE.test(readFileSync(f, 'utf8')))).toEqual([]);
  });
});
