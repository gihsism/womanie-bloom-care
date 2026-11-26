// Practice time: doctors' opening hours are wall-clock times in Swiss time
// (Europe/Zurich). Before 2026-11-26 the booking flow read them in the
// VIEWER's time zone, so a patient in London was offered 09:00 London
// (= 10:00 Zurich) for a doctor who opens at 09:00, and the availability
// endpoint cut the day at UTC midnight. Everything slot-related now goes
// through these helpers, on the server (booking check, availability day
// window) and in the browser (src/lib/practiceTime.ts re-exports this file).
//
// Pure: Intl only, no dependencies, so it runs in Node and the browser.

export const PRACTICE_TZ = 'Europe/Zurich';

export interface WallParts { year: number; month: number; day: number; hour: number; minute: number; dow: number }

const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const fmtCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', weekday: 'short',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

/** The wall-clock date/time of an instant in `tz`. */
export function wallParts(instant: Date, tz: string = PRACTICE_TZ): WallParts {
  const parts: Record<string, string> = {};
  for (const p of formatter(tz).formatToParts(instant)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    dow: DOW[parts.weekday] ?? 0,
  };
}

/** Minutes `tz` is ahead of UTC at that instant (Zurich: 60 or 120). */
function offsetMinutes(instant: Date, tz: string): number {
  const p = wallParts(instant, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((asUtc - Math.floor(instant.getTime() / 60000) * 60000) / 60000);
}

/**
 * The instant at which the wall clock in `tz` shows y-m-d h:min. A time
 * that does not exist (the spring-forward hour) resolves to the hour after.
 */
export function wallTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, tz: string = PRACTICE_TZ): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let t = guess - offsetMinutes(new Date(guess), tz) * 60000;
  // Second pass settles the offset across a DST change.
  t = guess - offsetMinutes(new Date(t), tz) * 60000;
  return new Date(t);
}

/** Day of the week (0 = Sunday) of a calendar date, independent of zone. */
export function dayOfWeek(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** [start, end) of a calendar day YYYY-MM-DD in `tz`, as UTC instants. */
export function dayWindowUtc(dateStr: string, tz: string = PRACTICE_TZ): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const next = new Date(Date.UTC(y, mo - 1, d + 1));
  return {
    start: wallTimeToUtc(y, mo, d, 0, 0, tz),
    end: wallTimeToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0, tz),
  };
}

/** "HH:MM" -> minutes after midnight, or null. Accepts "HH:MM:SS" (Postgres time). */
export function parseHm(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

export interface ScheduleWindow { day_of_week: number | null; start_time: string; end_time: string; is_active?: boolean | null }

/**
 * Is [start, start + durationMin) inside the doctor's opening hours for
 * that day, read in practice time? Used by the booking and reschedule
 * endpoints so a hand-made request cannot land at 03:00 on a Sunday.
 */
export function fitsSchedule(start: Date, durationMin: number, schedule: ScheduleWindow[], tz: string = PRACTICE_TZ): boolean {
  const p = wallParts(start, tz);
  const startMin = p.hour * 60 + p.minute;
  const endMin = startMin + durationMin;
  return schedule.some(s => {
    if (s.is_active === false || s.day_of_week !== p.dow) return false;
    const open = parseHm(s.start_time);
    const close = parseHm(s.end_time);
    if (open === null || close === null || close <= open) return false;
    return startMin >= open && endMin <= close;
  });
}

/** "HH:mm" of an instant in practice time (slot buttons, summaries). */
export function formatPracticeTime(instant: Date, tz: string = PRACTICE_TZ): string {
  const p = wallParts(instant, tz);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** A short date + time in practice time, for notifications: "Tue 2 Dec, 10:30". */
export function formatPracticeDateTime(instant: Date, tz: string = PRACTICE_TZ): string {
  const date = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(instant);
  return `${date.replace(/,/g, '')}, ${formatPracticeTime(instant, tz)}`;
}

export interface BusyInterval { scheduled_at: string; duration: number | null }

/**
 * Free slot starts on one calendar day (y-m-d as the patient picked it),
 * stepped by the visit length inside each opening window read in practice
 * time. Skips slots that overlap a busy visit or have already started.
 * Single source for the browser picker (src/lib/timeSlots.ts) and the
 * server's "next free times" on the doctor profile.
 */
export function freeSlotsForDay(opts: {
  year: number; month: number; day: number;
  schedule: ScheduleWindow[] | null | undefined;
  durationMin: number;
  busy: BusyInterval[];
  now?: Date;
  tz?: string;
}): Date[] {
  const { year: y, month: mo, day: d, durationMin, busy } = opts;
  const tz = opts.tz ?? PRACTICE_TZ;
  const dow = dayOfWeek(y, mo, d);
  const windows = (opts.schedule ?? []).filter(s => s.day_of_week === dow && s.is_active !== false);
  if (windows.length === 0 || !(durationMin > 0)) return [];

  const busyIntervals = busy.map(b => {
    const startMs = new Date(b.scheduled_at).getTime();
    const dur = typeof b.duration === 'number' && b.duration > 0 ? b.duration : durationMin;
    return [startMs, startMs + dur * 60000] as const;
  });
  const nowMs = (opts.now ?? new Date()).getTime();
  const seen = new Set<number>();
  const slots: Date[] = [];
  for (const w of windows) {
    const open = parseHm(w.start_time);
    const close = parseHm(w.end_time);
    if (open === null || close === null || close <= open) continue;
    // Step in wall-clock minutes and convert each start on its own, so a
    // DST change never shifts the grid; a slot running past closing time
    // is not offered.
    for (let m = open; m + durationMin <= close; m += durationMin) {
      const start = wallTimeToUtc(y, mo, d, Math.floor(m / 60), m % 60, tz);
      const s = start.getTime();
      const e = s + durationMin * 60000;
      if (s <= nowMs || seen.has(s)) continue;
      if (busyIntervals.some(([bs, be]) => s < be && e > bs)) continue;
      seen.add(s);
      slots.push(start);
    }
  }
  return slots.sort((a, b) => a.getTime() - b.getTime());
}

/**
 * The next `count` free slots from `now`, looking up to `daysAhead`
 * practice-time days forward (doctor profile: "next free times").
 */
export function nextFreeSlots(opts: {
  schedule: ScheduleWindow[] | null | undefined;
  durationMin: number;
  busy: BusyInterval[];
  now?: Date;
  count?: number;
  daysAhead?: number;
  tz?: string;
}): Date[] {
  const tz = opts.tz ?? PRACTICE_TZ;
  const now = opts.now ?? new Date();
  const count = opts.count ?? 3;
  const daysAhead = opts.daysAhead ?? 28;
  const today = wallParts(now, tz);
  const out: Date[] = [];
  for (let i = 0; i <= daysAhead && out.length < count; i++) {
    const day = new Date(Date.UTC(today.year, today.month - 1, today.day + i));
    out.push(...freeSlotsForDay({
      year: day.getUTCFullYear(), month: day.getUTCMonth() + 1, day: day.getUTCDate(),
      schedule: opts.schedule, durationMin: opts.durationMin, busy: opts.busy, now, tz,
    }));
  }
  return out.slice(0, count);
}
