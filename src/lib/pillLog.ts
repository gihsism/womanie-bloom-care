// Contraceptive pill ticks are stored inside daily_health_signals.notes
// as "Pill: on-time" / "Pill: late" / "Pill: missed" (written by the
// contraception card and DailyLogging). Shared parser so the card and
// Home's "Today" list never disagree.

export type PillStatus = 'on-time' | 'late' | 'missed';

export function parsePillStatus(notes: string | null | undefined): PillStatus | null {
  if (!notes) return null;
  const match = notes.match(/Pill:\s*(on-time|late|missed)/i);
  if (!match) return null;
  return match[1].toLowerCase() as PillStatus;
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Yesterday has no pill tick although she ticks regularly (any tick in the
 * last 7 days), outside the pill-free week and pack day 1 — the case where
 * Home asks "Yesterday's pill not ticked. Missed it?" (lib/todayItems.ts),
 * so the contraception card offers to answer it.
 */
export function yesterdayPillUnanswered(
  rows: Array<{ signal_date: string; notes: string | null }>,
  packDay: number | null,
  now = new Date(),
): boolean {
  if (packDay != null && (packDay > 21 || packDay === 1)) return false;
  const yesterday = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const weekAgo = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7));
  const ticked = rows.filter(r => String(r.signal_date).slice(0, 10) >= weekAgo && parsePillStatus(r.notes) != null);
  return ticked.length > 0 && !ticked.some(r => String(r.signal_date).slice(0, 10) === yesterday);
}

/** Pack day 1–28 from the pack start date (yyyy-MM-dd), cycling through 28-day packs. */
export function pillPackDay(packStartDate: string | null, now = new Date()): number | null {
  if (!packStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(packStartDate)) return null;
  const [y, m, d] = packStartDate.split('-').map(Number);
  const start = new Date(y, m - 1, d).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.round((today - start) / 86_400_000);
  if (days < 0) return null;
  return (days % 28) + 1;
}
