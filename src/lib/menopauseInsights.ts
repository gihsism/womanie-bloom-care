// "Your symptoms over time" for the menopause stages (the app treats
// perimenopause as the menopause stage). Pure logic, unit-tested; the card
// is MenopauseSymptomTrends.
//
// Reads what she already logs in daily_health_signals:
//   - hot flushes per day: the "Hot flashes: N" segment DailyLogging writes
//     into notes (falls back to the "Hot flashes" symptom tag as a day
//     count when she ticked the tag but typed no number)
//   - night sweats, joint pain: symptom tags
//   - sleep: "Sleep: 7.5h" in notes (falls back to poor-sleep days:
//     "Sleep quality: 1/5" or 2/5, or the "Insomnia" tag)
//   - mood: low-mood days (sad / irritable / anxious, or the "Anxiety" tag)
// and the medications table (started_on, stopped_on or active=false +
// updated_at) to tie a change to a medicine start or stop date.
//
// Wording rule: what she logged, in plain numbers, never a diagnosis; a link
// to a medicine is a date coincidence, and the card says so.

import { daysBetween, parseDay } from './visitSummary';

export const WINDOW_WEEKS = 12;
const WINDOW_DAYS = WINDOW_WEEKS * 7;
/** "Recent" = the last 4 weeks; "earlier" = the weeks before that. */
const RECENT_DAYS = 28;
/** Days before a medicine start/stop that count as "before". */
const BEFORE_DAYS = 42;
/** Data days needed on each side before a from -> to claim is made. */
export const MIN_SIDE_DAYS = 3;
/** Days after a medicine change before we compare (too soon says nothing). */
const MIN_DAYS_AFTER_EVENT = 7;

export type MetricKey = 'hot_flushes' | 'night_sweats' | 'sleep' | 'mood' | 'joint_pain';
/** count = mean per logged day; perWeek = days with it per 7 logged days; hours = mean. */
export type MetricKind = 'count' | 'perWeek' | 'hours';

export interface SignalInput {
  signal_date: string;
  symptoms?: string[] | string | null;
  mood?: string[] | string | null;
  notes?: string | null;
}

export interface MedicationInput {
  id?: string;
  name: string;
  started_on?: string | null;
  stopped_on?: string | null;
  active?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface MedicineEvent {
  name: string;
  kind: 'start' | 'stop';
  date: Date;
  /** 0 = hormone therapy, 1 = other menopause medicine, 2 = anything else. */
  priority: 0 | 1 | 2;
}

export interface MetricTrend {
  key: MetricKey;
  label: string;
  kind: MetricKind;
  /** Oldest week first; null = nothing logged for this metric that week. */
  weekly: Array<number | null>;
  dataDays: number;
  before: number | null;
  after: number | null;
  direction: 'down' | 'up' | 'steady' | null;
  /** Did it move the way she would want (fewer flushes, more sleep)? */
  improved: boolean | null;
  /** The plain sentence, or null when there is too little to compare. */
  sentence: string | null;
}

export type Confidence = 'none' | 'low' | 'medium' | 'high';

export interface MenopauseInsight {
  loggedDays: number;
  weeksWithLogs: number;
  confidence: Confidence;
  confidenceNote: string;
  metrics: MetricTrend[];
  /** The medicine change the comparison is anchored on, if any. */
  event: MedicineEvent | null;
  /** Up to three plain sentences, most useful first. */
  summary: string[];
  /** Shown whenever a sentence names a medicine. */
  caveat: string | null;
}

// ------------------------------------------------------------- medicines

const HORMONE = /\b(hrt|mht|hormone|oestr|estr|estrad|oestrad|evorel|estradot|sandrena|oestrogel|estrogel|lenzetto|femoston|kliogest|kliofem|indivina|activelle|premarin|conjugated|utrogest|progest|dydrogesterone|duphaston|tibolon|livial|mirena|bijuva|duavee|testosteron|testogel|androfeme)/i;
const MENOPAUSE_NON_HORMONAL = /\b(fezolinetant|veoza|elinzanetant|lynkuet|clonidin|gabapentin|oxybutynin)/i;

export function medicinePriority(name: string): 0 | 1 | 2 {
  if (HORMONE.test(name)) return 0;
  if (MENOPAUSE_NON_HORMONAL.test(name)) return 1;
  return 2;
}

export const isHormoneTherapy = (name: string) => medicinePriority(name) === 0;

/** Start date: started_on, else the day it was added. */
export function startDate(m: MedicationInput): Date | null {
  return parseDay(m.started_on) ?? parseDay(m.created_at);
}

/** Stop date: stopped_on, else (for a stopped medicine) the day it was last updated; null = still taking it. */
export function stopDate(m: MedicationInput): Date | null {
  const explicit = parseDay(m.stopped_on);
  if (explicit) return explicit;
  if (m.active === false) return parseDay(m.updated_at);
  return null;
}

/** Every start / stop that falls inside the window, newest first within each priority. */
export function medicineEvents(meds: MedicationInput[], now = new Date(), windowDays = WINDOW_DAYS): MedicineEvent[] {
  const out: MedicineEvent[] = [];
  for (const m of meds) {
    const name = typeof m.name === 'string' ? m.name.trim() : '';
    if (!name) continue;
    const priority = medicinePriority(name);
    const s = startDate(m);
    const e = stopDate(m);
    for (const [kind, date] of [['start', s], ['stop', e]] as const) {
      if (!date) continue;
      const ago = daysBetween(date, now);
      if (ago < 0 || ago >= windowDays) continue;
      out.push({ name, kind, date, priority });
    }
  }
  return out.sort((a, b) => a.priority - b.priority || b.date.getTime() - a.date.getTime());
}

// ------------------------------------------------------------- parsing

function asList(v: string[] | string | null | undefined): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim());
  if (typeof v === 'string' && v.trim()) {
    try {
      const p = JSON.parse(v);
      if (Array.isArray(p)) return p.filter((x): x is string => typeof x === 'string').map(x => x.trim());
    } catch { /* a plain word */ }
    return [v.trim()];
  }
  return [];
}

const norm = (s: string) => s.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
const HOT_TAGS = new Set(['hot flashes', 'hot flushes', 'hot flash', 'hot flush']);
const SWEAT_TAGS = new Set(['night sweats', 'night sweat']);
const JOINT_TAGS = new Set(['joint pain', 'joint stiffness', 'joint pains']);
const LOW_MOODS = new Set(['sad', 'irritable', 'anxious', 'low', 'down', 'depressed']);
const LOW_MOOD_TAGS = new Set(['anxiety', 'mood swings', 'mood changes', 'low mood']);
const POOR_SLEEP_TAGS = new Set(['insomnia', 'sleep issues', 'sleep disruption', 'poor sleep']);

interface Day {
  ago: number;
  logged: boolean;
  hotCount: number | null;
  hotTag: boolean;
  sweats: boolean;
  joint: boolean;
  lowMood: boolean;
  sleepHours: number | null;
  poorSleep: boolean;
  sleepKnown: boolean;
}

function parseDayRow(r: SignalInput, ago: number): Day {
  const notes = typeof r.notes === 'string' ? r.notes : '';
  const tags = asList(r.symptoms).map(norm);
  const moods = asList(r.mood).map(norm);
  const hot = /Hot (?:flashes|flushes):\s*(\d+)/i.exec(notes);
  const hotCount = hot ? Math.min(parseInt(hot[1], 10), 60) : null;
  const sh = /Sleep:\s*(\d+(?:\.\d+)?)\s*h/i.exec(notes);
  const hours = sh ? parseFloat(sh[1]) : null;
  const sleepHours = hours != null && hours > 0 && hours <= 16 ? hours : null;
  const sq = /Sleep quality:\s*([1-5])\/5/i.exec(notes);
  const quality = sq ? Number(sq[1]) : null;
  const poorSleepTag = tags.some(t => POOR_SLEEP_TAGS.has(t));
  return {
    ago,
    logged: tags.length > 0 || moods.length > 0 || notes.trim().length > 0,
    hotCount,
    hotTag: tags.some(t => HOT_TAGS.has(t)),
    sweats: tags.some(t => SWEAT_TAGS.has(t)),
    joint: tags.some(t => JOINT_TAGS.has(t)),
    lowMood: moods.some(m => LOW_MOODS.has(m)) || tags.some(t => LOW_MOOD_TAGS.has(t)),
    sleepHours,
    poorSleep: poorSleepTag || (quality != null && quality <= 2),
    sleepKnown: sleepHours != null || quality != null || poorSleepTag,
  };
}

// ------------------------------------------------------------- metrics

interface MetricSpec {
  key: MetricKey;
  label: string;
  kind: MetricKind;
  /** The day's value, or null when the day says nothing about this metric. */
  value: (d: Day) => number | null;
  /** Lower is better (true for everything but sleep hours). */
  lowerIsBetter: boolean;
  /** Smallest change worth a sentence. */
  minChange: number;
}

const perWeekValue = (flag: (d: Day) => boolean) => (d: Day) => (d.logged ? (flag(d) ? 1 : 0) : null);

function buildSpecs(days: Day[]): MetricSpec[] {
  const hasHotCounts = days.filter(d => d.hotCount != null).length >= MIN_SIDE_DAYS;
  const hasHours = days.filter(d => d.sleepHours != null).length >= MIN_SIDE_DAYS;
  return [
    hasHotCounts
      ? { key: 'hot_flushes', label: 'Hot flushes', kind: 'count', value: d => d.hotCount, lowerIsBetter: true, minChange: 0.75 }
      : { key: 'hot_flushes', label: 'Hot flushes', kind: 'perWeek', value: perWeekValue(d => d.hotTag || (d.hotCount ?? 0) > 0), lowerIsBetter: true, minChange: 1 },
    { key: 'night_sweats', label: 'Night sweats', kind: 'perWeek', value: perWeekValue(d => d.sweats), lowerIsBetter: true, minChange: 1 },
    hasHours
      ? { key: 'sleep', label: 'Sleep', kind: 'hours', value: d => d.sleepHours, lowerIsBetter: false, minChange: 0.5 }
      : { key: 'sleep', label: 'Poor-sleep nights', kind: 'perWeek', value: d => (d.sleepKnown ? (d.poorSleep ? 1 : 0) : null), lowerIsBetter: true, minChange: 1 },
    { key: 'mood', label: 'Low-mood days', kind: 'perWeek', value: perWeekValue(d => d.lowMood), lowerIsBetter: true, minChange: 1 },
    { key: 'joint_pain', label: 'Joint pain', kind: 'perWeek', value: perWeekValue(d => d.joint), lowerIsBetter: true, minChange: 1 },
  ];
}

/** Mean of the values; perWeek metrics are scaled to "days per week". */
function aggregate(values: number[], kind: MetricKind): number | null {
  if (values.length === 0) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return kind === 'perWeek' ? mean * 7 : mean;
}

/** "~5", "~0.5", "~6.5": whole numbers from 2 up, halves below (and for hours). */
export function approx(n: number, kind: MetricKind): string {
  const v = kind === 'hours' || n < 2 ? Math.round(n * 2) / 2 : Math.round(n);
  return `~${Number.isInteger(v) ? v : v.toFixed(1)}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "3 Oct". */
export const shortDate = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;

function unitFor(spec: MetricSpec, value: number): string {
  if (spec.kind === 'count') return 'a day';
  if (spec.kind === 'hours') return 'hours a night';
  const one = approx(value, 'perWeek') === '~1';
  if (spec.key === 'night_sweats' || spec.key === 'sleep') return one ? 'night a week' : 'nights a week';
  return one ? 'day a week' : 'days a week';
}

function sentenceFor(spec: MetricSpec, before: number, after: number, direction: 'down' | 'up' | 'steady', tail: string): string {
  if (direction === 'steady') {
    return `${spec.label} about the same, ${approx(after, spec.kind)} ${unitFor(spec, after)}${tail}.`;
  }
  // "down from ~5 to ~2 a day": the unit follows the second figure.
  return `${spec.label} ${direction} from ${approx(before, spec.kind)} to ${approx(after, spec.kind)} ${unitFor(spec, after)}${tail}.`;
}

function confidenceFor(loggedDays: number, weeks: number, windowWeeks: number): { level: Confidence; note: string } {
  const span = `in the last ${windowWeeks} weeks`;
  if (loggedDays === 0) {
    return { level: 'none', note: `Nothing logged ${span} yet. Log hot flushes, sleep and how you feel for a couple of weeks to see your trends here.` };
  }
  if (loggedDays < 10 || weeks < 3) {
    return {
      level: 'low',
      note: `Only ${loggedDays} ${loggedDays === 1 ? 'day' : 'days'} logged ${span}, so this is a first glimpse, not a trend. Logging most days for 2–3 weeks will make it clearer.`,
    };
  }
  if (loggedDays < 30) {
    return { level: 'medium', note: `Based on ${loggedDays} logged days across ${weeks} weeks: a rough picture. Gaps in logging can hide changes.` };
  }
  return { level: 'high', note: `Based on ${loggedDays} logged days across ${weeks} weeks.` };
}

/** The whole insight. `now` is injectable for tests. */
export function computeMenopauseInsight(
  signals: SignalInput[],
  meds: MedicationInput[] = [],
  now = new Date(),
  windowWeeks = WINDOW_WEEKS,
): MenopauseInsight {
  const windowDays = windowWeeks * 7;
  // One entry per calendar day (the last row wins if a day appears twice).
  const byAgo = new Map<number, Day>();
  for (const r of signals) {
    const d = parseDay(r?.signal_date);
    if (!d) continue;
    const ago = daysBetween(d, now);
    if (ago < 0 || ago >= windowDays) continue;
    byAgo.set(ago, parseDayRow(r, ago));
  }
  const days = [...byAgo.values()].filter(d => d.logged);
  const loggedDays = days.length;
  const weeksWithLogs = new Set(days.map(d => Math.floor(d.ago / 7))).size;
  const { level, note } = confidenceFor(loggedDays, weeksWithLogs, windowWeeks);

  const specs = buildSpecs(days);

  // Anchor: the most relevant medicine change with enough logs either side.
  const events = medicineEvents(meds, now, windowDays).filter(e => daysBetween(e.date, now) >= MIN_DAYS_AFTER_EVENT);
  const sideOk = (spec: MetricSpec, from: number, to: number) =>
    days.filter(d => d.ago >= from && d.ago < to && spec.value(d) != null).length >= MIN_SIDE_DAYS;
  let event: MedicineEvent | null = null;
  if (level !== 'low' && level !== 'none') {
    for (const e of events) {
      const eAgo = daysBetween(e.date, now);
      const afterTo = Math.min(eAgo, RECENT_DAYS);
      if (specs.some(s => sideOk(s, eAgo, eAgo + BEFORE_DAYS) && sideOk(s, 0, afterTo))) {
        event = e;
        break;
      }
    }
  }

  const eventAgo = event ? daysBetween(event.date, now) : null;
  const tail = event
    ? ` since you ${event.kind === 'start' ? 'started' : 'stopped'} ${event.name} on ${shortDate(event.date)}`
    : ` over the last ${windowWeeks} weeks`;

  const metrics: MetricTrend[] = specs.map(spec => {
    const weekly: Array<number | null> = [];
    for (let w = windowWeeks - 1; w >= 0; w--) {
      const vals = days.filter(d => Math.floor(d.ago / 7) === w).map(spec.value).filter((v): v is number => v != null);
      weekly.push(aggregate(vals, spec.kind));
    }
    const dataDays = days.filter(d => spec.value(d) != null).length;
    // Before / after: around the medicine change, else earlier weeks vs the last 4.
    const [bFrom, bTo, aTo] = eventAgo != null
      ? [eventAgo, eventAgo + BEFORE_DAYS, Math.min(eventAgo, RECENT_DAYS)]
      : [RECENT_DAYS, windowDays, RECENT_DAYS];
    const pick = (from: number, to: number) =>
      days.filter(d => d.ago >= from && d.ago < to).map(spec.value).filter((v): v is number => v != null);
    const b = pick(bFrom, bTo);
    const a = pick(0, aTo);
    const comparable = level !== 'low' && level !== 'none' && b.length >= MIN_SIDE_DAYS && a.length >= MIN_SIDE_DAYS;
    const before = comparable ? aggregate(b, spec.kind) : null;
    const after = comparable ? aggregate(a, spec.kind) : null;
    let direction: MetricTrend['direction'] = null;
    let improved: boolean | null = null;
    let sentence: string | null = null;
    if (before != null && after != null) {
      const diff = after - before;
      // Both the absolute change and a relative one (25%; 10% for sleep hours) must clear the bar.
      const rel = spec.kind === 'hours' ? 0.1 : 0.25;
      const big = Math.abs(diff) >= spec.minChange && Math.abs(diff) >= rel * Math.max(before, after);
      // "from ~2 to ~2" is not a change worth a sentence.
      const sameText = approx(before, spec.kind) === approx(after, spec.kind);
      direction = big && !sameText ? (diff < 0 ? 'down' : 'up') : 'steady';
      improved = direction === 'steady' ? null : (diff < 0) === spec.lowerIsBetter;
      // Nothing either side (no joint pain at all) is not news.
      if (!(before === 0 && after === 0)) sentence = sentenceFor(spec, before, after, direction, tail);
    }
    return { key: spec.key, label: spec.label, kind: spec.kind, weekly, dataDays, before, after, direction, improved, sentence };
  });

  // Changes first (hot flushes lead), then "about the same", max three.
  const changed = metrics.filter(m => m.sentence && m.direction !== 'steady');
  const steady = metrics.filter(m => m.sentence && m.direction === 'steady');
  const summary = [...changed, ...steady].slice(0, 3).map(m => m.sentence as string);
  // Only the first sentence carries the medicine name; the rest say "since then".
  const named = event ? summary.map((s, i) => (i === 0 ? s : s.replace(tail, ' since then'))) : summary;
  const caveat = event && named.length
    ? `This lines up what you logged with the date you ${event.kind === 'start' ? 'started' : 'stopped'} ${event.name}. It can't show that the medicine caused the change; your doctor can help you read it.`
    : null;

  return { loggedDays, weeksWithLogs, confidence: level, confidenceNote: note, metrics, event, summary: named, caveat };
}
