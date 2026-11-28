// Weight-for-age percentiles from the WHO Child Growth Standards (LMS
// method). Pure functions; the chart (BabyGrowthChart.tsx) and the tests
// use them.
//
//   z = ((weight / M)^L - 1) / (L * S)        (L != 0)
//   weight at z = M * (1 + L * S * z)^(1 / L)
//   percentile = 100 * Phi(z)
//
// WHO recommends a restricted form beyond |z| > 3; the chart never draws
// those curves and the sentence then says "below the 1st" / "above the
// 99th", so the plain formula is enough here.
import { WHO_WFA_BOYS, WHO_WFA_GIRLS, type LmsRow } from './whoWeightForAge';

export type GrowthSex = 'female' | 'male';
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
export function lmsAt(sex: GrowthSex, ageDays: number): Lms | null {
  if (!Number.isFinite(ageDays) || ageDays < 0 || ageDays > MAX_AGE_DAYS) return null;
  const t: readonly LmsRow[] = sex === 'female' ? WHO_WFA_GIRLS : WHO_WFA_BOYS;
  let hi = t.findIndex(r => r[0] >= ageDays);
  if (hi < 0) hi = t.length - 1;
  const b = t[hi];
  if (b[0] === ageDays || hi === 0) return { L: b[1], M: b[2], S: b[3] };
  const a = t[hi - 1];
  const f = (ageDays - a[0]) / (b[0] - a[0]);
  return { L: a[1] + (b[1] - a[1]) * f, M: a[2] + (b[2] - a[2]) * f, S: a[3] + (b[3] - a[3]) * f };
}

export function zScore(weightKg: number, { L, M, S }: Lms): number {
  if (Math.abs(L) < 1e-9) return Math.log(weightKg / M) / S;
  return (Math.pow(weightKg / M, L) - 1) / (L * S);
}

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

/** Percentile (0-100) of a weight at an age; null outside birth-24 months. */
export function weightPercentile(sex: GrowthSex, ageDays: number, weightKg: number): number | null {
  const lms = lmsAt(sex, ageDays);
  if (!lms || !(weightKg > 0)) return null;
  return 100 * normalCdf(zScore(weightKg, lms));
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

/** "4.6 kg at 8 weeks, around the 40th percentile"; null when no percentile applies. */
export function latestLine(sex: GrowthSex, ageDays: number, weightKg: number): string | null {
  const p = weightPercentile(sex, ageDays, weightKg);
  if (p === null) return null;
  return `${kgLabel(weightKg)} at ${ageLabel(ageDays)}, ${percentilePhrase(p)}`;
}

/** Curve points every `step` days from 0 to `toDays` (inclusive). */
export function curveRows(sex: GrowthSex, toDays: number, step = 7): Array<Record<string, number>> {
  const end = Math.min(MAX_AGE_DAYS, Math.max(0, toDays));
  const ages: number[] = [];
  for (let d = 0; d < end; d += step) ages.push(d);
  ages.push(end);
  return ages.map(d => {
    const lms = lmsAt(sex, d) as Lms;
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

export interface WeightPoint { day: number; kg: number; on: string }

/** Her measurements with a weight, as chart points within birth-24 months, oldest first. */
export function weightPoints(
  birthDate: string,
  events: Array<{ occurred_at: string; data?: { weight_g?: number | null } | null }>,
  localDate: (iso: string) => string,
): WeightPoint[] {
  const out: WeightPoint[] = [];
  for (const e of events) {
    const g = Number(e.data?.weight_g);
    if (!Number.isFinite(g) || g <= 0) continue;
    const on = localDate(e.occurred_at);
    const day = ageInDays(birthDate, on);
    if (day < 0 || day > MAX_AGE_DAYS) continue;
    out.push({ day, kg: g / 1000, on });
  }
  return out.sort((a, b) => a.day - b.day || a.on.localeCompare(b.on));
}
