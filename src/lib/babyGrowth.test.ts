import { describe, it, expect } from 'vitest';
import {
  ageInDays, ageLabel, curveRows, DAYS_PER_MONTH, latestLine, lmsAt, measurePoints, normalCdf, normaliseSex, parseCm,
  parseWeight, percentileOf, percentilePhrase, weightAtZ, weightPercentile, weightPoints, CURVES,
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

// WHO Child Growth Standards, simplified monthly tables (median M, cm) at
// 0, 6, 12 and 24 months:
// length-for-age 0-2 years: https://www.who.int/tools/child-growth-standards/standards/length-height-for-age
// head circumference-for-age: https://www.who.int/tools/child-growth-standards/standards/head-circumference-for-age
const WHO_LENGTH_MEDIAN = {
  female: { 0: 49.1477, 6: 65.7311, 12: 74.0152, 24: 86.4153 },
  male: { 0: 49.8842, 6: 67.6236, 12: 75.7488, 24: 87.8161 },
} as const;
const WHO_HEAD_MEDIAN = {
  female: { 0: 33.8787, 6: 42.1995, 12: 44.8965, 24: 47.1822 },
  male: { 0: 34.4618, 6: 43.3306, 12: 46.0661, 24: 48.2509 },
} as const;
// WHO percentile tables at birth (cm, one decimal as published): P3, P15, P50, P85, P97.
const WHO_LENGTH_BIRTH_PCT = { female: [45.6, 47.2, 49.1, 51.1, 52.7], male: [46.3, 47.9, 49.9, 51.8, 53.4] } as const;
const WHO_HEAD_BIRTH_PCT = { female: [31.7, 32.7, 33.9, 35.1, 36.1], male: [32.1, 33.1, 34.5, 35.8, 36.9] } as const;

describe('WHO length-for-age and head-circumference-for-age LMS', () => {
  for (const [measure, medians, birthPct] of [
    ['length', WHO_LENGTH_MEDIAN, WHO_LENGTH_BIRTH_PCT],
    ['head', WHO_HEAD_MEDIAN, WHO_HEAD_BIRTH_PCT],
  ] as const) {
    for (const sex of ['female', 'male'] as const) {
      for (const [m, median] of Object.entries(medians[sex])) {
        it(`${measure} ${sex} median at ${m} months is ${median} cm`, () => {
          const lms = lmsAt(sex, Number(m) * DAYS_PER_MONTH, measure)!;
          expect(lms.L).toBe(1);
          expect(Math.abs(lms.M - median)).toBeLessThan(0.05);
          expect(percentileOf(measure, sex, Number(m) * DAYS_PER_MONTH, median)!).toBeCloseTo(50, 0);
        });
      }
      it(`${measure} ${sex} birth percentile curves match the WHO table`, () => {
        const lms = lmsAt(sex, 0, measure)!;
        CURVES.forEach((c, i) => expect(Math.round(weightAtZ(c.z, lms) * 10) / 10).toBe(birthPct[sex][i]));
      });
    }
  }
  it('exact birth rows: boys length 49.8842 cm (S 0.03795), girls head 33.8787 cm (S 0.03496)', () => {
    expect(lmsAt('male', 0, 'length')).toEqual({ L: 1, M: 49.8842, S: 0.03795 });
    expect(lmsAt('female', 0, 'head')).toEqual({ L: 1, M: 33.8787, S: 0.03496 });
  });
  it('day 731 (24 months) still reads as length, not standing height', () => {
    expect(lmsAt('male', 731, 'length')!.M).toBeCloseTo(87.8018, 4);
  });
  it('curves for length and head run in order and grow with age', () => {
    for (const measure of ['length', 'head'] as const) {
      const rows = curveRows('female', 731, 7, measure);
      for (const r of rows) expect(r.p3 < r.p15 && r.p15 < r.p50 && r.p50 < r.p85 && r.p85 < r.p97).toBe(true);
      for (let i = 1; i < rows.length; i++) expect(rows[i].p50).toBeGreaterThan(rows[i - 1].p50);
    }
  });
  it('latest line in cm, no judgement words', () => {
    expect(latestLine('male', 0, 49.8842, 'length')).toBe('49.9 cm at 0 days, around the 50th percentile');
    expect(latestLine('female', 56, 38.5, 'head')).toMatch(/^38\.5 cm at 8 weeks, around the \d+(st|nd|rd|th) percentile$/);
    const line = [latestLine('female', 56, 50, 'length'), latestLine('male', 56, 44, 'head')].join(' ');
    expect(line).not.toMatch(/\b(normal|small|big|low|high|under|over|too|short|tall)\b/i);
  });
});

describe('parseCm', () => {
  it('optional, comma decimals, one decimal kept', () => {
    expect(parseCm('', 'length')).toEqual({ ok: true, cm: null });
    expect(parseCm(' 57,54 ', 'length')).toEqual({ ok: true, cm: 57.5 });
    expect(parseCm('38', 'head')).toEqual({ ok: true, cm: 38 });
  });
  it('plausible ranges only', () => {
    expect(parseCm('24', 'length')).toEqual({ ok: false, error: 'Enter a length between 25 cm and 130 cm.' });
    expect(parseCm('131', 'length').ok).toBe(false);
    expect(parseCm('61', 'head')).toEqual({ ok: false, error: 'Enter a head circumference between 20 cm and 60 cm.' });
    expect(parseCm('abc', 'head').ok).toBe(false);
    expect(parseCm('-3', 'length').ok).toBe(false);
  });
});

describe('measurePoints', () => {
  it('reads length and head from the same records as weight', () => {
    const local = (iso: string) => iso.slice(0, 10);
    const events = [
      { occurred_at: '2026-02-26T12:00:00Z', data: { weight_g: 4600, length_cm: 57.5, head_cm: 38.5 } },
      { occurred_at: '2026-01-01T12:00:00Z', data: { weight_g: 3300, length_cm: null, head_cm: 34 } },
    ];
    expect(measurePoints('length', '2026-01-01', events, local)).toEqual([{ day: 56, value: 57.5, on: '2026-02-26' }]);
    expect(measurePoints('head', '2026-01-01', events, local).map(p => p.value)).toEqual([34, 38.5]);
    expect(measurePoints('weight', '2026-01-01', events, local).map(p => p.value)).toEqual([3.3, 4.6]);
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
