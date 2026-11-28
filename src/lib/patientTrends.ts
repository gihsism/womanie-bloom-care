// Pure helpers for the Trends tab of the doctor's patient chart.
// Input = the reduced payload of /api/doctors/patient-trends. Each builder
// returns null when there is not enough data, so the tab only shows
// charts that have something to say, each with one plain sentence.

export interface TrendsPayload {
  periods: Array<{ start: string; end: string | null }>;
  signals: Array<{ date: string; symptoms: string[]; bbt: number | null }>;
  weights: Array<{ date: string; kg: number }>;
  bloodPressure: Array<{ date: string; systolic: number; diastolic: number }>;
}

export interface SeriesPoint { label: string; date: string; value: number }
export interface Trend { points: SeriesPoint[]; summary: string; unit: string }
export interface BpPoint { label: string; date: string; systolic: number; diastolic: number }
export interface BpTrend { points: BpPoint[]; summary: string }
export interface SymptomCount { name: string; days: number }
export interface SymptomTrend { counts: SymptomCount[]; loggedDays: number; summary: string }

const DAY = 86400000;
const toUtc = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const daysBetween = (a: string, b: string) => Math.round((toUtc(b) - toUtc(a)) / DAY);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const shortDate = (s: string) => `${+s.slice(8, 10)} ${MONTHS[+s.slice(5, 7) - 1]}`;
const range = (vals: number[]) => [Math.min(...vals), Math.max(...vals)] as const;
const fmtRange = (lo: number, hi: number) => (lo === hi ? `${lo}` : `${lo}–${hi}`);

/** Cycle length = days between consecutive period starts (last 12). */
export function cycleTrend(periods: TrendsPayload['periods']): Trend | null {
  const starts = [...new Set(periods.map(p => p.start))].sort();
  const points: SeriesPoint[] = [];
  for (let i = 1; i < starts.length; i++) {
    const len = daysBetween(starts[i - 1], starts[i]);
    // A gap outside 15–90 days is a missed log, not a cycle.
    if (len >= 15 && len <= 90) points.push({ label: shortDate(starts[i - 1]), date: starts[i - 1], value: len });
  }
  const last = points.slice(-12);
  if (last.length < 2) return null;
  const [lo, hi] = range(last.map(p => p.value));
  // Variation of up to 7 days between the shortest and longest cycle is
  // the usual definition of "regular".
  const pattern = hi - lo <= 7 ? 'regular' : `irregular (varies by ${hi - lo} days)`;
  const outside = last.filter(p => p.value < 24 || p.value > 38).length;
  const extra = outside ? `; ${outside} outside 24–38 days (FIGO)` : '';
  return { points: last, unit: 'days', summary: `Cycles ${fmtRange(lo, hi)} days, ${pattern}${extra} (last ${last.length}).` };
}

/** Period length = end − start + 1, where the end was logged. */
export function periodTrend(periods: TrendsPayload['periods']): Trend | null {
  const points = periods
    .filter(p => p.end)
    .map(p => ({ label: shortDate(p.start), date: p.start, value: daysBetween(p.start, p.end!) + 1 }))
    .filter(p => p.value >= 1 && p.value <= 15)
    .slice(-12);
  if (points.length < 2) return null;
  const [lo, hi] = range(points.map(p => p.value));
  const long = points.filter(p => p.value > 7).length;
  const tail = long ? `${long} longer than 7 days` : 'none longer than 7 days';
  return { points, unit: 'days', summary: `Periods ${fmtRange(lo, hi)} days, ${tail} (last ${points.length}).` };
}

export function weightTrend(weights: TrendsPayload['weights']): Trend | null {
  if (weights.length < 2) return null;
  const points = weights.map(w => ({ label: shortDate(w.date), date: w.date, value: w.kg }));
  const first = points[0], last = points[points.length - 1];
  const diff = Math.round((last.value - first.value) * 10) / 10;
  const weeks = Math.max(1, Math.round(daysBetween(first.date, last.date) / 7));
  const change = diff === 0 ? 'no change' : `${diff > 0 ? '+' : '−'}${Math.abs(diff).toFixed(1)} kg`;
  return {
    points,
    unit: 'kg',
    summary: `${first.value.toFixed(1)} → ${last.value.toFixed(1)} kg over ${weeks} week${weeks === 1 ? '' : 's'} (${change}).`,
  };
}

/** 140/90 is the threshold for raised blood pressure in pregnancy. */
export const BP_HIGH = { systolic: 140, diastolic: 90 };
export const isHighBp = (s: number, d: number) => s >= BP_HIGH.systolic || d >= BP_HIGH.diastolic;

export function bpTrend(bp: TrendsPayload['bloodPressure']): BpTrend | null {
  if (bp.length < 2) return null;
  const points = bp.map(b => ({ label: shortDate(b.date), ...b }));
  const last = points[points.length - 1];
  const high = points.filter(p => isHighBp(p.systolic, p.diastolic)).length;
  const tail = high
    ? `${high} of ${points.length} readings at or above 140/90.`
    : `all ${points.length} readings below 140/90.`;
  return { points, summary: `Latest ${last.systolic}/${last.diastolic} (${shortDate(last.date)}); ${tail}` };
}

export function bbtTrend(signals: TrendsPayload['signals']): Trend | null {
  const points = signals
    .filter(s => s.bbt !== null)
    .map(s => ({ label: shortDate(s.date), date: s.date, value: Math.round(s.bbt! * 100) / 100 }));
  if (points.length < 3) return null;
  const [lo, hi] = range(points.map(p => p.value));
  return {
    points,
    unit: '°C',
    summary: `${points.length} readings in 90 days, ${lo.toFixed(2)}–${hi.toFixed(2)} °C.`,
  };
}

const prettySymptom = (s: string) => {
  const t = s.replace(/[_-]+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
};

/** Days in the last 90 on which each symptom was logged (top 8). */
export function symptomTrend(signals: TrendsPayload['signals']): SymptomTrend | null {
  const days = new Map<string, Set<string>>();
  const logged = new Set<string>();
  for (const s of signals) {
    if (!s.symptoms.length) continue;
    logged.add(s.date);
    for (const raw of s.symptoms) {
      const name = prettySymptom(raw);
      if (!name) continue;
      if (!days.has(name)) days.set(name, new Set());
      days.get(name)!.add(s.date);
    }
  }
  if (days.size === 0) return null;
  const counts = [...days.entries()]
    .map(([name, d]) => ({ name, days: d.size }))
    .sort((a, b) => b.days - a.days || a.name.localeCompare(b.name))
    .slice(0, 8);
  const top = counts.slice(0, 2).map(c => `${c.name.toLowerCase()} (${c.days} day${c.days === 1 ? '' : 's'})`).join(', ');
  return {
    counts,
    loggedDays: logged.size,
    summary: `Most often: ${top}. Symptoms logged on ${logged.size} of the last 90 days.`,
  };
}

export interface PatientTrends {
  cycle: Trend | null;
  period: Trend | null;
  weight: Trend | null;
  bp: BpTrend | null;
  bbt: Trend | null;
  symptoms: SymptomTrend | null;
}

export function buildTrends(p: Partial<TrendsPayload> | null | undefined): PatientTrends {
  const periods = Array.isArray(p?.periods) ? p!.periods : [];
  const signals = Array.isArray(p?.signals) ? p!.signals : [];
  return {
    cycle: cycleTrend(periods),
    period: periodTrend(periods),
    weight: weightTrend(Array.isArray(p?.weights) ? p!.weights : []),
    bp: bpTrend(Array.isArray(p?.bloodPressure) ? p!.bloodPressure : []),
    bbt: bbtTrend(signals),
    symptoms: symptomTrend(signals),
  };
}

export const hasAnyTrend = (t: PatientTrends) => Object.values(t).some(Boolean);
