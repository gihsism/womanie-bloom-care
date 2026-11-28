import { describe, it, expect } from 'vitest';
import { nextVaccine, latestWeight } from './babyHomeExtras';

const at = (ymd: string) => new Date(`${ymd}T12:00:00`);
const mark = (id: string, dose: string, on: string) => ({ id, occurred_at: at(on).toISOString(), data: { name: dose, dose } });

describe('Home baby card: next vaccine', () => {
  // Born 1 June 2026 (outside the RSV season: RSV antibody on 1 October).
  const birth = '2026-06-01';
  it('the visit due earliest, with how many more vaccines it has', () => {
    expect(nextVaccine(birth, [], at('2026-07-15'))).toEqual({ what: '6-in-1 vaccine + 2 more', when: 'due 1 Aug' });
  });
  it('a date already reached reads "due now"', () => {
    expect(nextVaccine(birth, [], at('2026-08-03'))?.when).toBe('due now');
  });
  it('doses marked done drop out; then the next visit', () => {
    const done = [mark('a', 'hexa-1', '2026-08-02'), mark('b', 'pcv-1', '2026-08-02'), mark('c', 'rota-1', '2026-08-02')];
    expect(nextVaccine(birth, done, at('2026-08-03'))).toEqual({ what: 'Meningococcal B vaccine', when: 'due 1 Sep' });
  });
  it('a date next year carries the year; no birth date or nothing left = no line', () => {
    // Born in the RSV season: the antibody is due from the birth day.
    expect(nextVaccine('2026-11-01', [], at('2026-11-02'))).toEqual({ what: 'RSV antibody', when: 'due now' });
    expect(nextVaccine('2026-11-01', [mark('r', 'rsv-1', '2026-11-02')], at('2026-11-20')))
      .toEqual({ what: '6-in-1 vaccine + 2 more', when: 'due 1 Jan 2027' });
    expect(nextVaccine(null, [], at('2026-07-15'))).toBeNull();
    const all = ['rsv-1', 'hexa-1', 'pcv-1', 'rota-1', 'menb-1', 'hexa-2', 'pcv-2', 'rota-2', 'menb-2', 'mmrv-1', 'hexa-3', 'pcv-3', 'mmrv-2', 'menb-3', 'acwy-1']
      .map((d, i) => mark(`m${i}`, d, '2027-06-01'));
    expect(nextVaccine(birth, all, at('2027-12-01'))).toBeNull();
  });
});

describe('Home baby card: latest weight', () => {
  const g = (id: string, ymd: string, weight_g: number | null) => ({ id, occurred_at: at(ymd).toISOString(), data: JSON.stringify({ weight_g, length_cm: 50 }) });
  it('the latest weight with its WHO percentile and date', () => {
    const rows = [g('1', '2026-06-01', 3232), g('2', '2026-05-31', 9000)];
    expect(latestWeight('2026-06-01', 'female', rows, at('2026-06-02'))).toEqual({ weight: '3.2 kg', percentile: '50th percentile', on: '1 Jun' });
  });
  it('skips a measurement without a weight; no percentile without sex or birth date', () => {
    const rows = [g('1', '2026-06-20', null), g('2', '2026-06-10', 4000)];
    expect(latestWeight('2026-06-01', null, rows, at('2026-06-21'))).toEqual({ weight: '4.0 kg', percentile: null, on: '10 Jun' });
    expect(latestWeight(null, 'male', rows, at('2026-06-21'))?.percentile).toBeNull();
    expect(latestWeight('2026-06-01', 'female', [], at('2026-06-21'))).toBeNull();
  });
});
