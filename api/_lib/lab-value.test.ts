import { describe, it, expect } from 'vitest';
import {
  parseLabValue, parseLabRange, labNumber, readNumber, inferNumberStyle,
  numberStylesByDocument, storedNumberStyle, plausibleWindow, type LabParseContext,
} from './lab-value';

// All strings below are invented, in the style of Swiss lab reports
// (Unilabs, Synlab, Viollier, Dr Risch). No patient data.

type V = [raw: string, ctx: LabParseContext, value: number | null, check: boolean];

describe('parseLabValue: numbers', () => {
  const cases: V[] = [
    // decimal comma (Swiss/German)
    ['1,25', {}, 1.25, false],
    ['0,5', {}, 0.5, false],
    ['12,5', {}, 12.5, false],
    ['4,35', { title: 'TSH', unit: 'mU/l' }, 4.35, false],
    ['0,125', {}, 0.125, false],
    ['132', { title: 'Hämoglobin', unit: 'g/l' }, 132, false],
    // decimal point
    ['4.5', {}, 4.5, false],
    ['0.75', {}, 0.75, false],
    ['13.2', { title: 'Hemoglobin', unit: 'g/dL' }, 13.2, false],
    // thousands with apostrophe / space (Swiss)
    ["1'250", {}, 1250, false],
    ['1’250', {}, 1250, false],
    ['12 500', {}, 12500, false],
    ['1\u00a0250', {}, 1250, false],
    ["1'250,5", {}, 1250.5, false],
    ["245'000", { title: 'Platelets', unit: '/µl' }, 245000, false],
    // both separators: last one is the decimal mark
    ['1.250,5', {}, 1250.5, false],
    ['1,250.5', {}, 1250.5, false],
    ['1,250,000', {}, 1250000, false],
    ['1.250.000', {}, 1250000, false],
    // the ambiguous "1,250": document style decides
    ['1,250', { style: 'point' }, 1250, false],
    ['1,250', { style: 'comma' }, 1.25, false],
    ['1.250', { style: 'comma' }, 1250, false],
    ['1.250', { style: 'point' }, 1.25, false],
    // ... else the test's plausible window decides
    ['1,250', { title: 'TSH', unit: 'mU/L' }, 1.25, false],
    ['2,150', { title: 'Estradiol', unit: 'pmol/l' }, 2150, false],
    ['1,250', { title: 'Ferritin', unit: 'µg/L' }, 1.25, false], // 1250 is outside 1-1000
    ['1,250', { title: 'Leukozyten', unit: '/µl' }, 1250, false], // 1.25 per µl is impossible
    ['1.250', {}, 1.25, false], // a point with no context = decimal
    // ... else flag it
    ['1,250', {}, 1.25, true],
    ['3,500', { title: 'Unknown marker' }, 3.5, true],
    // implausible for the chosen reading: flagged, not changed
    ['1,250', { style: 'comma', title: 'Platelets', unit: '/µL' }, 1.25, true],
    ['8500', { title: 'TSH', unit: 'mU/L' }, 8500, true],
    // trailing flags and units
    ['12,5 H', {}, 12.5, false],
    ['3.4 ng/mL', {}, 3.4, false],
    ['45*', {}, 45, false],
    ['-2,1', {}, -2.1, false],
    ['−0.5', {}, -0.5, false],
  ];
  it.each(cases)('%s %j -> %s (check %s)', (raw, ctx, value, check) => {
    const p = parseLabValue(raw, ctx);
    expect(p.value).toBe(value);
    expect(p.check).toBe(check);
  });

  it('gives both readings when ambiguous', () => {
    const p = parseLabValue('1,250');
    expect(p.alternatives).toEqual([1.25, 1250]);
    expect(p.reason).toMatch(/1\.25 or 1250/);
  });

  it('accepts numbers and empties', () => {
    expect(parseLabValue(7.5).value).toBe(7.5);
    expect(parseLabValue(null).kind).toBe('none');
    expect(parseLabValue('').kind).toBe('none');
    expect(parseLabValue('siehe Kommentar').kind).toBe('none');
    expect(parseLabValue(Number.NaN).value).toBeNull();
  });
});

describe('parseLabValue: bounds', () => {
  const cases: Array<[string, number, string]> = [
    ['<5', 5, '<'],
    ['< 0,5', 0.5, '<'],
    ['<0.1', 0.1, '<'],
    ['>100', 100, '>'],
    ["> 1'000", 1000, '>'],
    ['≤ 3,0', 3, '<='],
    ['≥90', 90, '>='],
    ['bis 5', 5, '<='],
    ['unter 0,3', 0.3, '<'],
    ['kleiner 2', 2, '<'],
    ['über 60', 60, '>'],
  ];
  it.each(cases)('%s -> %s %s', (raw, value, comparator) => {
    const p = parseLabValue(raw);
    expect(p.kind).toBe('bound');
    expect(p.value).toBe(value);
    expect(p.comparator).toBe(comparator);
  });
});

describe('parseLabValue: qualitative', () => {
  const cases: Array<[string, 'negative' | 'positive']> = [
    ['negativ', 'negative'], ['Negativ', 'negative'], ['neg.', 'negative'],
    ['nicht nachweisbar', 'negative'], ['not detected', 'negative'], ['négatif', 'negative'],
    ['positiv', 'positive'], ['schwach positiv', 'positive'], ['Positive', 'positive'],
    ['nachweisbar', 'positive'], ['reaktiv', 'positive'], ['positif', 'positive'],
  ];
  it.each(cases)('%s -> %s', (raw, q) => {
    const p = parseLabValue(raw);
    expect(p.kind).toBe('qualitative');
    expect(p.qualitative).toBe(q);
    expect(labNumber(raw)).toBeNull();
  });
});

type R = [raw: string, ctx: LabParseContext, low: number | null, high: number | null];

describe('parseLabRange', () => {
  const cases: R[] = [
    ['11.5-15.0', {}, 11.5, 15],
    ['5,0 - 7,0', {}, 5, 7],
    ['5.0–7.0', {}, 5, 7],
    ['0,27 – 4,20', {}, 0.27, 4.2],
    ['3,5 bis 5,0', {}, 3.5, 5],
    ["150'000 - 400'000", {}, 150000, 400000],
    ['150 000 - 400 000', {}, 150000, 400000],
    ['150,000-400,000', { style: 'point' }, 150000, 400000],
    ['0,5-1,250', {}, 0.5, 1.25], // the range's own "0,5" sets the style
    ['1,250-2,500', { style: 'point' }, 1250, 2500],
    ['15 to 150', {}, 15, 150],
    ['-2 - 3', {}, -2, 3],
    ['<5', {}, null, 5],
    ['< 0,5', {}, null, 0.5],
    ['≤ 34', {}, null, 34],
    ['bis 5', {}, null, 5],
    ['unter 200', {}, null, 200],
    ['>35', {}, 35, null],
    ['> 60', {}, 60, null],
    ['über 50', {}, 50, null],
    ['Referenzbereich: 15 - 150', {}, 15, 150],
    ['Referenzbereich 0,40-4,00', {}, 0.4, 4],
    ['Norm: < 5,0', {}, null, 5],
    ['Normbereich: 3,9 – 5,8', {}, 3.9, 5.8],
    ['Normal 120-160', {}, 120, 160],
    ['Ref. 4.0 - 10.0', {}, 4, 10],
    ['Valeurs de référence: 0,3 - 4,2', {}, 0.3, 4.2],
    // sex-specific: hers is the female range
    ['F: 15-150 / M: 30-400', { sex: 'female' }, 15, 150],
    ['M: 30-400; F: 15-150', { sex: 'female' }, 15, 150],
    ['Frauen 120-160, Männer 140-180', { sex: 'female' }, 120, 160],
    ['w: 12,0-16,0 m: 14,0-18,0', { sex: 'female' }, 12, 16],
    ['Männer: 140 - 180 g/l | Frauen: 120 - 160 g/l', { sex: 'female' }, 120, 160],
    ['Referenzbereich: Frauen 13-150, Männer 30-400', { sex: 'female' }, 13, 150],
    ['H: 30-400 / F: 15-150', { sex: 'female' }, 15, 150],
    ['female: <0.8 male: <1.2', { sex: 'female' }, null, 0.8],
    ['weiblich: 0,5 - 1,0', {}, 0.5, 1],
    ['F: 15-150 / M: 30-400', { sex: 'male' }, 30, 400],
  ];
  it.each(cases)('%s %j -> %s..%s', (raw, ctx, low, high) => {
    const r = parseLabRange(raw, ctx);
    expect(r).not.toBeNull();
    expect(r!.low).toBe(low);
    expect(r!.high).toBe(high);
  });

  it('marks sex-specific picks', () => {
    expect(parseLabRange('F: 15-150 / M: 30-400', { sex: 'female' })!.sexSpecific).toBe(true);
    expect(parseLabRange('15-150')!.sexSpecific).toBe(false);
    // "mmol" never reads as a male label
    expect(parseLabRange('3,5-5,1 mmol/l')).toMatchObject({ low: 3.5, high: 5.1, sexSpecific: false });
  });

  it('reads qualitative ranges', () => {
    expect(parseLabRange('negativ')!.qualitative).toBe('negative');
    expect(parseLabRange('Norm: negativ')!.qualitative).toBe('negative');
    expect(parseLabRange('nicht nachweisbar')!.qualitative).toBe('negative');
  });

  it('returns null for unreadable ranges (show the text instead)', () => {
    for (const s of ['siehe Kommentar', 'see comment', 'Range see comment', 'vgl. Befund', '', '   ']) {
      expect(parseLabRange(s)).toBeNull();
    }
    expect(parseLabRange(null)).toBeNull();
  });

  it('flags an ambiguous bound and reversed bounds', () => {
    expect(parseLabRange('1,250-2,500')!.check).toBe(true);
    expect(parseLabRange('150,000-400,000')!.check).toBe(true);
    expect(parseLabRange('150-15')).toMatchObject({ low: 15, high: 150, check: true });
  });
});

describe('readNumber', () => {
  it('rejects malformed groupings', () => {
    expect(readNumber('1,2,3')).toBeNull();
    expect(readNumber('12.34,5')).toBeNull();
  });
  it('reads a leading separator', () => {
    expect(readNumber(',5')!.value).toBe(0.5);
  });
});

describe('plausibleWindow', () => {
  it('uses the unit, accepting micro spellings', () => {
    for (const u of ['µg/L', 'μg/l', 'ug/L', 'mcg/L', 'ng/ml']) expect(plausibleWindow('Ferritin', u)).toEqual({ min: 1, max: 1000 });
    expect(plausibleWindow('Hemoglobin', 'g/dL')).toEqual({ min: 5, max: 20 });
    expect(plausibleWindow('Hämoglobin', 'g/l')).toEqual({ min: 50, max: 200 });
    expect(plausibleWindow('TSH', 'mIU/L')).toEqual({ min: 0.01, max: 100 });
  });
  it('no opinion on unknown tests or units', () => {
    expect(plausibleWindow('Lipase', 'U/L')).toBeNull();
    expect(plausibleWindow('Ferritin', 'mmol/L')).toBeNull();
    expect(plausibleWindow('Hemoglobin A1c', '%')).toEqual({ min: 3, max: 20 });
  });
});

describe('inferNumberStyle', () => {
  it('reads the document style from its own strings', () => {
    // Viollier-style Swiss report
    expect(inferNumberStyle(['132', '4,35', '0,27 – 4,20', '1,250'])).toBe('comma');
    // English report
    expect(inferNumberStyle(['13.2', '1,250', '0.4-4.0'])).toBe('point');
    // only ambiguous / integers
    expect(inferNumberStyle(['1,250', '132'])).toBeNull();
    // German words, no unambiguous number -> Swiss default
    expect(inferNumberStyle(['1,250', 'Referenzbereich 30 - 400'])).toBe('comma');
    expect(inferNumberStyle(["245'000"])).toBe('comma');
    expect(inferNumberStyle([null, 5, undefined])).toBeNull();
  });

  it('groups by document and prefers the stored style', () => {
    const styles = numberStylesByDocument([
      { document_id: 'a', value: '1,250', reference_range: '0,5-2,0' },
      { document_id: 'b', value: '1,250', reference_range: '30 - 400', raw_data: { number_style: 'point' } },
      { document_id: 'c', value: '1,250', reference_range: null },
      { document_id: null, value: '1,5' },
    ]);
    expect(styles.get('a')).toBe('comma');
    expect(styles.get('b')).toBe('point');
    expect(styles.get('c')).toBeNull();
    expect(styles.size).toBe(3);
    expect(storedNumberStyle('{"number_style":"comma"}')).toBe('comma');
    expect(storedNumberStyle('not json')).toBeNull();
  });
});

describe('Swiss report rows end to end', () => {
  // Invented rows, each document read with its inferred style.
  const unilabs = [
    { title: 'Ferritin', value: '1.250', unit: 'µg/l', reference_range: '13 - 150' },
    { title: 'TSH', value: '2,15', unit: 'mU/l', reference_range: '0,27 - 4,20' },
    { title: 'Hämoglobin', value: '128', unit: 'g/l', reference_range: 'w: 120-160 m: 140-180' },
    { title: 'Thrombozyten', value: "265'000", unit: '/µl', reference_range: "150'000 - 400'000" },
  ];
  const english = [
    { title: 'Estradiol', value: '1,250', unit: 'pmol/L', reference_range: '45-1,400' },
    { title: 'Hemoglobin', value: '13.1', unit: 'g/dL', reference_range: 'F: 12.0-15.5 / M: 13.5-17.5' },
  ];
  it('Swiss document: decimal comma, apostrophe thousands, her range', () => {
    const style = inferNumberStyle(unilabs.flatMap(r => [r.value, r.reference_range]));
    expect(style).toBe('comma');
    const v = unilabs.map(r => parseLabValue(r.value, { style, title: r.title, unit: r.unit }));
    // "1.250" in a decimal-comma report reads as 1250, which is beyond any
    // ferritin a lab prints: kept, but flagged for a check (could be 1.25)
    expect(v.map(x => x.value)).toEqual([1250, 2.15, 128, 265000]);
    expect(v[0].alternatives).toEqual([1.25, 1250]);
    expect(v.map(x => x.check)).toEqual([true, false, false, false]);
    expect(parseLabRange(unilabs[2].reference_range, { style, sex: 'female' })).toMatchObject({ low: 120, high: 160 });
  });
  it('English document: comma thousands', () => {
    const style = inferNumberStyle(english.flatMap(r => [r.value, r.reference_range]));
    expect(style).toBe('point');
    expect(parseLabValue(english[0].value, { style, title: 'Estradiol', unit: 'pmol/L' }).value).toBe(1250);
    expect(parseLabRange(english[0].reference_range, { style })).toMatchObject({ low: 45, high: 1400 });
    expect(parseLabRange(english[1].reference_range, { style, sex: 'female' })).toMatchObject({ low: 12, high: 15.5 });
  });
});
