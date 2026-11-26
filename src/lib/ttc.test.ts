import { describe, it, expect } from 'vitest';
import {
  parseOpk, setOpkInNotes, setBbtInNotes, parseTypedBbt, fertileWindow, windowHeadline, cycleChartPoints,
  ttcDoctorAdvice, thresholdMonthsFor, monthsBetween, ttcStartFromDuration, ymd,
} from './ttc';
import { parseLH } from './ovulation';

const start = new Date(2026, 9, 1); // 1 Oct, cycle day 1
const day = (n: number) => ymd(new Date(2026, 9, n)); // cycle day n = Oct n

describe('OPK notes', () => {
  it('parses negative / positive / peak, and peak counts as positive for the ovulation model', () => {
    expect(parseOpk('Mood ok. LH test: peak')).toBe('peak');
    expect(parseOpk('LH test: negative')).toBe('negative');
    expect(parseOpk('LH test: not-tested')).toBeNull();
    expect(parseLH('LH test: peak')).toBe('positive');
  });
  it('replaces the segment without breaking a BBT decimal', () => {
    expect(setOpkInNotes('BBT: 36.6°C. LH test: negative', 'positive')).toBe('BBT: 36.6°C. LH test: positive');
    expect(setOpkInNotes('LH test: positive', null)).toBeNull();
    expect(setOpkInNotes(null, 'peak')).toBe('LH test: peak');
  });
  it('replaces the temperature without touching other segments', () => {
    expect(setBbtInNotes('BBT: 36.4°C. LH test: positive', 36.55)).toBe('LH test: positive. BBT: 36.55°C');
    expect(setBbtInNotes('BBT: 97.8°F', null)).toBeNull();
    expect(parseTypedBbt('36,6')).toBe(36.6);
    expect(parseTypedBbt('98.2')).toBeNull();
  });
});

describe('fertileWindow', () => {
  it('without tests: calendar prediction, 5 days before to 1 after', () => {
    const w = fertileWindow({ cycleStart: start, cycleLength: 28, signals: {}, today: new Date(2026, 9, 10) });
    expect(w.source).toBe('predicted');
    expect(ymd(w.predicted)).toBe(day(15)); // day 1 + 14
    expect(ymd(w.start)).toBe(day(10));
    expect(ymd(w.end)).toBe(day(16));
  });
  it('a positive OPK moves ovulation to the next day and shifts the window', () => {
    const signals = { [day(18)]: { notes: 'LH test: negative' }, [day(19)]: { notes: 'LH test: positive' } };
    const w = fertileWindow({ cycleStart: start, cycleLength: 28, signals, today: new Date(2026, 9, 19) });
    expect(w.source).toBe('opk');
    expect(ymd(w.ovulation)).toBe(day(20));
    expect(ymd(w.end)).toBe(day(21));
    expect(w.shiftDays).toBe(5);
    expect(windowHeadline(w, new Date(2026, 9, 19))).toMatch(/most fertile/);
  });
  it('a peak reading counts too; OPKs before cycle day 7 are ignored', () => {
    const early = fertileWindow({ cycleStart: start, cycleLength: 28, signals: { [day(3)]: { notes: 'LH test: positive' } }, today: new Date(2026, 9, 5) });
    expect(early.source).toBe('predicted');
    const peak = fertileWindow({ cycleStart: start, cycleLength: 28, signals: { [day(12)]: { notes: 'LH test: peak' } }, today: new Date(2026, 9, 12) });
    expect(ymd(peak.ovulation)).toBe(day(13));
  });
  it('a BBT rise confirms ovulation and closes the window', () => {
    const signals: Record<string, { notes: string }> = {};
    const temps = [36.3, 36.35, 36.3, 36.4, 36.3, 36.35, 36.3, 36.35, 36.3, 36.4, 36.3, 36.35, 36.6, 36.65, 36.7];
    temps.forEach((c, i) => { signals[day(i + 2)] = { notes: `BBT: ${c}°C` }; });
    signals[day(13)].notes += '. LH test: positive';
    const w = fertileWindow({ cycleStart: start, cycleLength: 28, signals, today: new Date(2026, 9, 17) });
    expect(w.source).toBe('confirmed');
    expect(w.confirmed).not.toBeNull();
    expect(windowHeadline(w, new Date(2026, 9, 17))).toMatch(/confirmed/);
    const pts = cycleChartPoints(start, signals, new Date(2026, 9, 17));
    expect(pts.temps).toHaveLength(15);
    expect(pts.opks).toEqual([{ day: 13, date: day(13), result: 'positive' }]);
  });
  it('uses her learned luteal length for the prediction', () => {
    const w = fertileWindow({ cycleStart: start, cycleLength: 30, lutealLength: 12, signals: {}, today: start });
    expect(ymd(w.predicted)).toBe(day(19));
    expect(windowHeadline(w, start)).toMatch(/starts in 13 days/);
  });
});

describe('when to see a doctor', () => {
  const now = new Date(2026, 10, 26);
  it('12 months under 35, 6 months from 35, straight away from 40', () => {
    expect(thresholdMonthsFor(null)).toBe(12);
    expect(thresholdMonthsFor(34)).toBe(12);
    expect(thresholdMonthsFor(35)).toBe(6);
    expect(thresholdMonthsFor(40)).toBe(0);
  });
  it('is due once the months are reached', () => {
    expect(ttcDoctorAdvice('2025-11-26', 30, now)).toMatchObject({ monthsTrying: 12, due: true });
    expect(ttcDoctorAdvice('2025-11-27', 30, now)).toMatchObject({ monthsTrying: 11, due: false, monthsLeft: 1 });
    expect(ttcDoctorAdvice('2026-05-26', 36, now)).toMatchObject({ monthsTrying: 6, due: true });
    expect(ttcDoctorAdvice('2026-06-01', 36, now)).toMatchObject({ due: false, monthsLeft: 1 });
  });
  it('no start date or a future one gives nothing', () => {
    expect(ttcDoctorAdvice(null, 30, now)).toBeNull();
    expect(ttcDoctorAdvice('2027-01-01', 30, now)).toBeNull();
  });
  it('monthsBetween is day-of-month aware', () => {
    expect(monthsBetween(new Date(2026, 0, 31), new Date(2026, 1, 28))).toBe(0);
    expect(monthsBetween(new Date(2026, 0, 15), new Date(2026, 1, 15))).toBe(1);
  });
  it('maps the onboarding answer to an approximate start', () => {
    expect(ttcStartFromDuration('over-year', now)).toBe('2025-10-26');
    expect(ttcStartFromDuration('just-started', now)).toBe('2026-11-26');
    expect(ttcStartFromDuration('', now)).toBeNull();
  });
});
