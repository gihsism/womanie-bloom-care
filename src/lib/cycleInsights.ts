// "Your cycle, explained" — plain-language cycle insights from her own logs.
//
// Pure functions only (no React, no db): the card on the stage page loads
// period_tracking + daily_health_signals (+ births, to recognise a
// pregnancy break) and hands them here.
//
// Clinical ranges — FIGO System 1 (Munro MG et al., "The two FIGO systems
// for normal and abnormal uterine bleeding symptoms and classification of
// causes of abnormal uterine bleeding in the reproductive years: 2018
// revisions", Int J Gynaecol Obstet 2018;143:393-408):
//   - frequency: normal 24–38 days; <24 "frequent", >38 "infrequent";
//     no bleeding for 90 days = absent (amenorrhoea).
//   - regularity: shortest-to-longest cycle variation ≤7–9 days is
//     regular (≤7 d for ages 26–41, ≤9 d for 18–25 and 42–45); ≥8–10 d
//     is irregular. We call ≤7 "regular", 8–9 "a bit variable" (inside
//     FIGO's age-dependent band) and ≥10 "irregular".
//   - duration: normal ≤8 days; >8 days is "prolonged".
//
// Everything here is descriptive, never diagnostic. The doctor line only
// appears when a FIGO threshold is crossed, and its wording stays calm.

const DAY_MS = 86_400_000;

export const FIGO = {
  cycleMin: 24,
  cycleMax: 38,
  regularMaxVariation: 7,
  variableMaxVariation: 9,
  periodMaxDays: 8,
  absentDays: 90,
} as const;

// Gaps between logged period starts outside this window are not treated
// as cycles: shorter is almost always a duplicate / spotting entry, longer
// almost always means she stopped logging for a while (or was pregnant).
const MIN_PLAUSIBLE_GAP = 15;
const MAX_PLAUSIBLE_GAP = 60;
const MAX_PLAUSIBLE_PERIOD = 15;
// Only the most recent cycles describe her cycle as it is now.
const RECENT_CYCLES = 6;
// A pregnancy break: ~40 weeks before a birth until ~8 weeks after.
const PREGNANCY_DAYS = 280;
const POSTPARTUM_DAYS = 56;
const DEFAULT_PERIOD_DAYS = 5;
const PMS_DAYS = 5;

export interface PeriodLog {
  period_start_date: string;
  period_end_date?: string | null;
}

export interface SymptomLog {
  signal_date: string;
  symptoms: string[] | null;
}

/** A stretch when no cycle is expected (pregnancy, early postpartum). */
export interface CycleBreak {
  start: string;
  end: string;
}

export type Regularity = 'regular' | 'a bit variable' | 'irregular';
export type Phase = 'period' | 'follicular' | 'ovulation' | 'luteal' | 'premenstrual';

export interface Cycle {
  start: string;
  length: number;
}

export interface PhaseSymptom {
  key: string;
  label: string;
  phase: Phase;
  count: number;
  share: number;
  sentence: string;
}

export interface DoctorFlag {
  kind: 'short-cycles' | 'long-cycles' | 'long-periods' | 'no-period';
  text: string;
}

export interface CycleInsights {
  cycles: Cycle[];
  cycleCount: number;
  avgCycleLength: number | null;
  shortestCycle: number | null;
  longestCycle: number | null;
  variation: number | null;
  regularity: Regularity | null;
  avgPeriodLength: number | null;
  periodCount: number;
  skippedGaps: number;
  confidenceNote: string | null;
  symptomsByPhase: Partial<Record<Phase, { label: string; count: number }[]>>;
  symptomSentences: PhaseSymptom[];
  doctorFlags: DoctorFlag[];
  doctorLine: string | null;
  summary: string | null;
}

// ---------- date helpers (calendar days, UTC, DST-safe) ----------

function dayNum(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return Number.isNaN(t) ? null : Math.round(t / DAY_MS);
}

function isoOf(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function inBreak(day: number, breaks: { s: number; e: number }[]): boolean {
  return breaks.some(b => day >= b.s && day <= b.e);
}

function normBreaks(breaks: CycleBreak[] = []) {
  const out: { s: number; e: number }[] = [];
  for (const b of breaks) {
    const s = dayNum(b.start);
    const e = dayNum(b.end);
    if (s != null && e != null && e >= s) out.push({ s, e });
  }
  return out;
}

/** Breaks implied by births: ~40 weeks before until ~8 weeks after. */
export function pregnancyBreaksFromBirths(birthDates: (string | null | undefined)[]): CycleBreak[] {
  const out: CycleBreak[] = [];
  for (const d of birthDates) {
    const n = d ? dayNum(d) : null;
    if (n == null) continue;
    out.push({ start: isoOf(n - PREGNANCY_DAYS), end: isoOf(n + POSTPARTUM_DAYS) });
  }
  return out;
}

// ---------- symptoms ----------

const SYMPTOM_LABELS: Record<string, string> = {
  cramps: 'Cramps',
  headache: 'Headaches',
  bloating: 'Bloating',
  breast_tenderness: 'Breast tenderness',
  back_pain: 'Back pain',
  fatigue: 'Tiredness',
  nausea: 'Nausea',
  acne: 'Breakouts',
  insomnia: 'Trouble sleeping',
  cravings: 'Cravings',
  dizziness: 'Dizziness',
  hot_flashes: 'Hot flushes',
  joint_pain: 'Joint pain',
  anxiety: 'Anxiety',
};

const SYMPTOM_ALIASES: Record<string, string> = {
  headaches: 'headache',
  tender_breasts: 'breast_tenderness',
  hot_flushes: 'hot_flashes',
  tiredness: 'fatigue',
};

/** 'Breast tenderness', 'tender_breasts', ' Headaches ' -> one stable key. */
export function normaliseSymptom(raw: string): string {
  const k = String(raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z_]/g, '');
  return SYMPTOM_ALIASES[k] ?? k;
}

export function symptomLabel(key: string): string {
  if (SYMPTOM_LABELS[key]) return SYMPTOM_LABELS[key];
  const s = key.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------- cycles ----------

interface Built {
  cycles: (Cycle & { startDay: number; periodDays: number | null })[];
  starts: { day: number; periodDays: number | null }[];
  skippedGaps: number;
}

function buildCycles(periods: PeriodLog[], breaks: { s: number; e: number }[]): Built {
  // One entry per start day (a duplicate entry keeps the one with an end date).
  const byDay = new Map<number, number | null>();
  for (const p of periods ?? []) {
    const s = dayNum(p.period_start_date);
    if (s == null) continue;
    const e = p.period_end_date ? dayNum(p.period_end_date) : null;
    let len: number | null = e != null ? e - s + 1 : null;
    if (len != null && (len < 1 || len > MAX_PLAUSIBLE_PERIOD)) len = null;
    if (!byDay.has(s) || (byDay.get(s) == null && len != null)) byDay.set(s, len);
  }
  const sorted = [...byDay.entries()]
    .map(([day, periodDays]) => ({ day, periodDays }))
    .sort((a, b) => a.day - b.day);
  // A "start" only days after the previous one is spotting or a duplicate
  // entry, not a new period: fold it into the period before it, so it
  // can't split one cycle into a too-short pair.
  const starts: Built['starts'] = [];
  for (const s of sorted) {
    const prev = starts[starts.length - 1];
    if (prev && s.day - prev.day < MIN_PLAUSIBLE_GAP) continue;
    starts.push(s);
  }

  const cycles: Built['cycles'] = [];
  let skippedGaps = 0;
  for (let i = 1; i < starts.length; i++) {
    const a = starts[i - 1];
    const b = starts[i];
    const gap = b.day - a.day;
    // A pregnancy (or early postpartum) inside the gap: not a cycle, and
    // not "missed logging" either — just leave it out quietly.
    const crossesBreak = breaks.some(br => br.s < b.day && br.e > a.day);
    if (crossesBreak) continue;
    if (gap > MAX_PLAUSIBLE_GAP) { skippedGaps++; continue; } // logging gap
    cycles.push({ start: isoOf(a.day), startDay: a.day, length: gap, periodDays: a.periodDays });
  }
  return { cycles, starts, skippedGaps };
}

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null;
}

export function regularityVerdict(variation: number): Regularity {
  if (variation <= FIGO.regularMaxVariation) return 'regular';
  if (variation <= FIGO.variableMaxVariation) return 'a bit variable';
  return 'irregular';
}

// ---------- phases ----------

/**
 * Phase of a day, counted from the start of its cycle.
 * `dayIndex` 0 = first day of the period; `daysBefore` = days until the
 * next period starts (null when the next start is not known yet).
 */
export function phaseOfDay(dayIndex: number, daysBefore: number | null, periodDays: number): Phase | null {
  if (dayIndex < 0) return null;
  if (dayIndex < periodDays) return 'period';
  if (daysBefore == null) return null;
  if (daysBefore <= 0) return null;
  if (daysBefore <= PMS_DAYS) return 'premenstrual';
  // Ovulation usually falls ~12–16 days before the next period.
  if (daysBefore >= 12 && daysBefore <= 16) return 'ovulation';
  if (daysBefore < 12) return 'luteal';
  return 'follicular';
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function spanText(lo: number, hi: number): string {
  return lo === hi ? `${lo}` : `${lo}–${hi}`;
}

function verbFor(label: string): string {
  // "Headaches show up", "Bloating shows up"
  return /s$/i.test(label) && !/ness$/i.test(label) ? 'show up' : 'shows up';
}

function timingPhrase(phase: Phase, offsets: number[]): string {
  const sorted = [...offsets].sort((a, b) => a - b);
  // Middle half of her own occurrences, so one odd day doesn't stretch it.
  const lo = sorted[Math.floor((sorted.length - 1) * 0.25)];
  const hi = sorted[Math.ceil((sorted.length - 1) * 0.75)];
  switch (phase) {
    case 'premenstrual':
      return `${spanText(lo, hi)} ${lo === hi && lo === 1 ? 'day' : 'days'} before your period`;
    case 'period':
      return `on ${lo === hi ? 'day' : 'days'} ${spanText(lo, hi)} of your period`;
    case 'ovulation':
      return 'around ovulation, about two weeks before your period';
    case 'luteal':
      return 'in the second half of your cycle, about a week before your period';
    case 'follicular':
      return 'in the days after your period ends';
  }
}

const PHASE_ORDER: Phase[] = ['period', 'follicular', 'ovulation', 'luteal', 'premenstrual'];

export const PHASE_LABEL: Record<Phase, string> = {
  period: 'During your period',
  follicular: 'After your period',
  ovulation: 'Around ovulation',
  luteal: 'Second half of your cycle',
  premenstrual: 'The days before your period',
};

interface Placed { phase: Phase; offset: number; cycleStart: number }

function placeDay(
  day: number,
  starts: Built['starts'],
  validStarts: Set<number>,
  avgPeriod: number,
): Placed | null {
  // Find the latest start on or before this day.
  let idx = -1;
  for (let i = 0; i < starts.length; i++) {
    if (starts[i].day <= day) idx = i; else break;
  }
  if (idx < 0) return null;
  const s = starts[idx];
  const next = starts[idx + 1];
  const periodDays = s.periodDays ?? avgPeriod;
  const dayIndex = day - s.day;
  if (next) {
    // Only cycles we trust (not a logging gap or a pregnancy) give phases.
    if (!validStarts.has(s.day)) return null;
    const phase = phaseOfDay(dayIndex, next.day - day, periodDays);
    if (!phase) return null;
    return { phase, offset: phase === 'period' ? dayIndex + 1 : next.day - day, cycleStart: s.day };
  }
  // Current cycle: only her period days are certain.
  if (dayIndex < periodDays) return { phase: 'period', offset: dayIndex + 1, cycleStart: s.day };
  return null;
}

// ---------- main ----------

export interface CycleInsightsInput {
  periods: PeriodLog[];
  symptoms?: SymptomLog[];
  breaks?: CycleBreak[];
  /** 'yyyy-MM-dd' of today (injectable for tests). */
  today: string;
}

export function computeCycleInsights({ periods, symptoms = [], breaks = [], today }: CycleInsightsInput): CycleInsights {
  const br = normBreaks(breaks);
  const todayN = dayNum(today) ?? Math.round(Date.now() / DAY_MS);
  const built = buildCycles(periods, br);
  const recent = built.cycles.slice(-RECENT_CYCLES);
  const lengths = recent.map(c => c.length);

  const avgCycle = mean(lengths);
  const shortest = lengths.length ? Math.min(...lengths) : null;
  const longest = lengths.length ? Math.max(...lengths) : null;
  const variation = shortest != null && longest != null && lengths.length >= 2 ? longest - shortest : null;
  const regularity = variation != null ? regularityVerdict(variation) : null;

  // Period length from her most recent logged periods with an end date.
  const recentPeriods = built.starts.filter(s => s.periodDays != null).slice(-RECENT_CYCLES);
  const periodLens = recentPeriods.map(s => s.periodDays as number);
  const avgPeriod = mean(periodLens);

  const cycleCount = recent.length;
  let confidenceNote: string | null = null;
  if (built.starts.length === 0) {
    confidenceNote = null;
  } else if (cycleCount === 0 && built.starts.length === 1) {
    confidenceNote = 'You have one period logged so far. Once your next one starts we can show your cycle length, and after 3 cycles the picture gets reliable.';
  } else if (cycleCount === 0) {
    // Several periods, but every gap between them was left out (a pregnancy
    // or a long break in logging): "one period logged" would be untrue.
    confidenceNote = 'None of the gaps between your logged periods can be counted as a cycle yet (a pregnancy or a long break in logging sits between them). Once your next period starts we can show your cycle length, and after 3 cycles the picture gets reliable.';
  } else if (cycleCount < 3) {
    confidenceNote = `Based on ${plural(cycleCount, 'cycle')} so far, so treat this as a first look. After 3 cycles it gets more reliable.`;
  }

  // ----- symptoms by phase -----
  const validStarts = new Set(built.cycles.map(c => c.startDay));
  const periodDefault = Math.round(avgPeriod ?? DEFAULT_PERIOD_DAYS);
  const tally = new Map<string, Map<Phase, { n: number; offsets: number[]; cycles: Set<number> }>>();
  const totals = new Map<string, number>();
  const seenDays = new Set<number>();
  for (const s of symptoms ?? []) {
    const d = dayNum(s.signal_date);
    if (d == null || d > todayN || seenDays.has(d) || inBreak(d, br)) continue;
    const list = Array.isArray(s.symptoms) ? s.symptoms : [];
    if (list.length === 0) continue;
    seenDays.add(d);
    const placed = placeDay(d, built.starts, validStarts, periodDefault);
    if (!placed) continue;
    for (const key of new Set(list.map(normaliseSymptom).filter(Boolean))) {
      let byPhase = tally.get(key);
      if (!byPhase) tally.set(key, (byPhase = new Map()));
      let t = byPhase.get(placed.phase);
      if (!t) byPhase.set(placed.phase, (t = { n: 0, offsets: [], cycles: new Set() }));
      t.n++;
      t.offsets.push(placed.offset);
      t.cycles.add(placed.cycleStart);
      totals.set(key, (totals.get(key) ?? 0) + 1);
    }
  }

  const symptomsByPhase: CycleInsights['symptomsByPhase'] = {};
  for (const phase of PHASE_ORDER) {
    const rows: { label: string; count: number }[] = [];
    for (const [key, byPhase] of tally) {
      const t = byPhase.get(phase);
      if (t && t.n >= 2) rows.push({ label: symptomLabel(key), count: t.n });
    }
    rows.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    if (rows.length) symptomsByPhase[phase] = rows.slice(0, 3);
  }

  const symptomSentences: PhaseSymptom[] = [];
  for (const [key, byPhase] of tally) {
    const total = totals.get(key) ?? 0;
    let best: { phase: Phase; n: number; offsets: number[]; cycles: Set<number> } | null = null;
    for (const [phase, t] of byPhase) if (!best || t.n > best.n) best = { phase, ...t };
    if (!best) continue;
    const share = best.n / total;
    // A pattern needs repetition: 3+ days, in 2+ different cycles, and
    // most of the time in the same phase.
    if (best.n < 3 || best.cycles.size < 2 || share < 0.5) continue;
    const label = symptomLabel(key);
    symptomSentences.push({
      key,
      label,
      phase: best.phase,
      count: best.n,
      share,
      sentence: `${label} ${verbFor(label)} mostly ${timingPhrase(best.phase, best.offsets)}.`,
    });
  }
  symptomSentences.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  // ----- doctor flags (FIGO thresholds, calm wording) -----
  const doctorFlags: DoctorFlag[] = [];
  const short = lengths.filter(l => l < FIGO.cycleMin).length;
  const long = lengths.filter(l => l > FIGO.cycleMax).length;
  if (short >= 2) {
    doctorFlags.push({ kind: 'short-cycles', text: `${short} of your recent cycles were shorter than ${FIGO.cycleMin} days.` });
  }
  if (long >= 2) {
    doctorFlags.push({ kind: 'long-cycles', text: `${long} of your recent cycles were longer than ${FIGO.cycleMax} days.` });
  }
  const longPeriods = periodLens.filter(l => l > FIGO.periodMaxDays).length;
  if (longPeriods >= 2) {
    doctorFlags.push({ kind: 'long-periods', text: `${longPeriods} of your recent periods lasted more than ${FIGO.periodMaxDays} days.` });
  }
  const lastStart = built.starts.length ? built.starts[built.starts.length - 1].day : null;
  if (lastStart != null && !inBreak(todayN, br)) {
    const since = todayN - lastStart;
    if (since >= FIGO.absentDays) {
      doctorFlags.push({ kind: 'no-period', text: `Your last logged period started ${since} days ago.` });
    }
  }
  const doctorLine = doctorFlags.length
    ? 'This isn’t a diagnosis, and there are many ordinary reasons for it, but it’s worth mentioning to a doctor or gynaecologist at your next visit.'
      + (doctorFlags.some(f => f.kind === 'no-period') ? ' If you simply haven’t logged a recent period, add it and this note will go away.' : '')
    : null;

  // ----- one-line summary -----
  let summary: string | null = null;
  if (avgCycle != null) {
    const a = Math.round(avgCycle);
    summary = `Your cycle averages ${plural(a, 'day')}`;
    if (avgPeriod != null) summary += `, with periods of about ${plural(Math.round(avgPeriod), 'day')}`;
    summary += '.';
    if (regularity && shortest != null && longest != null) {
      const within = a >= FIGO.cycleMin && a <= FIGO.cycleMax;
      const verdict = regularity === 'regular'
        ? `That’s regular: your cycles ranged from ${shortest} to ${longest} days.`
        : regularity === 'a bit variable'
          ? `That’s a bit variable: your cycles ranged from ${shortest} to ${longest} days, which is still common.`
          : `That’s irregular: your cycles ranged from ${shortest} to ${longest} days.`;
      summary += ` ${verdict}`;
      if (within && regularity !== 'irregular') summary += ` A typical cycle is anywhere from ${FIGO.cycleMin} to ${FIGO.cycleMax} days.`;
    }
  } else if (avgPeriod != null) {
    summary = `Your period lasted about ${plural(Math.round(avgPeriod), 'day')}.`;
  }

  return {
    cycles: recent.map(c => ({ start: c.start, length: c.length })),
    cycleCount,
    avgCycleLength: avgCycle != null ? Math.round(avgCycle * 10) / 10 : null,
    shortestCycle: shortest,
    longestCycle: longest,
    variation,
    regularity,
    avgPeriodLength: avgPeriod != null ? Math.round(avgPeriod * 10) / 10 : null,
    periodCount: periodLens.length,
    skippedGaps: built.skippedGaps,
    confidenceNote,
    symptomsByPhase,
    symptomSentences: symptomSentences.slice(0, 3),
    doctorFlags,
    doctorLine,
    summary,
  };
}
