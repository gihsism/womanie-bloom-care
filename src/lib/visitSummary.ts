// "Share with any doctor": a one-page visit summary for a gynaecologist who
// is NOT on Womanie. The page (/dashboard/visit-summary) loads her data and
// lets her tick which sections to print; everything it shows is built by the
// pure helpers below, so the wording and the arithmetic are unit-tested.
//
// Wording rule: calm and clinical, figures only, no interpretation. Dates
// are written one way everywhere, "3 Dec 2026" (lib/dateFormat).

import { lifeStageLabel } from './lifeStageLabels';
import { formatDate } from './dateFormat';
import { parseQuestions } from './visitQuestions';
import { monthsBetween } from './ttc';

export const SUMMARY_SECTIONS = {
  stage: 'Life stage and today',
  cycles: 'Last 3 cycles',
  ttcCycles: 'Cycles and ovulation tests',
  medicines: 'Current medicines',
  symptoms: 'Symptoms and mood (last 30 days)',
  diary: 'Symptom diary, last 4 weeks',
  questions: 'Questions to bring',
  results: 'Recent test results',
  documents: 'Uploaded documents (names only)',
} as const;

export type SummarySection = keyof typeof SUMMARY_SECTIONS;
export const SECTION_ORDER = Object.keys(SUMMARY_SECTIONS) as SummarySection[];

const DAY = 86_400_000;
export const SYMPTOM_WINDOW_DAYS = 30;
export const MAX_RESULTS = 12;
export const MAX_DOCUMENTS = 25;
export const MAX_CYCLES = 3;

/** 'yyyy-mm-dd' (or an ISO timestamp) -> a local calendar Date; null when unreadable. */
export function parseDay(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw));
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const t = Date.parse(String(raw));
  return Number.isNaN(t) ? null : new Date(t);
}

/** A Date -> its LOCAL 'yyyy-mm-dd' (toISOString would shift it a day east of UTC). */
export const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
/** Whole calendar days from a to b (DST-safe). */
export const daysBetween = (a: Date, b: Date) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);

/** A printed date, the same on every phone: "25 Nov 2026". */
export function localDate(d: Date): string {
  return formatDate(d);
}

// ---------------------------------------------------------------- stage

export interface StageInput {
  stage: string | null | undefined;
  dueDate?: string | null;
  /** TTC stage: the day she started trying (yyyy-mm-dd). */
  ttcStartDate?: string | null;
  /** Most recent period start (yyyy-mm-dd), any order of rows is fine upstream. */
  lastPeriodStart?: string | null;
  now?: Date;
  /** Ignored: dates no longer follow the phone's language. */
  locale?: string;
}

const CYCLE_STAGES = ['menstrual-cycle', 'conception', 'contraception'];

/** One or two calm lines: the stage, then the pregnancy week or the cycle day. */
export function stageLines(i: StageInput): string[] {
  const now = i.now ?? new Date();
  const lines: string[] = [`Life stage: ${i.stage ? lifeStageLabel(i.stage) : 'not set'}`];
  if (i.stage === 'pregnancy') {
    const due = parseDay(i.dueDate);
    if (due) {
      const days = 280 - daysBetween(now, due);
      if (days >= 0 && days <= 44 * 7) {
        const w = Math.floor(days / 7);
        const d = days % 7;
        lines.push(`Pregnancy week ${w}+${d} (estimated due date ${localDate(due)})`);
      } else {
        lines.push(`Estimated due date ${localDate(due)}`);
      }
    }
    return lines;
  }
  if (CYCLE_STAGES.includes(i.stage ?? '')) {
    const last = parseDay(i.lastPeriodStart);
    if (last) {
      const day = daysBetween(last, now) + 1;
      if (day >= 1 && day <= 90) {
        lines.push(`Cycle day ${day} (last period started ${localDate(last)})`);
      } else if (day > 90) {
        lines.push(`Last recorded period started ${localDate(last)}`);
      }
    }
  }
  if (i.stage === 'conception') {
    const since = parseDay(i.ttcStartDate);
    if (since && since.getTime() <= now.getTime()) {
      const months = monthsBetween(since, now);
      lines.push(`Trying to conceive since ${localDate(since)} (${months} ${months === 1 ? 'month' : 'months'})`);
    }
  }
  return lines;
}

// ---------------------------------------------------------------- cycles

export interface PeriodRow {
  period_start_date: string;
  period_end_date: string | null;
}

export interface CycleRow {
  start: Date;
  /** Days from this period start to the next one; null for the current cycle. */
  cycleLength: number | null;
  /** Bleeding days, inclusive of both ends; null when no end was logged. */
  periodLength: number | null;
}

/**
 * The current cycle plus the last `n` completed ones, newest first. A
 * cycle's length runs to the NEXT start, so the current (unfinished) cycle
 * has none. Gaps outside 15-90 days are left blank rather than printed as
 * if they were a cycle (a missed log).
 */
export function lastCycles(rows: PeriodRow[], n = MAX_CYCLES): CycleRow[] {
  const seen = new Set<number>();
  const starts = rows
    .map(r => ({ start: parseDay(r.period_start_date), end: parseDay(r.period_end_date) }))
    .filter((r): r is { start: Date; end: Date | null } => r.start != null)
    .sort((a, b) => b.start.getTime() - a.start.getTime())
    .filter(r => (seen.has(startOfDay(r.start)) ? false : (seen.add(startOfDay(r.start)), true)));
  return starts.slice(0, n + 1).map((r, i) => {
    const newer = i > 0 ? starts[i - 1] : null;
    const gap = newer ? daysBetween(r.start, newer.start) : null;
    const len = r.end ? daysBetween(r.start, r.end) + 1 : null;
    return {
      start: r.start,
      cycleLength: gap != null && gap >= 15 && gap <= 90 ? gap : null,
      periodLength: len != null && len >= 1 && len <= 15 ? len : null,
    };
  });
}

// ---------------------------------------------------------------- medicines

export interface MedicineRow {
  name: string;
  dose?: string | null;
  times_per_day?: number | null;
  active?: boolean | null;
}

/** "Folic acid 400 µg, 1× daily". Inactive and nameless rows are dropped. */
export function medicineLines(rows: MedicineRow[]): string[] {
  return rows
    .filter(m => m.active !== false && typeof m.name === 'string' && m.name.trim())
    .map(m => {
      const parts = [m.name.trim()];
      if (m.dose && m.dose.trim()) parts[0] += ` ${m.dose.trim()}`;
      if (m.times_per_day && m.times_per_day > 0) parts.push(`${m.times_per_day}× daily`);
      return parts.join(', ');
    });
}

// ---------------------------------------------------------------- symptoms + mood

export interface SignalRow {
  signal_date: string;
  symptoms: string[] | string | null;
  mood: string[] | string | null;
}

export interface Count { label: string; days: number }
export interface SignalSummary {
  daysLogged: number;
  symptoms: Count[];
  moods: Count[];
}

const LABELS: Record<string, string> = {
  tender_breasts: 'Breast tenderness',
  back_pain: 'Back pain',
  hot_flashes: 'Hot flushes',
  night_sweats: 'Night sweats',
  mood_swings: 'Mood swings',
};

/** 'back_pain' -> 'Back pain'. */
export function humanLabel(key: string): string {
  if (LABELS[key]) return LABELS[key];
  const s = key.replace(/[_-]+/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s;
}

function asList(v: string[] | string | null | undefined): string[] {
  if (Array.isArray(v)) return v.filter(x => typeof x === 'string' && x.trim());
  if (typeof v === 'string' && v.trim()) {
    try {
      const p = JSON.parse(v);
      if (Array.isArray(p)) return p.filter(x => typeof x === 'string' && x.trim());
    } catch { /* a plain word */ }
    return [v.trim()];
  }
  return [];
}

function rank(counts: Map<string, number>, top: number): Count[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, top)
    .map(([k, days]) => ({ label: humanLabel(k), days }));
}

/** Days with each symptom / mood in the last 30 days (one count per day). */
export function summariseSignals(rows: SignalRow[], now = new Date(), windowDays = SYMPTOM_WINDOW_DAYS): SignalSummary {
  const sym = new Map<string, number>();
  const mood = new Map<string, number>();
  const days = new Set<number>();
  const perDay = new Map<number, { s: Set<string>; m: Set<string> }>();
  for (const r of rows) {
    const d = parseDay(r.signal_date);
    if (!d) continue;
    const ago = daysBetween(d, now);
    if (ago < 0 || ago >= windowDays) continue;
    const key = startOfDay(d);
    const entry = perDay.get(key) ?? { s: new Set<string>(), m: new Set<string>() };
    asList(r.symptoms).forEach(x => entry.s.add(x));
    asList(r.mood).forEach(x => entry.m.add(x));
    perDay.set(key, entry);
  }
  for (const [key, e] of perDay) {
    if (e.s.size || e.m.size) days.add(key);
    e.s.forEach(x => sym.set(x, (sym.get(x) ?? 0) + 1));
    e.m.forEach(x => mood.set(x, (mood.get(x) ?? 0) + 1));
  }
  return { daysLogged: days.size, symptoms: rank(sym, 6), moods: rank(mood, 4) };
}

/** "Cramps on 4 days, Headache on 2 days". */
export function countSentence(list: Count[]): string {
  return list.map(c => `${c.label} on ${c.days} ${c.days === 1 ? 'day' : 'days'}`).join(', ');
}

// ---------------------------------------------------------------- questions

/** Open (not yet asked) questions across her saved visit lists, de-duplicated. */
export function openQuestions(rows: Array<{ questions: unknown }>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    for (const q of parseQuestions(r.questions)) {
      const k = q.text.toLowerCase();
      if (q.asked || seen.has(k)) continue;
      seen.add(k);
      out.push(q.text);
    }
  }
  return out;
}

// ---------------------------------------------------------------- results

export interface ResultRow {
  title: string;
  value: string | number | null;
  unit: string | null;
  reference_range: string | null;
  status: string | null;
  date_recorded: string | null;
  data_type?: string | null;
}

export interface ResultLine {
  name: string;
  value: string;
  range: string;
  flag: string;
  date: Date | null;
}

const FLAG: Record<string, string> = {
  critical: 'Outside range (marked urgent)',
  abnormal: 'Outside range',
  borderline: 'Borderline',
  normal: 'Within range',
  expected: 'Expected for life stage',
};

/**
 * Most recent lab results, newest first; one line per test (the latest
 * reading wins). `nameOf` maps a raw title to a friendly name.
 */
export function recentResults(rows: ResultRow[], nameOf: (t: string) => string = t => t, max = MAX_RESULTS): ResultLine[] {
  const latest = new Map<string, ResultRow & { _d: Date | null }>();
  for (const r of rows) {
    if (r.data_type && r.data_type !== 'lab_result') continue;
    if (!r.title || r.value == null || String(r.value).trim() === '') continue;
    const name = nameOf(r.title);
    const d = parseDay(r.date_recorded);
    const prev = latest.get(name);
    if (!prev || (d?.getTime() ?? 0) > (prev._d?.getTime() ?? 0)) latest.set(name, { ...r, _d: d });
  }
  return [...latest.entries()]
    .sort((a, b) => (b[1]._d?.getTime() ?? 0) - (a[1]._d?.getTime() ?? 0) || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([name, r]) => ({
      name,
      value: `${String(r.value).trim()}${r.unit ? ` ${r.unit}` : ''}`,
      range: r.reference_range?.trim() || '',
      flag: r.status ? FLAG[r.status] ?? '' : '',
      date: r._d,
    }));
}

// ---------------------------------------------------------------- documents

export interface DocumentRow {
  file_name: string | null;
  ai_suggested_name?: string | null;
  uploaded_at?: string | null;
}

/** Names only (the readable name when the analyser gave one), newest first. */
export function documentNames(rows: DocumentRow[], max = MAX_DOCUMENTS): { names: string[]; more: number } {
  const names = [...rows]
    .sort((a, b) => (Date.parse(b.uploaded_at ?? '') || 0) - (Date.parse(a.uploaded_at ?? '') || 0))
    .map(d => (d.ai_suggested_name?.trim() || d.file_name?.trim() || ''))
    .filter(Boolean);
  return { names: names.slice(0, max), more: Math.max(0, names.length - max) };
}

// ---------------------------------------------------------------- footer + selection

export function footerLine(now = new Date()): string {
  return `Generated by Womanie on ${localDate(now)} from information the patient entered or uploaded. Not a diagnosis and not a medical record.`;
}

/** All sections start ticked; she unticks what she does not want to share. */
export const defaultSelection = (): Record<SummarySection, boolean> =>
  Object.fromEntries(SECTION_ORDER.map(k => [k, true])) as Record<SummarySection, boolean>;

/**
 * The sections offered for her stage, in page order. Menopause stages add the
 * 4-week symptom diary; trying to conceive swaps "Last 3 cycles" for the
 * 6-cycle table with ovulation tests (it holds the same lengths and more).
 */
export function sectionsForStage(stage: string | null | undefined): SummarySection[] {
  const drop = new Set<SummarySection>();
  if (stage !== 'menopause' && stage !== 'post-menopause') drop.add('diary');
  if (stage === 'conception') drop.add('cycles');
  else drop.add('ttcCycles');
  return SECTION_ORDER.filter(k => !drop.has(k));
}

/** The sections to print, in page order (limited to `offered` when given). */
export const selectedSections = (
  sel: Partial<Record<SummarySection, boolean>>,
  offered: SummarySection[] = SECTION_ORDER,
): SummarySection[] => offered.filter(k => sel[k]);
