// Postpartum recovery check-in: a weekly one-minute check for the first
// 12 weeks after birth (bleeding, pain, wound/stitches, pelvic floor,
// sleep, mood). Red-flag guidance follows the NHS "your body after the
// birth" and "postnatal check" pages: heavy bleeding, fever, a painful
// swollen leg, chest pain or breathlessness, a sudden severe headache,
// and thoughts of self-harm mean "call your doctor or 144 now".
//
// Mood is only a quick pulse here; the full mood check is the EPDS
// screener on the same page (#mood-check), which this check links to.
//
// Pure functions. The card stores the list under the account-synced key
// postpartum:{uid}:recovery-checkins (see account-data.ts).

export type CheckItemId = 'bleeding' | 'pain' | 'wound' | 'pelvic' | 'sleep' | 'mood';

/** 0 = as expected, 1 = keep an eye on it, 2 = talk to your Hebamme or doctor soon, 3 = urgent. */
export type Score = 0 | 1 | 2 | 3;

export interface CheckOption {
  id: string;
  label: string;
  score: Score;
}

export interface CheckItem {
  id: CheckItemId;
  title: string;
  question: string;
  options: CheckOption[];
}

export const CHECKIN_WEEKS = 12;
/** Account-synced localStorage key (registered in account-data.ts). */
export const RECOVERY_CHECKINS_KEY = (uid: string) => `postpartum:${uid}:recovery-checkins`;

export const CHECK_ITEMS: CheckItem[] = [
  {
    id: 'bleeding',
    title: 'Bleeding',
    question: 'How is the bleeding (lochia) this week?',
    options: [
      { id: 'none', label: 'Stopped or only spotting', score: 0 },
      { id: 'light', label: 'Light, pink or brown', score: 0 },
      { id: 'period', label: 'Like a period, red', score: 1 },
      { id: 'heavier', label: 'Getting heavier again, or smells bad', score: 2 },
      { id: 'heavy', label: 'Soaking a pad in an hour, or large clots', score: 3 },
    ],
  },
  {
    id: 'pain',
    title: 'Pain',
    question: 'How much pain do you have (tummy, back, perineum or scar)?',
    options: [
      { id: 'none', label: 'None or very little', score: 0 },
      { id: 'mild', label: 'Mild, getting better', score: 0 },
      { id: 'moderate', label: 'Moderate, not really improving', score: 1 },
      { id: 'worse', label: 'Strong, or getting worse', score: 2 },
    ],
  },
  {
    id: 'wound',
    title: 'Wound or stitches',
    question: 'How do your stitches or caesarean scar feel?',
    options: [
      { id: 'na', label: 'No stitches or wound', score: 0 },
      { id: 'healing', label: 'Healing well', score: 0 },
      { id: 'sore', label: 'Sore, but improving', score: 1 },
      { id: 'infected', label: 'Red, hot, swollen, oozing or smells', score: 2 },
    ],
  },
  {
    id: 'pelvic',
    title: 'Pelvic floor',
    question: 'Bladder and bowel control this week?',
    options: [
      { id: 'fine', label: 'All fine', score: 0 },
      { id: 'leak-cough', label: 'A little leaking when I cough, sneeze or lift', score: 1 },
      { id: 'leak-often', label: 'Leaking often, or a heavy, dragging feeling', score: 2 },
      { id: 'bowel', label: "I can't control wind or my bowels", score: 2 },
    ],
  },
  {
    id: 'sleep',
    title: 'Sleep',
    question: 'How are you sleeping, given the night feeds?',
    options: [
      { id: 'ok', label: 'Broken, but I get enough rest', score: 0 },
      { id: 'tired', label: 'Very tired, but coping', score: 1 },
      { id: 'cannot', label: "I can't sleep even when the baby sleeps", score: 2 },
    ],
  },
  {
    id: 'mood',
    title: 'Mood',
    question: 'How have you been feeling most days?',
    options: [
      { id: 'ok', label: 'Mostly OK', score: 0 },
      { id: 'up-down', label: 'Up and down, tearful at times', score: 1 },
      { id: 'low', label: 'Low, anxious or numb most days', score: 2 },
      { id: 'self-harm', label: 'I have thoughts of harming myself', score: 3 },
    ],
  },
];

export type RedFlagId = 'heavy-bleeding' | 'fever' | 'leg' | 'chest' | 'headache' | 'self-harm';

export interface RedFlag {
  id: RedFlagId;
  label: string;
}

/** Asked every week as "Any of these right now?". */
export const RED_FLAGS: RedFlag[] = [
  { id: 'heavy-bleeding', label: 'Heavy bleeding: soaking a pad in an hour, or clots larger than a plum' },
  { id: 'fever', label: 'Fever of 38 °C or more, or shivering and feeling very unwell' },
  { id: 'leg', label: 'A painful, swollen, red or warm leg (often the calf)' },
  { id: 'chest', label: 'Chest pain, or sudden difficulty breathing' },
  { id: 'headache', label: 'A sudden severe headache, blurred vision or swelling of face and hands' },
  { id: 'self-harm', label: 'Thoughts of harming yourself or your baby' },
];

export const URGENT_MESSAGE = 'Call your doctor or 144 now.';
export const SELF_HARM_SUPPORT = 'You can also talk to Die Dargebotene Hand on 143, day and night.';

export interface CheckinEntry {
  /** Week after birth, 1-based (days 0-6 = week 1). */
  week: number;
  /** Local date the check was saved, yyyy-mm-dd. */
  date: string;
  answers: Partial<Record<CheckItemId, string>>;
  redFlags: RedFlagId[];
}

const ITEM_BY_ID = new Map(CHECK_ITEMS.map(i => [i.id, i]));
const FLAG_IDS = new Set(RED_FLAGS.map(f => f.id));

const DAY_MS = 86_400_000;

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Week after birth, 1-based; null when the birth is in the future or unknown. */
export function weekPostpartum(birthDate: Date | null, now: Date = new Date()): number | null {
  if (!birthDate || Number.isNaN(birthDate.getTime())) return null;
  const days = Math.round((startOfLocalDay(now) - startOfLocalDay(birthDate)) / DAY_MS);
  if (days < 0) return null;
  return Math.floor(days / 7) + 1;
}

export function inCheckinWindow(birthDate: Date | null, now: Date = new Date()): boolean {
  const w = weekPostpartum(birthDate, now);
  return w !== null && w <= CHECKIN_WEEKS;
}

export function optionFor(item: CheckItemId, optionId: string | undefined): CheckOption | null {
  if (!optionId) return null;
  return ITEM_BY_ID.get(item)?.options.find(o => o.id === optionId) ?? null;
}

/** Answer choices that are themselves red flags. */
const ANSWER_FLAGS: Array<{ item: CheckItemId; option: string; flag: RedFlagId }> = [
  { item: 'bleeding', option: 'heavy', flag: 'heavy-bleeding' },
  { item: 'mood', option: 'self-harm', flag: 'self-harm' },
];

export interface Assessment {
  level: 'urgent' | 'talk' | 'watch' | 'ok';
  /** Red flags from the checklist and from answers, deduplicated, in RED_FLAGS order. */
  urgent: RedFlagId[];
  /** Items to raise with the Hebamme or doctor in the next day or two. */
  talk: CheckItemId[];
  /** Items to keep an eye on. */
  watch: CheckItemId[];
  /** True when the mood answer suggests taking the full EPDS check. */
  suggestEpds: boolean;
  selfHarm: boolean;
}

export function assessCheckin(entry: Pick<CheckinEntry, 'answers' | 'redFlags'>): Assessment {
  const flags = new Set<RedFlagId>(entry.redFlags.filter(f => FLAG_IDS.has(f)));
  for (const a of ANSWER_FLAGS) if (entry.answers[a.item] === a.option) flags.add(a.flag);
  const talk: CheckItemId[] = [];
  const watch: CheckItemId[] = [];
  for (const item of CHECK_ITEMS) {
    const s = optionFor(item.id, entry.answers[item.id])?.score;
    if (s === 2) talk.push(item.id);
    else if (s === 1) watch.push(item.id);
  }
  const urgent = RED_FLAGS.map(f => f.id).filter(id => flags.has(id));
  const moodScore = optionFor('mood', entry.answers.mood)?.score ?? 0;
  const level = urgent.length ? 'urgent' : talk.length ? 'talk' : watch.length ? 'watch' : 'ok';
  return { level, urgent, talk, watch, suggestEpds: moodScore >= 1, selfHarm: flags.has('self-harm') };
}

export function isComplete(answers: CheckinEntry['answers']): boolean {
  return CHECK_ITEMS.every(i => !!optionFor(i.id, answers[i.id]));
}

/** Reads the stored list; drops malformed rows; sorted by week, one per week (latest wins). */
export function parseCheckins(raw: unknown): CheckinEntry[] {
  let v: unknown = raw;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { return []; }
  }
  if (!Array.isArray(v)) return [];
  const byWeek = new Map<number, CheckinEntry>();
  for (const r of v) {
    if (!r || typeof r !== 'object') continue;
    const row = r as Record<string, unknown>;
    const week = row.week;
    if (typeof week !== 'number' || !Number.isInteger(week) || week < 1 || week > 52) continue;
    const date = typeof row.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? row.date : '';
    if (!date) continue;
    const answers: CheckinEntry['answers'] = {};
    const rawAnswers = row.answers && typeof row.answers === 'object' ? row.answers as Record<string, unknown> : {};
    for (const item of CHECK_ITEMS) {
      const a = rawAnswers[item.id];
      if (typeof a === 'string' && optionFor(item.id, a)) answers[item.id] = a;
    }
    const redFlags = Array.isArray(row.redFlags)
      ? RED_FLAGS.map(f => f.id).filter(id => (row.redFlags as unknown[]).includes(id))
      : [];
    byWeek.set(week, { week, date, answers, redFlags });
  }
  return [...byWeek.values()].sort((a, b) => a.week - b.week);
}

/** Adds or replaces the entry for its week. */
export function upsertCheckin(list: CheckinEntry[], entry: CheckinEntry): CheckinEntry[] {
  return [...list.filter(e => e.week !== entry.week), entry].sort((a, b) => a.week - b.week);
}

export function entryForWeek(list: CheckinEntry[], week: number | null): CheckinEntry | null {
  if (week === null) return null;
  return list.find(e => e.week === week) ?? null;
}

export interface TrendPoint {
  week: number;
  score: Score | null;
}

export interface ItemTrend {
  item: CheckItemId;
  title: string;
  points: TrendPoint[];
  direction: 'better' | 'worse' | 'same' | null;
}

/**
 * Per item, the score for every week from 1 to the last week with a
 * check (null where she skipped a week), plus the direction between the
 * last two answered weeks.
 */
export function recoveryTrend(list: CheckinEntry[]): ItemTrend[] {
  const lastWeek = list.reduce((m, e) => Math.max(m, e.week), 0);
  return CHECK_ITEMS.map(item => {
    const points: TrendPoint[] = [];
    for (let w = 1; w <= lastWeek; w++) {
      const e = list.find(x => x.week === w);
      const opt = e ? optionFor(item.id, e.answers[item.id]) : null;
      points.push({ week: w, score: opt ? opt.score : null });
    }
    const answered = points.filter(p => p.score !== null) as Array<{ week: number; score: Score }>;
    let direction: ItemTrend['direction'] = null;
    if (answered.length >= 2) {
      const [prev, last] = answered.slice(-2);
      direction = last.score < prev.score ? 'better' : last.score > prev.score ? 'worse' : 'same';
    }
    return { item: item.id, title: item.title, points, direction };
  });
}

export function checkItemTitle(id: CheckItemId): string {
  return ITEM_BY_ID.get(id)?.title ?? id;
}

export function redFlagLabel(id: RedFlagId): string {
  return RED_FLAGS.find(f => f.id === id)?.label ?? id;
}
