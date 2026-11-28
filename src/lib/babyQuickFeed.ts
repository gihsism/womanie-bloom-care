// Shared by the baby tracker's Feed tab and Home's baby card: the one-tap
// "quick log" (her last feed again) and the running timers kept on the
// device. Small and dependency-free so Home can use it without loading the
// tracker.

export type FeedMethod = 'breast_l' | 'breast_r' | 'bottle';
export type FeedData = { method: FeedMethod; ml?: number | null; milk?: 'breast_milk' | 'formula' | null };

export const METHOD_LABEL: Record<FeedMethod, string> = { breast_l: 'Left breast', breast_r: 'Right breast', bottle: 'Bottle' };

export const SLEEP_ACTIVE_KEY = (babyId: string) => `womanie_baby_sleep_active_${babyId}`;
export const FEED_ACTIVE_KEY = (babyId: string) => `womanie_baby_feed_active_${babyId}`;

export interface QuickFeed { method: FeedMethod; minutes: number; ml: number | null; milk: 'breast_milk' | 'formula' | null }

interface FeedLike { occurred_at: string; ended_at?: string | null; data?: unknown }

// Whole minutes, rounded down (as date-fns differenceInMinutes).
const minutesBetween = (a: string, b: string) => Math.trunc((Date.parse(b) - Date.parse(a)) / 60000);

/** What one tap logs, from her last feed: the same bottle, or the other breast for as long as last time. */
export function quickFeedFrom(last: FeedLike | undefined | null): QuickFeed | null {
  const d = (last?.data ?? null) as Partial<FeedData> | null;
  const m = d?.method;
  if (!last || !m || !(m in METHOD_LABEL)) return null;
  if (m === 'bottle') {
    const ml = Number(d?.ml);
    return { method: 'bottle', minutes: 0, ml: Number.isFinite(ml) && ml > 0 ? ml : null, milk: d?.milk ?? null };
  }
  const dur = last.ended_at ? minutesBetween(last.occurred_at, last.ended_at) : 0;
  return { method: m === 'breast_l' ? 'breast_r' : 'breast_l', minutes: dur > 0 && dur < 120 ? dur : 15, ml: null, milk: null };
}

export const quickFeedLabel = (q: QuickFeed) => q.method === 'bottle'
  ? ['Bottle', q.ml ? `${q.ml} ml` : null, q.milk ? (q.milk === 'formula' ? 'formula' : 'breast milk') : null].filter(Boolean).join(' · ')
  : `${METHOD_LABEL[q.method]} · ${q.minutes} min`;

/** The entry a quick log saves: a bottle given now, or a breastfeed that just finished. */
export function quickFeedEvent(q: QuickFeed, now = Date.now()): { occurred_at: string; ended_at?: string; data: FeedData } {
  return q.method === 'bottle'
    ? { occurred_at: new Date(now).toISOString(), data: { method: 'bottle', ml: q.ml, milk: q.milk } }
    : { occurred_at: new Date(now - q.minutes * 60000).toISOString(), ended_at: new Date(now).toISOString(), data: { method: q.method } };
}

/** "bottle 90 ml" / "left side, 15 min" for the last-feed line. */
export function feedDetail(method: string, ml: number | null, durationMin: number | null): string {
  if (method === 'bottle') return ml ? `bottle ${ml} ml` : 'bottle';
  const side = method === 'breast_l' ? 'left side' : method === 'breast_r' ? 'right side' : '';
  return [side, durationMin ? `${durationMin} min` : null].filter(Boolean).join(', ');
}

/** Running timer as a clock: "4:07" or "1:02:05". */
export const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
};

export type ActiveTimer = { kind: 'feed'; side: FeedMethod; start: number } | { kind: 'sleep'; start: number };

/** The feed or sleep timer running on this device for this baby (feed first), or null. */
export function readActiveTimer(babyId: string, storage: Pick<Storage, 'getItem'> | null = safeStorage()): ActiveTimer | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(FEED_ACTIVE_KEY(babyId));
    if (raw) {
      const a = JSON.parse(raw) as { side?: unknown; start?: unknown };
      if (typeof a?.side === 'string' && a.side in METHOD_LABEL && Number.isFinite(Number(a.start))) {
        return { kind: 'feed', side: a.side as FeedMethod, start: Number(a.start) };
      }
    }
  } catch { /* bad value: ignore */ }
  try {
    const v = storage.getItem(SLEEP_ACTIVE_KEY(babyId));
    const n = v ? Number(v) : NaN;
    if (Number.isFinite(n) && n > 0) return { kind: 'sleep', start: n };
  } catch { /* ignore */ }
  return null;
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
