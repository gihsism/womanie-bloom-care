import { describe, it, expect } from 'vitest';
import { detectOvulation, learnLuteal, parseBbtC, parseLH, progesteroneConfirmsOvulation, type SignalLike } from './ovulation';

const d = (s: string) => { const [y, m, dd] = s.split('-').map(Number); return new Date(y, m - 1, dd); };
const ymd = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
const add = (s: string, n: number) => { const x = d(s); return ymd(new Date(x.getFullYear(), x.getMonth(), x.getDate() + n)); };

/** A cycle starting `start`, ovulating on cycle day `ovDay`, with chosen signals. */
function cycleSignals(start: string, ovDay: number, opts: { lh?: boolean; bbt?: boolean; mucus?: boolean; len?: number } = {}) {
  const sig: Record<string, SignalLike> = {};
  const len = opts.len ?? 28;
  for (let cd = 1; cd <= len; cd++) {
    const key = add(start, cd - 1);
    const notes: string[] = [];
    if (opts.bbt) notes.push(`BBT: ${cd <= ovDay ? (36.3 + (cd % 2) * 0.05).toFixed(2) : '36.70'}°C`);
    if (opts.lh && cd >= ovDay - 3 && cd <= ovDay + 1) notes.push(`LH test: ${cd === ovDay - 1 || cd === ovDay ? 'positive' : 'negative'}`);
    sig[key] = { notes: notes.join('\n'), discharge: opts.mucus && cd >= ovDay - 2 && cd <= ovDay ? 'ewcm' : 'creamy' };
  }
  return sig;
}

describe('parsers', () => {
  it('reads LH and BBT in either unit', () => {
    expect(parseLH('LH test: Positive')).toBe('positive');
    expect(parseLH('nothing')).toBeNull();
    expect(parseBbtC('BBT: 36.6°C')).toBeCloseTo(36.6);
    expect(parseBbtC('BBT: 97.9°F')).toBeCloseTo(36.61, 1);
    expect(parseBbtC('BBT: 98.1')).toBeCloseTo(36.72, 1);
    expect(parseBbtC('BBT: 12')).toBeNull();
  });
  it('progesterone threshold in both units', () => {
    expect(progesteroneConfirmsOvulation({ value: 12, unit: 'ng/mL', dateRecorded: null })).toBe(true);
    expect(progesteroneConfirmsOvulation({ value: 2, unit: 'ng/mL', dateRecorded: null })).toBe(false);
    expect(progesteroneConfirmsOvulation({ value: 30, unit: 'nmol/L', dateRecorded: null })).toBe(true);
    expect(progesteroneConfirmsOvulation({ value: 5, unit: 'nmol/L', dateRecorded: null })).toBe(false);
  });
});

describe('detectOvulation', () => {
  const S = '2026-09-01';
  it('LH + temperature agreeing = high confidence, day after first positive', () => {
    const r = detectOvulation(cycleSignals(S, 16, { lh: true, bbt: true }), d(S), d(add(S, 27)));
    expect(r?.method).toBe('lh+bbt');
    expect(r?.confidence).toBe('high');
    expect(ymd(r!.date)).toBe(add(S, 15)); // cycle day 16
  });
  it('temperature alone finds the day before the rise', () => {
    const r = detectOvulation(cycleSignals(S, 18, { bbt: true }), d(S), d(add(S, 27)));
    expect(r?.method).toBe('bbt');
    expect(ymd(r!.date)).toBe(add(S, 17));
  });
  it('egg-white discharge alone is a low-confidence estimate', () => {
    const r = detectOvulation(cycleSignals(S, 14, { mucus: true }), d(S), d(add(S, 27)));
    expect(r).toMatchObject({ method: 'mucus', confidence: 'low' });
    expect(ymd(r!.date)).toBe(add(S, 13));
  });
  it('ignores positive LH during the period', () => {
    const sig: Record<string, SignalLike> = { [add(S, 2)]: { notes: 'LH test: positive' } };
    expect(detectOvulation(sig, d(S), d(add(S, 27)))).toBeNull();
  });
  it('falls back to a progesterone draw (≈7 days after ovulation)', () => {
    const r = detectOvulation({}, d(S), d(add(S, 27)), { value: 11, unit: 'ng/mL', dateRecorded: add(S, 20) });
    expect(r).toMatchObject({ method: 'progesterone', confidence: 'low' });
    expect(ymd(r!.date)).toBe(add(S, 13));
  });
  it('nothing logged → null', () => {
    expect(detectOvulation({}, d(S), d(add(S, 27)))).toBeNull();
  });
});

describe('learnLuteal', () => {
  it('learns a short personal luteal phase from LH cycles', () => {
    // 28-day cycles ovulating on day 17 → luteal 12
    const starts = ['2026-07-07', '2026-08-04', '2026-09-01', '2026-09-29'];
    const sig = { ...cycleSignals(starts[0], 17, { lh: true }), ...cycleSignals(starts[1], 17, { lh: true }), ...cycleSignals(starts[2], 17, { lh: true }) };
    const m = learnLuteal(starts, sig);
    expect(m.source).toBe('personal');
    expect(m.lutealLength).toBe(12);
    expect(m.cycles).toHaveLength(3);
  });
  it('defaults to 14 with no precise signals', () => {
    const starts = ['2026-08-04', '2026-09-01'];
    const m = learnLuteal(starts, cycleSignals(starts[0], 14, { mucus: true }));
    expect(m.source).toBe('default');
    expect(m.lutealLength).toBe(14);
    expect(m.cycles).toHaveLength(1); // still shown, just not learned from
  });
});
