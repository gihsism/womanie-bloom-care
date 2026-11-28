// One rule for "is this visit still ahead of her?" on Visits (Your next
// visit / Past visits), the questions card and Home's "Visit today at …":
// not cancelled or closed, and not yet over (start + duration, 30 minutes
// when the length is unknown). A visit that started 10 minutes ago is
// still "next", not "past".

export interface VisitTimes {
  scheduled_at: string;
  status?: string | null;
  duration?: number | null;
}

const CLOSED = new Set(['cancelled', 'completed', 'no_show', 'no-show']);

export function isVisitAhead(v: VisitTimes, now: number = Date.now()): boolean {
  if (CLOSED.has(String(v.status ?? '').toLowerCase())) return false;
  const start = Date.parse(v.scheduled_at);
  if (Number.isNaN(start)) return false;
  return start + (v.duration ?? 30) * 60_000 > now;
}

/** The soonest visit still ahead, or null. */
export function nextVisitAhead<T extends VisitTimes>(list: readonly T[], now: number = Date.now()): T | null {
  return [...list].filter(v => isVisitAhead(v, now))
    .sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at))[0] ?? null;
}
