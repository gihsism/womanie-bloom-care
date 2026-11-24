// Pure helpers for the version 8 "body map" hero on the dashboard: each
// hotspot on the figure shows one live fact. Kept free of React and the
// database so the rules are unit-tested.

export interface LabLike {
  title: string;
  value: string | number | null;
  unit: string | null;
  reference_range: string | null;
  status: string | null;
}

export interface FlaggedLab {
  title: string;
  value: string;
  unit: string | null;
  range: string | null;
  direction: 'low' | 'high' | 'out';
  critical: boolean;
}

/** Parse "15-150", "15 – 150", "<5", ">30" into bounds. */
export function parseRange(range: string | null | undefined): { low: number | null; high: number | null } | null {
  if (!range) return null;
  const r = range.replace(/,/g, '.');
  const between = r.match(/(-?\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(-?\d+(?:\.\d+)?)/i);
  if (between) return { low: Number(between[1]), high: Number(between[2]) };
  const lt = r.match(/^\s*(?:<|≤|<=)\s*(\d+(?:\.\d+)?)/);
  if (lt) return { low: null, high: Number(lt[1]) };
  const gt = r.match(/^\s*(?:>|≥|>=)\s*(\d+(?:\.\d+)?)/);
  if (gt) return { low: Number(gt[1]), high: null };
  return null;
}

/** The one lab result worth putting on the figure: critical first, then abnormal. */
export function pickFlaggedLab(labs: LabLike[]): FlaggedLab | null {
  const rank = (s: string | null) => (s === 'critical' ? 0 : s === 'abnormal' ? 1 : 9);
  const flagged = labs.filter(l => rank(l.status) < 9 && l.value != null && String(l.value).trim() !== '');
  if (!flagged.length) return null;
  flagged.sort((a, b) => rank(a.status) - rank(b.status));
  const l = flagged[0];
  const num = Number(String(l.value).replace(',', '.'));
  const b = parseRange(l.reference_range);
  let direction: FlaggedLab['direction'] = 'out';
  if (b && Number.isFinite(num)) {
    if (b.low != null && num < b.low) direction = 'low';
    else if (b.high != null && num > b.high) direction = 'high';
  }
  return {
    title: l.title,
    value: String(l.value),
    unit: l.unit,
    range: l.reference_range,
    direction,
    critical: l.status === 'critical',
  };
}

const sameDay = (iso: string, now: Date) => {
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
};

export interface MedSummary {
  total: number; // active medicines
  takenToday: number; // distinct medicines with a dose logged today
  lastName: string | null;
  lastAt: string | null; // ISO of the latest dose today
}

export function medsToday(
  meds: { id: string; name: string }[],
  doses: { occurred_at: string; data: { medication_id?: string; name?: string } }[],
  now: Date,
): MedSummary {
  const today = doses.filter(d => sameDay(d.occurred_at, now)).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const ids = new Set(meds.map(m => m.id));
  const taken = new Set(today.map(d => d.data?.medication_id).filter((id): id is string => !!id && ids.has(id)));
  const last = today[0];
  const lastName = last ? (meds.find(m => m.id === last.data?.medication_id)?.name ?? last.data?.name ?? null) : null;
  return { total: meds.length, takenToday: taken.size, lastName, lastAt: last?.occurred_at ?? null };
}

/** Latest finished kick-count session today, if any. */
export function kicksToday(
  sessions: { occurred_at: string; ended_at?: string | null; data: { count?: number } }[],
  now: Date,
): { count: number; minutes: number | null } | null {
  const today = sessions.filter(s => sameDay(s.occurred_at, now)).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  if (!today.length) return null;
  const s = today[0];
  const minutes = s.ended_at ? Math.max(0, Math.round((Date.parse(s.ended_at) - Date.parse(s.occurred_at)) / 60000)) : null;
  return { count: Number(s.data?.count) || 0, minutes };
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty'];

/** 30 -> "thirty", 27 -> "twenty-seven" (weeks of pregnancy, 0-42). */
export function weekWord(n: number): string {
  if (n < 0 || n > 49 || !Number.isInteger(n)) return String(n);
  if (n < 20) return WORDS[n];
  const t = Math.floor(n / 10);
  const u = n % 10;
  return u ? `${TENS[t]}-${WORDS[u]}` : TENS[t];
}

/** Format grams as "780 g" or "1.4 kg". */
export function fmtGrams(g: number): { value: string; unit: string } {
  if (g < 1000) return { value: String(Math.round(g)), unit: 'g' };
  return { value: (g / 1000).toFixed(1), unit: 'kg' };
}

// ---- Baby (postpartum) body map ------------------------------------------

type Ev = { occurred_at: string; ended_at?: string | null; data: Record<string, unknown> };

export interface LastFeed {
  minutesAgo: number;
  method: string; // breast_l | breast_r | bottle | ...
  durationMin: number | null;
  ml: number | null;
  nextSide: 'left' | 'right' | null; // suggest the other breast after a breast feed
}

export function lastFeed(feeds: Ev[], now: Date): LastFeed | null {
  const past = feeds.filter(f => Date.parse(f.occurred_at) <= now.getTime()).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const f = past[0];
  if (!f) return null;
  const method = String(f.data?.method ?? '');
  const dur = f.ended_at ? Math.round((Date.parse(f.ended_at) - Date.parse(f.occurred_at)) / 60000) : null;
  const ml = Number(f.data?.ml);
  return {
    minutesAgo: Math.max(0, Math.round((now.getTime() - Date.parse(f.occurred_at)) / 60000)),
    method,
    durationMin: dur != null && dur > 0 && dur < 180 ? dur : null,
    ml: Number.isFinite(ml) && ml > 0 ? ml : null,
    nextSide: method === 'breast_l' ? 'right' : method === 'breast_r' ? 'left' : null,
  };
}

export function countToday(events: Ev[], now: Date): number {
  return events.filter(e => sameDay(e.occurred_at, now)).length;
}

export function nappiesToday(nappies: Ev[], now: Date): { wet: number; dirty: number } {
  let wet = 0; let dirty = 0;
  for (const n of nappies) {
    if (!sameDay(n.occurred_at, now)) continue;
    const t = n.data?.type;
    if (t === 'wet' || t === 'both') wet += 1;
    if (t === 'dirty' || t === 'both') dirty += 1;
  }
  return { wet, dirty };
}

/** Total finished sleep today in minutes (sleep that started today). */
export function sleepTodayMin(sleeps: Ev[], now: Date): number {
  return sleeps.reduce((s, e) => {
    if (!e.ended_at || !sameDay(e.occurred_at, now)) return s;
    const m = (Date.parse(e.ended_at) - Date.parse(e.occurred_at)) / 60000;
    return m > 0 && m < 16 * 60 ? s + m : s;
  }, 0);
}

/** "1h 20" / "42 min" for compact labels; a day or more reads "2 days"
 *  (live: an old last feed showed as "217h 25 ago"). */
export function fmtAgo(min: number): { value: string; unit: string } {
  if (min < 60) return { value: String(min), unit: 'min' };
  if (min >= 24 * 60) {
    const d = Math.floor(min / (24 * 60));
    return { value: String(d), unit: d === 1 ? 'day' : 'days' };
  }
  const h = Math.floor(min / 60); const m = min % 60;
  return { value: m ? `${h}h ${String(m).padStart(2, '0')}` : `${h}h`, unit: '' };
}

/** Post-menopause with a period logged in the last 12 months: bleeding
 *  after menopause should be checked, so Home says that instead of the
 *  "12 months in a row marks menopause" countdown. */
export const POST_MENOPAUSE_BLEED_TEXT = 'Bleeding after menopause is worth checking with your doctor.';
export function postMenopauseBleed(mode: string, months: number | null): boolean {
  return mode === 'post-menopause' && months != null && months < 12;
}

/** Day of life, birth day = day 1. */
export function dayOfLife(birthDate: string | null | undefined, now: Date): number | null {
  if (!birthDate) return null;
  const b = new Date(`${birthDate.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(b.getTime())) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((today.getTime() - b.getTime()) / 86400000) + 1;
}

// ---- Cycle dial (period / conception) -------------------------------------

export interface CycleDialData {
  day: number; // 1-based day of the current cycle
  length: number;
  periodDays: number;
  ovulationDay: number; // 1-based
  fertileStart: number; // 1-based, inclusive
  fertileEnd: number; // = ovulation day + 1 (egg survives ~1 day)
  phase: 'period' | 'follicular' | 'fertile' | 'luteal' | 'pms';
  daysToPeriod: number;
  nextPeriod: Date;
  daysToFertile: number | null; // null once the window has passed this cycle
}

export function cycleDial(lastStart: Date, cycleLength: number, now: Date, periodDays = 5, ovulationDayOverride?: number): CycleDialData {
  const length = Math.max(15, Math.min(60, Math.round(cycleLength)));
  const start = new Date(lastStart.getFullYear(), lastStart.getMonth(), lastStart.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const elapsed = Math.floor((today.getTime() - start.getTime()) / 86400000);
  const day = (((elapsed % length) + length) % length) + 1;
  // Her own ovulation day when the prediction knows it (LH / temperature /
  // learned luteal length); otherwise the textbook 14 days before the period.
  const ovulationDay = Math.max(periodDays + 1, Math.min(length - 1, Math.round(ovulationDayOverride ?? length - 14)));
  const fertileStart = Math.max(periodDays + 1, ovulationDay - 5);
  const fertileEnd = Math.min(length, ovulationDay + 1);
  let phase: CycleDialData['phase'] = 'luteal';
  if (day <= periodDays) phase = 'period';
  else if (day < fertileStart) phase = 'follicular';
  else if (day <= fertileEnd) phase = 'fertile';
  else if (day > length - 5) phase = 'pms';
  const daysToPeriod = length - day + 1;
  const nextPeriod = new Date(today.getFullYear(), today.getMonth(), today.getDate() + daysToPeriod);
  return {
    day, length, periodDays, ovulationDay, fertileStart, fertileEnd, phase, daysToPeriod, nextPeriod,
    daysToFertile: day < fertileStart ? fertileStart - day : day <= fertileEnd ? 0 : null,
  };
}

// ---- Pill ring (contraception) --------------------------------------------

export type PillMark = 'taken' | 'late' | 'missed' | 'none' | 'future';

export interface PillRing {
  packDay: number | null; // 1-28 when the pack start is known
  pills: { index: number; date: string; mark: PillMark; placebo: boolean; today: boolean }[];
  streak: number;
  todayMark: PillMark;
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Parse "Pill: on-time|late|missed" out of a daily-signal note. */
export function pillFromNotes(notes: string | null | undefined): 'taken' | 'late' | 'missed' | null {
  const m = (notes ?? '').match(/Pill:\s*(on-time|late|missed)/i);
  if (!m) return null;
  const s = m[1].toLowerCase();
  return s === 'on-time' ? 'taken' : (s as 'late' | 'missed');
}

/**
 * 28 pills. With a known pack start the ring is the current pack (days
 * 22-28 are the break / placebo week); without one it is the last 28 days
 * ending today.
 */
export function pillRing(byDate: Map<string, 'taken' | 'late' | 'missed'>, packStart: string | null, now: Date): PillRing {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let packDay: number | null = null;
  let first: Date;
  if (packStart) {
    const ps = new Date(`${packStart.slice(0, 10)}T00:00:00`);
    const days = Math.floor((today.getTime() - ps.getTime()) / 86400000);
    if (Number.isFinite(days) && days >= 0) {
      packDay = (days % 28) + 1;
      first = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (packDay - 1));
    } else {
      first = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 27);
    }
  } else {
    first = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 27);
  }
  const pills = Array.from({ length: 28 }, (_, i) => {
    const d = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
    const key = ymd(d);
    const isToday = key === ymd(today);
    const future = d.getTime() > today.getTime();
    return {
      index: i + 1,
      date: key,
      mark: (future ? 'future' : byDate.get(key) ?? 'none') as PillMark,
      placebo: packDay != null && i >= 21,
      today: isToday,
    };
  });
  let streak = 0;
  for (let i = 0; i < 400; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const s = byDate.get(ymd(d));
    if (!s || s === 'missed') { if (i === 0 && !s) continue; break; }
    streak++;
  }
  return { packDay, pills, streak, todayMark: byDate.get(ymd(today)) ?? 'none' };
}

// ---- Menopause body map ---------------------------------------------------

/** Hot flushes logged in daily-signal notes ("Hot flashes: N"). */
export function hotFlushes(signals: { signal_date: string; notes: string | null }[], now: Date): { today: number | null; total7: number; daysLogged7: number } {
  const todayKey = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const weekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).getTime();
  let today: number | null = null; let total7 = 0; let daysLogged7 = 0;
  for (const s of signals) {
    const m = (s.notes ?? '').match(/Hot flashes:\s*(\d+)/i);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    const key = String(s.signal_date).slice(0, 10);
    const t = new Date(`${key}T00:00:00`).getTime();
    if (key === todayKey) today = n;
    if (t >= weekAgo && t <= now.getTime()) { total7 += n; daysLogged7 += 1; }
  }
  return { today, total7, daysLogged7 };
}

/** Whole months between the last period start and today. */
export function monthsSince(lastStart: Date | null, now: Date): number | null {
  if (!lastStart) return null;
  let m = (now.getFullYear() - lastStart.getFullYear()) * 12 + (now.getMonth() - lastStart.getMonth());
  if (now.getDate() < lastStart.getDate()) m -= 1;
  return Math.max(0, m);
}
