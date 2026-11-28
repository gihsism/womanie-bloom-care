import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { formatTime, formatTimeSeconds, TIME_FMT } from './timeFormat';

describe('formatTime', () => {
  it('writes 24-hour HH:mm', () => {
    expect(formatTime(new Date(2026, 11, 3, 14, 30))).toBe('14:30');
    expect(formatTime(new Date(2026, 11, 3, 9, 5))).toBe('09:05');
    expect(formatTime(new Date(2026, 11, 3, 0, 0))).toBe('00:00');
    expect(formatTimeSeconds(new Date(2026, 11, 3, 14, 30, 7))).toBe('14:30:07');
    expect(TIME_FMT).toBe('HH:mm');
  });

  it('reads ISO strings and timestamps, and returns "" for nothing', () => {
    expect(formatTime('2026-12-03T18:45:00')).toBe('18:45');
    expect(formatTime(new Date(2026, 0, 1, 23, 59).getTime())).toBe('23:59');
    expect(formatTime(null)).toBe('');
    expect(formatTime('')).toBe('');
    expect(formatTime('not a date')).toBe('');
  });
});

describe('no 12-hour or phone-locale times left in the app', () => {
  // 'p' / 'pp' / 'Pp' (date-fns locale time: "2:30 PM"), h:mm / 'a'
  // patterns, hour12, and toLocaleTimeString (follows the phone, "2:30 PM"
  // on a US one) all read differently from "14:30". Intl formatters pinned
  // to hourCycle 'h23' (IVF clinic times, slot picker) are fine.
  const LOCALE_TIME_PATTERN = /format\([^;]*?,\s*[`'"][^`'"]*(\bp{1,4}\b|\bP+p+\b|\bh{1,2}:mm\b|:mm\s*a{1,5}\b)/;
  const TO_LOCALE_TIME = /toLocaleTimeString\(/;
  const HOUR12 = /hour12\s*:\s*true/;
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) files.push(p);
    }
  };
  walk('src');
  const read = (f: string) => readFileSync(f, 'utf8');

  it('the scan catches what it should', () => {
    expect(LOCALE_TIME_PATTERN.test("format(when, 'p')")).toBe(true);
    expect(LOCALE_TIME_PATTERN.test('format(when, `d MMM, p`)')).toBe(true);
    expect(LOCALE_TIME_PATTERN.test("format(when, 'h:mm a')")).toBe(true);
    expect(LOCALE_TIME_PATTERN.test("format(when, 'PPp')")).toBe(true);
    expect(LOCALE_TIME_PATTERN.test("format(when, 'd MMM, HH:mm')")).toBe(false);
    expect(LOCALE_TIME_PATTERN.test("format(when, 'EEE d MMM')")).toBe(false);
  });

  it('no date-fns pattern writes a 12-hour or locale time', () => {
    expect(files.filter(f => LOCALE_TIME_PATTERN.test(read(f)))).toEqual([]);
  });

  it('no on-screen time follows the phone language', () => {
    expect(files.filter(f => TO_LOCALE_TIME.test(read(f)))).toEqual([]);
  });

  it('no formatter asks for a 12-hour clock', () => {
    expect(files.filter(f => HOUR12.test(read(f)))).toEqual([]);
  });
});
