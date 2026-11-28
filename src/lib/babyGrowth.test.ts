import { describe, it, expect } from 'vitest';
import {
  ageInDays, ageLabel, curveRows, DAYS_PER_MONTH, latestLine, lmsAt, normalCdf, normaliseSex, parseWeight,
  percentilePhrase, weightAtZ, weightPercentile, weightPoints, CURVES,
} from './babyGrowth';

// WHO Child Growth Standards, weight-for-age, simplified monthly tables
// (https://www.who.int/tools/child-growth-standards/standards/weight-for-age):
// median M at 0, 6, 12, 24 months.
const WHO_MEDIAN = {
  female: { 0: 3.2322, 6: 7.2970, 12: 8.9481, 24: 11.4775 },
  male: { 0: 3.3464, 6: 7.9340, 12: 9.6479, 24: 12.1515 },
} as const;
// WHO percentile tables at birth (kg, one decimal as published): P3, P15, P50, P85, P97.
const WHO_BIRTH_PCT = { female: [2.4, 2.8, 3.2, 3.7, 4.2], male: [2.5, 2.9, 3.3, 3.9, 4.3] } as const;

describe('WHO weight-for-age LMS', () => {
  for (const sex of ['female', 'male'] as const) {
    for (const [m, median] of Object.entries(WHO_MEDIAN[sex])) {
      it(`${sex} median at ${m} months is ${median} kg`, () => {
        const lms = lmsAt(sex, Number(m) * DAYS_PER_MONTH)!;
        expect(Math.abs(lms.M - median)).toBeLessThan(0.01);
        expect(weightPercentile(sex, Number(m) * DAYS_PER_MONTH, median)!).toBeCloseTo(50, 0);
      });
    }
    it(`${sex} birth percentile curves match the WHO table`, () => {
      const lms = lmsAt(sex, 0)!;
      CURVES.forEach((c, i) => expect(Math.round(weightAtZ(c.z, lms) * 10) / 10).toBe(WHO_BIRTH_PCT[sex][i]));
    });
  }
  it('girls exact birth row: L 0.3809, M 3.2322, S 0.14171', () => {
    expect(lmsAt('female', 0)).toEqual({ L: 0.3809, M: 3.2322, S: 0.14171 });
  });
  it('is undefined outside birth to 24 months', () => {
    expect(lmsAt('male', -1)).toBeNull();
    expect(lmsAt('male', 800)).toBeNull();
    expect(weightPercentile('male', 900, 12)).toBeNull();
  });
  it('z and weight are inverse', () => {
    const lms = lmsAt('female', 56)!;
    for (const z of [-2, -1, 0, 0.5, 2]) {
      const w = weightAtZ(z, lms);
      expect(normalCdf(z) * 100).toBeCloseTo(weightPercentile('female', 56, w)!, 6);
    }
  });
  it('normal CDF', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 7);
    expect(normalCdf(1.880794)).toBeCloseTo(0.97, 4);
    expect(normalCdf(-1.036433)).toBeCloseTo(0.15, 4);
  });
  it('curve rows run from birth to the end of the range, in order', () => {
    const rows = curveRows('male', 100);
    expect(rows[0].day).toBe(0);
    expect(rows[rows.length - 1].day).toBe(100);
    for (const r of rows) expect(r.p3 < r.p15 && r.p15 < r.p50 && r.p50 < r.p85 && r.p85 < r.p97).toBe(true);
  });
});

describe('words', () => {
  it('ages read like a baby booklet', () => {
    expect(ageLabel(0)).toBe('0 days');
    expect(ageLabel(1)).toBe('1 day');
    expect(ageLabel(13)).toBe('13 days');
    expect(ageLabel(56)).toBe('8 weeks');
    expect(ageLabel(97)).toBe('13 weeks');
    expect(ageLabel(98)).toBe('3 months');
    expect(ageLabel(365)).toBe('11 months');
    expect(ageLabel(366)).toBe('12 months');
  });
  it('percentile phrase', () => {
    expect(percentilePhrase(40.4)).toBe('around the 40th percentile');
    expect(percentilePhrase(1.2)).toBe('around the 1st percentile');
    expect(percentilePhrase(22)).toBe('around the 22nd percentile');
    expect(percentilePhrase(13)).toBe('around the 13th percentile');
    expect(percentilePhrase(0.4)).toBe('below the 1st percentile');
    expect(percentilePhrase(99.6)).toBe('above the 99th percentile');
  });
  it('latest line: "4.6 kg at 8 weeks, around the Nth percentile"', () => {
    expect(latestLine('female', 56, 4.6)).toMatch(/^4\.6 kg at 8 weeks, around the \d+(st|nd|rd|th) percentile$/);
    expect(latestLine('male', 0, 3.3464)).toBe('3.3 kg at 0 days, around the 50th percentile');
  });
  it('no judgement words anywhere', () => {
    const line = [latestLine('female', 56, 2.5), latestLine('male', 56, 9)].join(' ');
    expect(line).not.toMatch(/\b(normal|small|big|low|high|under|over|too)\b/i);
  });
  it('sex from what babies.sex may hold', () => {
    expect(normaliseSex('female')).toBe('female');
    expect(normaliseSex('Girl')).toBe('female');
    expect(normaliseSex('m')).toBe('male');
    expect(normaliseSex(null)).toBeNull();
    expect(normaliseSex('unknown')).toBeNull();
  });
});

describe('parseWeight', () => {
  it('kg and g, comma decimals', () => {
    expect(parseWeight('4.6', 'kg')).toEqual({ ok: true, kg: 4.6 });
    expect(parseWeight(' 4,62 ', 'kg')).toEqual({ ok: true, kg: 4.62 });
    expect(parseWeight('4620', 'g')).toEqual({ ok: true, kg: 4.62 });
  });
  it('0.5-25 kg only', () => {
    expect(parseWeight('0.4', 'kg').ok).toBe(false);
    expect(parseWeight('26', 'kg').ok).toBe(false);
    expect(parseWeight('4.6', 'g').ok).toBe(false);
    expect(parseWeight('4600', 'kg').ok).toBe(false);
    expect(parseWeight('', 'kg').ok).toBe(false);
    expect(parseWeight('abc', 'kg').ok).toBe(false);
    expect(parseWeight('-3', 'kg').ok).toBe(false);
  });
});

describe('weightPoints', () => {
  it('ages from the birth date, oldest first, only measurements with a weight in range', () => {
    const local = (iso: string) => iso.slice(0, 10);
    const pts = weightPoints('2026-01-01', [
      { occurred_at: '2026-02-26T12:00:00Z', data: { weight_g: 4600 } },
      { occurred_at: '2026-01-01T12:00:00Z', data: { weight_g: 3300 } },
      { occurred_at: '2026-01-10T12:00:00Z', data: { weight_g: null } },
      { occurred_at: '2025-12-30T12:00:00Z', data: { weight_g: 3000 } },
    ], local);
    expect(pts).toEqual([{ day: 0, kg: 3.3, on: '2026-01-01' }, { day: 56, kg: 4.6, on: '2026-02-26' }]);
    expect(ageInDays('2026-01-01', '2026-03-01')).toBe(59);
  });
});
