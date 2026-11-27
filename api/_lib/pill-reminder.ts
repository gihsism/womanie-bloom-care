// The contraceptive pill-time phone reminder (pure, unit-tested). Same
// rules as Home's "Today's pill not ticked yet" row (src/lib/todayItems.ts
// + src/hooks/useTodaySignals.ts loadPill), read from what the app syncs to
// her account:
//   user_app_data 'contraception:method'        -> "pill" (the card saves it)
//   user_app_data 'contraception:reminderTime'  -> "HH:MM" (default 21:00)
//   user_app_data 'contraception:packStartDate' -> "YYYY-MM-DD" (pill-free week)
//   daily_health_signals.notes "Pill: on-time|late|missed" -> ticked that day
// The parsers below mirror src/lib/pillLog.ts (parity test in
// pill-reminder.test.ts).
//
// Extra rule for the phone (decided 2026-11-28): Home shows the row to
// anyone in the contraception stage whose method is the pill or not chosen
// yet. A push is more intrusive, so it goes only to someone who uses the
// pill tracker: method "pill" saved in her account, or (method never saved)
// a pill tick in the last 7 days.

export type PillStatus = 'on-time' | 'late' | 'missed';
export const PILL_DEFAULT_TIME = '21:00';
/** Same late-run allowance as medicine times (push-schedule.ts MED_LOOKBACK_MIN). */
export const PILL_LOOKBACK_MIN = 60;

export function parsePillStatus(notes: string | null | undefined): PillStatus | null {
  if (!notes) return null;
  const match = notes.match(/Pill:\s*(on-time|late|missed)/i);
  return match ? (match[1].toLowerCase() as PillStatus) : null;
}

/** Pack day 1-28 from the pack start date, cycling through 28-day packs (as src/lib/pillLog.ts). */
export function pillPackDay(packStartDate: string | null, now: Date): number | null {
  if (!packStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(packStartDate)) return null;
  const [y, m, d] = packStartDate.split('-').map(Number);
  const start = new Date(y, m - 1, d).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.round((today - start) / 86_400_000);
  if (days < 0) return null;
  return (days % 28) + 1;
}

/**
 * A text item from user_app_data: the Neon driver hands JSONB back parsed,
 * so it is usually already "pill" / "21:00"; an older row may hold the JSON
 * text ('"pill"'). Anything that is not a string reads as not saved.
 */
export function appText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  try {
    const v = JSON.parse(raw);
    return typeof v === 'string' ? v : raw;
  } catch {
    return raw;
  }
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const validTime = (t: unknown): t is string => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

export interface PillInput {
  stage: string;
  /** Parsed account values (null = not saved). */
  method: unknown;
  reminderTime: unknown;
  packStartDate: unknown;
  /** Her daily_health_signals rows of the last week or so. */
  signals: Array<{ signal_date: string | Date; notes: string | null }>;
  /** Her wall clock (wallClock(now, tz)): local fields = her local time. */
  nowWall: Date;
}

/** The pill time to remind about right now, or null. */
export function pillPushDue(p: PillInput): { time: string; today: string } | null {
  if (p.stage !== 'contraception') return null;
  const today = ymd(p.nowWall);
  const weekAgo = ymd(new Date(p.nowWall.getFullYear(), p.nowWall.getMonth(), p.nowWall.getDate() - 7));
  const day = (v: string | Date) => (v instanceof Date ? ymd(v) : String(v).slice(0, 10));
  const ticks = p.signals.filter(r => parsePillStatus(r.notes) != null);
  if (p.method === null || p.method === undefined) {
    if (!ticks.some(r => day(r.signal_date) >= weekAgo)) return null;
  } else if (p.method !== 'pill') return null;
  const packDay = pillPackDay(typeof p.packStartDate === 'string' ? p.packStartDate : null, p.nowWall);
  if (packDay != null && packDay > 21) return null; // pill-free week
  if (ticks.some(r => day(r.signal_date) === today)) return null;
  const time = validTime(p.reminderTime) ? p.reminderTime : PILL_DEFAULT_TIME;
  const minutes = p.nowWall.getHours() * 60 + p.nowWall.getMinutes();
  const due = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  if (minutes < due || minutes - due > PILL_LOOKBACK_MIN) return null;
  return { time, today };
}
