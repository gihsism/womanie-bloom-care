// Pure logic for Me -> Health overview (src/pages/dashboard/HealthOverview.tsx).
//
// Her key numbers over time, for any life stage, built only from data the
// app already stores (no new storage):
//   - cycle length: period_tracking start dates
//   - weight: the pregnancy / postpartum weight logs (user_app_data,
//     mirrored in localStorage: womanie_preg_weight_log_, womanie_maternal_weight_)
//   - blood pressure: womanie_bp_log_
//   - key labs she uploaded: current_extracted_data (the latest analysis of
//     each document), matched by test name
//
// Each metric = a short series for a sparkline, the last value + date, the
// range it is judged against and whether the last value is inside it, and
// a link to where the record lives. A metric with no usable reading is
// left out, so the page only shows what she actually has.

import { parseRange } from './bodyMap';
import { labNumber, numberStylesByDocument, parseLabValue } from './labValue';

export type RangeState = 'in' | 'low' | 'high' | 'out' | 'none';

export interface OverviewPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export interface OverviewMetric {
  id: string;
  label: string;
  unit: string | null;
  /** Ascending by date, at most MAX_POINTS. */
  points: OverviewPoint[];
  /** Second line of the sparkline (diastolic for blood pressure). */
  secondary?: OverviewPoint[];
  last: { display: string; date: string; /** Ambiguous number ("1,250"): show "check value". */ check?: boolean };
  /** Bounds the sparkline can shade; null side = open. */
  range: { low: number | null; high: number | null } | null;
  /** How the range is written for her, e.g. "15–150" or "under 140/90". */
  rangeText: string | null;
  state: RangeState;
  link: string;
}

export const MAX_POINTS = 24;

const DAY = 86400000;
const ymd = (v: unknown): string | null => {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v !== 'string') return null;
  return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
};
const toUtc = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const m = v.replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
};
const fmt = (n: number) => String(Math.round(n * 100) / 100);
const fmtRange = (r: { low: number | null; high: number | null }) =>
  r.low != null && r.high != null ? `${fmt(r.low)}–${fmt(r.high)}` : r.high != null ? `under ${fmt(r.high)}` : `over ${fmt(r.low!)}`;

/** in / low / high against a parsed range; 'none' when there is no range. */
export function rangeState(value: number, range: { low: number | null; high: number | null } | null): RangeState {
  if (!range || (range.low == null && range.high == null)) return 'none';
  if (range.low != null && value < range.low) return 'low';
  if (range.high != null && value > range.high) return 'high';
  return 'in';
}

// ---------------------------------------------------------------- labs

export interface LabRow {
  title: string | null;
  value: string | number | null;
  unit: string | null;
  reference_range: string | null;
  status: string | null;
  date_recorded: string | null;
  document_id: string | null;
  /** Optional: carries number_style when the analysis stored it. */
  raw_data?: unknown;
}

export interface KeyLab {
  id: string;
  label: string;
  match: RegExp;
}

// Order = order on the page. Tested against the whole title so "HbA1c" is
// never read as haemoglobin and "Iron binding capacity" never as iron.
export const KEY_LABS: KeyLab[] = [
  { id: 'ferritin', label: 'Ferritin', match: /^(serum\s+)?ferritin\b/i },
  { id: 'tsh', label: 'TSH', match: /^(tsh|thyroid[\s-]+stimulating\s+hormone)\b/i },
  { id: 'vitamin-d', label: 'Vitamin D', match: /^(25[\s-]*(oh|hydroxy)[\s-]*)?vitamin\s*d\b|^25[\s-]*(oh|hydroxy)[\s-]*(vitamin\s*)?d\b|^calcidiol\b/i },
  { id: 'hemoglobin', label: 'Hemoglobin', match: /^(h(a)?emoglobin|hb|hgb)(\s*\(.*\))?$/i },
  { id: 'b12', label: 'Vitamin B12', match: /^(vitamin\s*)?b[\s-]?12\b|^cobalamin\b/i },
  { id: 'free-t4', label: 'Free T4', match: /^(free\s*t4|ft4|free\s+thyroxine)\b/i },
  { id: 'hba1c', label: 'HbA1c', match: /^(hba1c|h(a)?emoglobin\s+a1c|a1c|glycated\s+h(a)?emoglobin)\b/i },
  { id: 'amh', label: 'AMH', match: /^(amh|anti[\s-]+m(u|ü)ller(ian)?\s+hormone)\b/i },
];

export function keyLabFor(title: string | null | undefined): KeyLab | null {
  const t = (title ?? '').trim();
  if (!t) return null;
  return KEY_LABS.find(k => k.match.test(t)) ?? null;
}

// One spelling per unit, so the same unit written differently by two labs
// stays on one line: micro as µ (micro sign), μ (Greek mu), u or mc
// ("µg/L" = "μg/l" = "ug/L" = "mcg/L").
const normUnit = (u: string | null | undefined) =>
  (u ?? '').trim().toLowerCase().replace(/\s+/g, '').replace(/[µμ]|mc(?=g)/g, 'u');

export function labMetrics(rows: LabRow[]): OverviewMetric[] {
  const byLab = new Map<string, Array<LabRow & { date: string; n: number; check: boolean }>>();
  // Each report's own decimal mark decides "1,250" (1.25 on a Swiss
  // report, 1250 on an English one).
  const styles = numberStylesByDocument(rows);
  for (const r of rows) {
    const lab = keyLabFor(r.title);
    const date = ymd(r.date_recorded);
    const ctx = { style: styles.get(r.document_id ?? '') ?? null, title: lab?.label ?? r.title, unit: r.unit };
    const n = labNumber(r.value, ctx);
    if (!lab || !date || n === null) continue;
    const list = byLab.get(lab.id) ?? [];
    list.push({ ...r, date, n, check: parseLabValue(r.value, ctx).check });
    byLab.set(lab.id, list);
  }
  const out: OverviewMetric[] = [];
  for (const lab of KEY_LABS) {
    const list = byLab.get(lab.id);
    if (!list?.length) continue;
    list.sort((a, b) => a.date.localeCompare(b.date));
    const latest = list[list.length - 1];
    // Only readings in the latest reading's unit share one line (vitamin D
    // in ng/mL and nmol/L differ by a factor of 2.5).
    const unit = normUnit(latest.unit);
    const sameUnit = list.filter(r => normUnit(r.unit) === unit);
    // One point per day: the last one listed for that date.
    const byDate = new Map<string, number>();
    for (const r of sameUnit) byDate.set(r.date, r.n);
    const points = [...byDate.entries()].map(([date, value]) => ({ date, value })).slice(-MAX_POINTS);

    const range = parseRange(latest.reference_range, { style: styles.get(latest.document_id ?? '') ?? null });
    let state = rangeState(latest.n, range);
    if (state === 'none') {
      // No parseable range on the report: fall back to the status the
      // analysis stored for that reading.
      const s = (latest.status ?? '').toLowerCase();
      state = s === 'abnormal' || s === 'critical' ? 'out' : s === 'normal' || s === 'expected' ? 'in' : 'none';
    }
    const raw = latest.value == null ? fmt(latest.n) : String(latest.value).trim();
    out.push({
      id: lab.id,
      label: lab.label,
      unit: latest.unit?.trim() || null,
      points,
      last: { display: raw, date: latest.date, ...(latest.check ? { check: true } : {}) },
      range,
      rangeText: range ? fmtRange(range) : (latest.reference_range?.trim() || null),
      state,
      link: latest.document_id ? `/dashboard/medical-history?doc=${encodeURIComponent(latest.document_id)}` : '/dashboard/medical-history',
    });
  }
  return out;
}

// --------------------------------------------------------- cycle length

// FIGO 2018 normal frequency, as in cycleInsights.ts and CycleExplainedCard.
export const CYCLE_RANGE = { low: 24, high: 38 };

/** Days between consecutive period starts (gaps outside 15–90 days are missed logs). */
export function cycleMetric(periodStarts: unknown[]): OverviewMetric | null {
  const starts = [...new Set(periodStarts.map(ymd).filter((d): d is string => d !== null))].sort();
  const points: OverviewPoint[] = [];
  for (let i = 1; i < starts.length; i++) {
    const len = Math.round((toUtc(starts[i]) - toUtc(starts[i - 1])) / DAY);
    if (len >= 15 && len <= 90) points.push({ date: starts[i - 1], value: len });
  }
  if (!points.length) return null;
  const last = points[points.length - 1];
  return {
    id: 'cycle',
    label: 'Cycle length',
    unit: 'days',
    points: points.slice(-MAX_POINTS),
    last: { display: String(last.value), date: last.date },
    range: CYCLE_RANGE,
    rangeText: `${CYCLE_RANGE.low}–${CYCLE_RANGE.high}`,
    state: rangeState(last.value, CYCLE_RANGE),
    link: '/dashboard',
  };
}

// --------------------------------------------------------------- weight

/** preg_weight_log = [{date, kg}]; maternal_weight = {entries: [{date, kg}]}. */
export function weightMetric(pregLog: unknown, maternal: unknown): OverviewMetric | null {
  const byDate = new Map<string, number>();
  const lists = [
    Array.isArray(pregLog) ? pregLog : [],
    maternal && typeof maternal === 'object' && Array.isArray((maternal as { entries?: unknown }).entries)
      ? (maternal as { entries: unknown[] }).entries
      : [],
  ];
  for (const list of lists) {
    for (const e of list) {
      const date = ymd((e as { date?: unknown })?.date);
      const kg = num((e as { kg?: unknown })?.kg);
      if (date && kg !== null && kg > 20 && kg < 300) byDate.set(date, Math.round(kg * 10) / 10);
    }
  }
  if (!byDate.size) return null;
  const points = [...byDate.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_POINTS);
  const last = points[points.length - 1];
  return {
    id: 'weight',
    label: 'Weight',
    unit: 'kg',
    points,
    last: { display: last.value.toFixed(1), date: last.date },
    // Weight has no single normal range (it depends on height and stage).
    range: null,
    rangeText: null,
    state: 'none',
    link: '/dashboard/stage',
  };
}

// ------------------------------------------------------- blood pressure

/** 140/90: the line for raised blood pressure (also in pregnancy). */
export const BP_LIMIT = { systolic: 140, diastolic: 90 };

export function bpMetric(bpLog: unknown): OverviewMetric | null {
  if (!Array.isArray(bpLog)) return null;
  // Several readings a day: keep the last one listed for each date.
  const byDate = new Map<string, { s: number; d: number }>();
  for (const e of bpLog) {
    const date = ymd((e as { date?: unknown })?.date);
    const s = num((e as { systolic?: unknown })?.systolic);
    const d = num((e as { diastolic?: unknown })?.diastolic);
    if (date && s !== null && d !== null && s > 50 && s < 260 && d > 30 && d < 180) byDate.set(date, { s: Math.round(s), d: Math.round(d) });
  }
  if (!byDate.size) return null;
  const rows = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-MAX_POINTS);
  const [lastDate, lastBp] = rows[rows.length - 1];
  const high = lastBp.s >= BP_LIMIT.systolic || lastBp.d >= BP_LIMIT.diastolic;
  return {
    id: 'bp',
    label: 'Blood pressure',
    unit: 'mmHg',
    points: rows.map(([date, v]) => ({ date, value: v.s })),
    secondary: rows.map(([date, v]) => ({ date, value: v.d })),
    last: { display: `${lastBp.s}/${lastBp.d}`, date: lastDate },
    range: null,
    rangeText: `under ${BP_LIMIT.systolic}/${BP_LIMIT.diastolic}`,
    state: high ? 'high' : 'in',
    link: '/dashboard/stage',
  };
}

// ------------------------------------------------------------- overview

export interface OverviewInput {
  labs: LabRow[];
  periodStarts: unknown[];
  pregWeightLog: unknown;
  maternalWeight: unknown;
  bpLog: unknown;
}

/** Body measures first (cycle, weight, BP), then the labs in KEY_LABS order. */
export function buildHealthOverview(input: OverviewInput): OverviewMetric[] {
  return [
    cycleMetric(input.periodStarts),
    weightMetric(input.pregWeightLog, input.maternalWeight),
    bpMetric(input.bpLog),
    ...labMetrics(input.labs),
  ].filter((m): m is OverviewMetric => m !== null);
}

// ------------------------------------------------------------ sparkline

export interface SparkGeometry {
  /** SVG path per series ("M x y L x y ..."). */
  paths: string[];
  /** The last point of the first series, for the end dot. */
  end: { x: number; y: number };
  /** Shaded normal band (y of top and bottom), when a range is known. */
  band: { y1: number; y2: number } | null;
}

/**
 * Scales one or two series into a width x height box (y grows downward).
 * The scale includes the range bounds so the band is visible and a value
 * just outside it reads as outside. Dates are spaced by time, not by index.
 */
export function sparkGeometry(
  series: OverviewPoint[][],
  range: { low: number | null; high: number | null } | null,
  width: number,
  height: number,
  pad = 3,
): SparkGeometry | null {
  const all = series.flat();
  if (!all.length || !series[0]?.length) return null;
  const values = all.map(p => p.value);
  if (range?.low != null) values.push(range.low);
  if (range?.high != null) values.push(range.high);
  let lo = Math.min(...values), hi = Math.max(...values);
  if (lo === hi) { lo -= 1; hi += 1; }
  const times = all.map(p => toUtc(p.date));
  const t0 = Math.min(...times), t1 = Math.max(...times);
  const x = (d: string) => (t1 === t0 ? width / 2 : pad + ((toUtc(d) - t0) / (t1 - t0)) * (width - 2 * pad));
  const y = (v: number) => pad + (1 - (v - lo) / (hi - lo)) * (height - 2 * pad);
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const paths = series.filter(s => s.length).map(s => s.map((p, i) => `${i ? 'L' : 'M'}${r1(x(p.date))} ${r1(y(p.value))}`).join(' '));
  const lastP = series[0][series[0].length - 1];
  let band: SparkGeometry['band'] = null;
  if (range && (range.low != null || range.high != null)) {
    const top = range.high != null ? y(range.high) : pad;
    const bottom = range.low != null ? y(range.low) : height - pad;
    band = { y1: r1(top), y2: r1(bottom) };
  }
  return { paths, end: { x: r1(x(lastP.date)), y: r1(y(lastP.value)) }, band };
}
