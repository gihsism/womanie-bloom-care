import { format } from 'date-fns';
import { db } from '@/integrations/db/client';
import { insertLifeEvent, type LifeEventKind } from '@/hooks/useLifeEvents';
import { EMPTY_ROW, type DailyRow, type RowEdit } from './daily';

// The writes behind Home's one-tap tiles. Each returns an `undo` that
// removes exactly what it wrote. Same tables, columns, formats and device
// keys as the existing trackers — nothing new is stored:
//   daily_health_signals (DailyLogging), period_tracking (CycleCalendar),
//   life_events (useLifeEvents), and the in-progress kick session /
//   contraction / feed / sleep that KickCounter, ContractionTimer and
//   BabyTracker keep on the device.

export type Undo = () => Promise<void>;
export interface Logged { undo: Undo | null; already?: boolean }

const ymd = (d = new Date()) => format(d, 'yyyy-MM-dd');

// ---- daily_health_signals ---------------------------------------------------

export async function readTodayRow(userId: string): Promise<DailyRow> {
  const { data } = await db.from('daily_health_signals').select('symptoms, mood, notes')
    .eq('user_id', userId).eq('signal_date', ymd()).maybeSingle();
  if (!data) return { ...EMPTY_ROW };
  const r = data as Partial<DailyRow>;
  return { symptoms: r.symptoms ?? null, mood: r.mood ?? null, notes: r.notes ?? null };
}

async function writeRow(userId: string, date: string, r: DailyRow): Promise<void> {
  const { error } = await db.from('daily_health_signals').upsert({
    user_id: userId,
    signal_date: date,
    symptoms: r.symptoms && r.symptoms.length ? r.symptoms : null,
    mood: r.mood && r.mood.length ? r.mood : null,
    notes: r.notes || null,
  }, { onConflict: 'user_id,signal_date' });
  if (error) throw new Error('save failed');
}

export async function logRowEdit(userId: string, edit: RowEdit): Promise<Logged> {
  const date = ymd();
  const row = await readTodayRow(userId);
  if (edit.already(row)) return { undo: null, already: true };
  await writeRow(userId, date, edit.apply(row));
  return {
    undo: async () => {
      // Re-read: something else may have been logged since.
      const { data } = await db.from('daily_health_signals').select('symptoms, mood, notes')
        .eq('user_id', userId).eq('signal_date', date).maybeSingle();
      const now = (data as DailyRow | null) ?? { ...EMPTY_ROW };
      await writeRow(userId, date, edit.revert({ symptoms: now.symptoms ?? null, mood: now.mood ?? null, notes: now.notes ?? null }));
    },
  };
}

// ---- period_tracking ----------------------------------------------------------

/** A new period starting today, unless one already started in the last 10 days. */
export async function startPeriod(userId: string, cycleLength: number): Promise<Logged> {
  const date = ymd();
  const { data } = await db.from('period_tracking').select('period_start_date')
    .eq('user_id', userId).order('period_start_date', { ascending: false }).limit(1).maybeSingle();
  const last = (data as { period_start_date?: string } | null)?.period_start_date?.slice(0, 10);
  if (last) {
    const days = Math.round((Date.parse(`${date}T00:00:00`) - Date.parse(`${last}T00:00:00`)) / 86400000);
    if (days >= 0 && days < 10) return { undo: null, already: true };
  }
  const { error } = await db.from('period_tracking').insert({
    user_id: userId, period_start_date: date, period_end_date: null, cycle_length: cycleLength,
  });
  if (error) throw new Error('save failed');
  return {
    undo: async () => {
      await db.from('period_tracking').delete().eq('user_id', userId).eq('period_start_date', date);
    },
  };
}

// ---- life_events -------------------------------------------------------------

export async function addEvent(
  userId: string, kind: LifeEventKind,
  e: { occurred_at: string; ended_at?: string | null; baby_id?: string | null; data?: Record<string, unknown> },
): Promise<{ id: string; undo: Undo }> {
  const saved = await insertLifeEvent(userId, kind, e);
  if (!saved) throw new Error('save failed');
  return { id: saved.id, undo: () => deleteEvent(userId, saved.id) };
}

export async function deleteEvent(userId: string, id: string): Promise<void> {
  await db.from('life_events').delete().eq('id', id).eq('user_id', userId);
}

// ---- device-side "in progress" state (same keys as the trackers) ------------

export const deviceKeys = {
  kickSession: (uid: string) => `womanie_kick_session_${uid}`,
  contraction: (uid: string) => `womanie_contraction_active_${uid}`,
  feed: (babyId: string) => `womanie_baby_feed_active_${babyId}`,
  sleep: (babyId: string) => `womanie_baby_sleep_active_${babyId}`,
  taps: (uid: string, date = ymd()) => `womanie_taps_${uid}_${date}`,
};

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch { /* storage blocked: the account copy is what counts */ }
}

/** Remember when a daily-row entry was tapped (the row itself has no times). */
export function recordTap(userId: string, key: string, at: Date): () => void {
  const k = deviceKeys.taps(userId);
  const taps = readJson<Record<string, string>>(k, {});
  const before = taps[key];
  writeJson(k, { ...taps, [key]: at.toISOString() });
  return () => {
    const now = readJson<Record<string, string>>(k, {});
    if (before) now[key] = before; else delete now[key];
    writeJson(k, now);
  };
}
