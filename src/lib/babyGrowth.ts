// Weight-, length- and head-circumference-for-age percentiles from the WHO
// Child Growth Standards (LMS method). Pure functions; the chart
// (BabyGrowthChart.tsx) and the tests use them.
//
//   z = ((value / M)^L - 1) / (L * S)        (L != 0; L = 1 for length and head)
//   value at z = M * (1 + L * S * z)^(1 / L)
//   percentile = 100 * Phi(z)
//
// WHO recommends a restricted form beyond |z| > 3; the chart never draws
// those curves and the sentence then says "below the 1st" / "above the
// 99th", so the plain formula is enough here.
import { WHO_WFA_BOYS, WHO_WFA_GIRLS, type LmsRow } from './whoWeightForAge';
import { WHO_HCFA_BOYS, WHO_HCFA_GIRLS, WHO_LFA_BOYS, WHO_LFA_GIRLS } from './whoLengthHeadForAge';

export type GrowthSex = 'female' | 'male';
/** What a chart shows: weight (kg), length (cm) or head circumference (cm). */
export type GrowthMeasure = 'weight' | 'length' | 'head';
export const MEASURES: readonly GrowthMeasure[] = ['weight', 'length', 'head'];

const TABLES: Record<GrowthMeasure, Record<GrowthSex, readonly LmsRow[]>> = {
  weight: { female: WHO_WFA_GIRLS, male: WHO_WFA_BOYS },
  length: { female: WHO_LFA_GIRLS, male: WHO_LFA_BOYS },
  head: { female: WHO_HCFA_GIRLS, male: WHO_HCFA_BOYS },
};
/** Unit each measure is charted in. */
export const UNIT: Record<GrowthMeasure, 'kg' | 'cm'> = { weight: 'kg', length: 'cm', head: 'cm' };
export interface Lms { L: number; M: number; S: number }

/** Last age (days) the WHO 0-24 month table covers. */
export const MAX_AGE_DAYS = 731;
/** 1 month in WHO's tables = 30.4375 days. */
export const DAYS_PER_MONTH = 30.4375;

/** The percentile curves the chart draws, as in the WHO charts. */
export const CURVES = [
  { p: 3, z: -1.880794 },
  { p: 15, z: -1.036433 },
  { p: 50, z: 0 },
  { p: 85, z: 1.036433 },
  { p: 97, z: 1.880794 },
] as const;

/** 'female' / 'male' from what babies.sex may hold; null when unknown. */
export function normaliseSex(v: string | null | undefined): GrowthSex | null {
  const s = (v ?? '').trim().toLowerCase();
  if (['female', 'f', 'girl'].includes(s)) return 'female';
  if (['male', 'm', 'boy'].includes(s)) return 'male';
  return null;
}

/** L, M, S at an age in days (linear between table rows); null outside 0-731 days. */
export function lmsAt(sex: GrowthSex, ageDays: number, measure: GrowthMeasure = 'weight'): Lms | null {
  if (!Number.isFinite(ageDays) || ageDays < 0 || ageDays > MAX_AGE_DAYS) return null;
  const t = TABLES[measure][sex];
  const hi = t.findIndex(r => r[0] >= ageDays);
  // Past the last row (length ends at day 730): that row, never extrapolated.
  if (hi < 0) { const r = t[t.length - 1]; return { L: r[1], M: r[2], S: r[3] }; }
  const b = t[hi];
  if (b[0] === ageDays || hi === 0) return { L: b[1], M: b[2], S: b[3] };
  const a = t[hi - 1];
  const f = (ageDays - a[0]) / (b[0] - a[0]);
  return { L: a[1] + (b[1] - a[1]) * f, M: a[2] + (b[2] - a[2]) * f, S: a[3] + (b[3] - a[3]) * f };
}

/** z of a value (kg or cm) for the L, M, S of its measure. */
export function zScore(weightKg: number, { L, M, S }: Lms): number {
  if (Math.abs(L) < 1e-9) return Math.log(weightKg / M) / S;
  return (Math.pow(weightKg / M, L) - 1) / (L * S);
}

/** Value (kg or cm) at a z, for the L, M, S of any measure. */
export function weightAtZ(z: number, { L, M, S }: Lms): number {
  if (Math.abs(L) < 1e-9) return M * Math.exp(S * z);
  return M * Math.pow(1 + L * S * z, 1 / L);
}

/** Standard normal CDF (Abramowitz-Stegun 7.1.26 via erf; error < 1.5e-7). */
export function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** Percentile (0-100) of a measurement at an age; null outside birth-24 months. */
export function percentileOf(measure: GrowthMeasure, sex: GrowthSex, ageDays: number, value: number): number | null {
  const lms = lmsAt(sex, ageDays, measure);
  if (!lms || !(value > 0)) return null;
  return 100 * normalCdf(zScore(value, lms));
}

/** Percentile (0-100) of a weight at an age; null outside birth-24 months. */
export function weightPercentile(sex: GrowthSex, ageDays: number, weightKg: number): number | null {
  return percentileOf('weight', sex, ageDays, weightKg);
}

/** Whole days from the birth date to the measurement date (both 'yyyy-mm-dd'). */
export function ageInDays(birthDate: string, measuredOn: string): number {
  const b = Date.UTC(+birthDate.slice(0, 4), +birthDate.slice(5, 7) - 1, +birthDate.slice(8, 10));
  const m = Date.UTC(+measuredOn.slice(0, 4), +measuredOn.slice(5, 7) - 1, +measuredOn.slice(8, 10));
  return Math.round((m - b) / 86400000);
}

/** "5 days", "8 weeks", "7 months" - weeks up to 13 weeks, as baby booklets do. */
export function ageLabel(days: number): string {
  if (days < 14) return days === 1 ? '1 day' : `${days} days`;
  if (days < 14 * 7) { const w = Math.floor(days / 7); return `${w} weeks`; }
  const m = Math.floor(days / DAYS_PER_MONTH);
  return m === 1 ? '1 month' : `${m} months`;
}

const ordinal = (n: number) => {
  const r100 = n % 100;
  if (r100 >= 11 && r100 <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
};

/** "around the 40th percentile" / "below the 1st percentile" / "above the 99th percentile". */
export function percentilePhrase(p: number): string {
  if (p < 1) return 'below the 1st percentile';
  if (p > 99) return 'above the 99th percentile';
  return `around the ${ordinal(Math.min(99, Math.max(1, Math.round(p))))} percentile`;
}

/** "4.6 kg" (one decimal, as the official charts read). */
export const kgLabel = (kg: number) => `${(Math.round(kg * 10) / 10).toFixed(1)} kg`;
/** "4.6 kg" / "57.5 cm" (one decimal). */
export const valueLabel = (measure: GrowthMeasure, v: number) => `${(Math.round(v * 10) / 10).toFixed(1)} ${UNIT[measure]}`;

/** "4.6 kg at 8 weeks, around the 40th percentile" (or cm for length/head); null when no percentile applies. */
export function latestLine(sex: GrowthSex, ageDays: number, value: number, measure: GrowthMeasure = 'weight'): string | null {
  const p = percentileOf(measure, sex, ageDays, value);
  if (p === null) return null;
  return `${valueLabel(measure, value)} at ${ageLabel(ageDays)}, ${percentilePhrase(p)}`;
}

/** Curve points every `step` days from 0 to `toDays` (inclusive). */
export function curveRows(sex: GrowthSex, toDays: number, step = 7, measure: GrowthMeasure = 'weight'): Array<Record<string, number>> {
  const end = Math.min(MAX_AGE_DAYS, Math.max(0, toDays));
  const ages: number[] = [];
  for (let d = 0; d < end; d += step) ages.push(d);
  ages.push(end);
  return ages.map(d => {
    const lms = lmsAt(sex, d, measure) as Lms;
    const row: Record<string, number> = { day: d };
    for (const c of CURVES) row[`p${c.p}`] = Math.round(weightAtZ(c.z, lms) * 1000) / 1000;
    return row;
  });
}

export const MIN_WEIGHT_KG = 0.5;
export const MAX_WEIGHT_KG = 25;

/**
 * Her typed weight -> kg. Unit 'kg' or 'g'; comma or point decimals.
 * Error text is shown under the field.
 */
export function parseWeight(raw: string, unit: 'kg' | 'g'): { ok: true; kg: number } | { ok: false; error: string } {
  const s = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!s) return { ok: false, error: 'Enter the weight.' };
  if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false, error: 'Enter a number, for example 4.6 kg or 4600 g.' };
  const n = Number(s);
  const kg = unit === 'g' ? n / 1000 : n;
  if (kg < MIN_WEIGHT_KG || kg > MAX_WEIGHT_KG) {
    return { ok: false, error: unit === 'g' ? 'Enter a weight between 500 g and 25000 g.' : 'Enter a weight between 0.5 kg and 25 kg.' };
  }
  return { ok: true, kg: Math.round(kg * 1000) / 1000 };
}

/** Length and head circumference she may type, in cm. */
export const CM_RANGE: Record<'length' | 'head', { min: number; max: number }> = {
  length: { min: 25, max: 130 },
  head: { min: 20, max: 60 },
};

/**
 * Her typed length or head circumference -> cm (one decimal). Empty is
 * fine (both are optional): { ok: true, cm: null }.
 */
export function parseCm(raw: string, measure: 'length' | 'head'): { ok: true; cm: number | null } | { ok: false; error: string } {
  const s = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!s) return { ok: true, cm: null };
  const what = measure === 'length' ? 'length' : 'head circumference';
  if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false, error: `Enter the ${what} as a number in cm, for example ${measure === 'length' ? '57.5' : '38'}.` };
  const n = Number(s);
  const { min, max } = CM_RANGE[measure];
  if (n < min || n > max) return { ok: false, error: `Enter a ${what} between ${min} cm and ${max} cm.` };
  return { ok: true, cm: Math.round(n * 10) / 10 };
}

export interface GrowthEventData { weight_g?: number | null; length_cm?: number | null; head_cm?: number | null }
export interface MeasurePoint { day: number; value: number; on: string }
export interface WeightPoint { day: number; kg: number; on: string }

/** The value of one measure in a saved record (kg for weight, cm otherwise); null when not recorded. */
export function valueOf(measure: GrowthMeasure, data: GrowthEventData | null | undefined): number | null {
  const raw = Number(measure === 'weight' ? data?.weight_g : measure === 'length' ? data?.length_cm : data?.head_cm);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return measure === 'weight' ? raw / 1000 : raw;
}

/** Her measurements of one kind, as chart points within birth-24 months, oldest first. */
export function measurePoints(
  measure: GrowthMeasure,
  birthDate: string,
  events: Array<{ occurred_at: string; data?: GrowthEventData | null }>,
  localDate: (iso: string) => string,
): MeasurePoint[] {
  const out: MeasurePoint[] = [];
  for (const e of events) {
    const value = valueOf(measure, e.data);
    if (value === null) continue;
    const on = localDate(e.occurred_at);
    const day = ageInDays(birthDate, on);
    if (day < 0 || day > MAX_AGE_DAYS) continue;
    out.push({ day, value, on });
  }
  return out.sort((a, b) => a.day - b.day || a.on.localeCompare(b.on));
}

/** Her measurements with a weight, as chart points within birth-24 months, oldest first. */
export function weightPoints(
  birthDate: string,
  events: Array<{ occurred_at: string; data?: GrowthEventData | null }>,
  localDate: (iso: string) => string,
): WeightPoint[] {
  return measurePoints('weight', birthDate, events, localDate).map(p => ({ day: p.day, kg: p.value, on: p.on }));
}

/** Short percentile for a table cell: "42nd", "<1st", ">99th". */
export function percentileShort(p: number): string {
  if (p < 1) return '<1st';
  if (p > 99) return '>99th';
  return ordinal(Math.min(99, Math.max(1, Math.round(p))));
}

export interface MeasureCell { value: number; percentile: number | null }
export interface MeasurementRow {
  id: string;
  on: string; // yyyy-mm-dd (local)
  /** Age in days on that date; null without a birth date. */
  day: number | null;
  weight: MeasureCell | null;
  length: MeasureCell | null;
  head: MeasureCell | null;
}

/**
 * Her saved measurements for a list or a printed table, newest first,
 * each value with its WHO percentile (null without a sex or a birth date,
 * or outside birth to 24 months). Numbers only, no judgement.
 */
export function measurementRows(
  birthDate: string | null,
  sex: GrowthSex | null,
  events: Array<{ id: string; occurred_at: string; data?: GrowthEventData | null }>,
  localDate: (iso: string) => string,
): MeasurementRow[] {
  const rows: MeasurementRow[] = [];
  for (const e of events) {
    const on = localDate(e.occurred_at);
    const day = birthDate ? ageInDays(birthDate, on) : null;
    const cell = (m: GrowthMeasure): MeasureCell | null => {
      const value = valueOf(m, e.data);
      if (value === null) return null;
      const percentile = sex && day !== null ? percentileOf(m, sex, day, value) : null;
      return { value, percentile };
    };
    const row = { id: e.id, on, day, weight: cell('weight'), length: cell('length'), head: cell('head') };
    if (row.weight || row.length || row.head) rows.push(row);
  }
  return rows.sort((a, b) => b.on.localeCompare(a.on) || b.id.localeCompare(a.id));
}

// ---------------------------------------------------------------- chart axes
// Shared by the screen chart (recharts) and the printed chart (plain SVG).

/** Round y-axis ticks for the visible range. */
export function chartYAxis(lo: number, hi: number) {
  const span = hi - lo;
  const step = span > 40 ? 10 : span > 16 ? 5 : span > 8 ? 2 : 1;
  const min = Math.max(0, Math.floor(lo / step) * step);
  const max = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = min; v <= max; v += step) ticks.push(v);
  return { min, max, ticks };
}

/** X range and ticks: weeks for the first ~3 months, then months. */
export function chartXScale(lastDay: number) {
  const want = Math.max(91, Math.ceil(lastDay * 1.2) + 14);
  if (want <= 98) {
    const end = 98;
    const ticks = Array.from({ length: 8 }, (_, i) => i * 14);
    return { end, ticks, label: (d: number) => (d === 0 ? 'Birth' : `${d / 7} wk`) };
  }
  const months = Math.min(24, Math.ceil(want / DAYS_PER_MONTH));
  const step = months <= 6 ? 1 : months <= 12 ? 2 : 3;
  const endMonths = Math.min(24, Math.ceil(months / step) * step);
  const ticks: number[] = [];
  for (let m = 0; m <= endMonths; m += step) ticks.push(Math.min(MAX_AGE_DAYS, Math.round(m * DAYS_PER_MONTH)));
  return {
    end: Math.min(MAX_AGE_DAYS, Math.round(endMonths * DAYS_PER_MONTH)),
    ticks,
    label: (d: number) => (d === 0 ? 'Birth' : `${Math.round(d / DAYS_PER_MONTH)} mo`),
  };
}
