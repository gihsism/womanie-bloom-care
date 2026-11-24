import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { db } from '@/integrations/db/client';
import { emitHealthDataChange, onHealthDataChange } from '@/lib/data-events';
import type { LifeStage } from '@/components/dashboard/DashboardHeader';
import type { LifeEventKind } from '@/hooks/useLifeEvents';
import { hotFlushEdit, moodEdit, segmentEdit, symptomEdit, type RowEdit } from '@/lib/quickLog/daily';
import { EMPTY_STATE, tapKey, type QuickLogState, type TodayEvent } from '@/lib/quickLog/state';
import { loggedWord, type Tile, type TimerKind } from '@/lib/quickLog/tiles';
import {
  addEvent, deviceKeys, logRowEdit, readJson, readTodayRow, recordTap, startPeriod, writeJson, type Undo,
} from '@/lib/quickLog/writes';

// Home's one-tap logging: loads what was logged today (for the badges and
// the Today rows) and performs a tile's write. Every write returns the
// toast title and an Undo that deletes exactly what the tap stored.

export interface Med { id: string; name: string; dose: string | null; times_per_day: number | null }
export interface LogResult { title: string; undo: Undo | null }

const KINDS: Partial<Record<LifeStage, TodayEvent['kind'][]>> = {
  pregnancy: ['kick_session', 'contraction'],
  postpartum: ['feed', 'nappy', 'baby_sleep'],
  ivf: ['med_dose'],
};
const CYCLE: LifeStage[] = ['menstrual-cycle', 'conception', 'pre-menstrual'];

const hhmm = (d: Date) => format(d, 'HH:mm');
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const sameDay = (ms: number) => new Date(ms).toDateString() === new Date().toDateString();
const mmss = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`; };

interface KickSession { id: string; startedAt: number; endedAt: number | null; count: number; taps: number[] }
const FEED_SIDE: Record<'feed_l' | 'feed_r', 'breast_l' | 'breast_r'> = { feed_l: 'breast_l', feed_r: 'breast_r' };
const TIMER_WORD: Record<TimerKind, string> = { contraction: 'Contraction', feed_l: 'Left feed', feed_r: 'Right feed', baby_sleep: 'Sleep' };

export function useQuickLog(mode: LifeStage | null, userId: string | null, opts: { cycleLength?: number } = {}) {
  const [state, setState] = useState<QuickLogState>(EMPTY_STATE);
  const [meds, setMeds] = useState<Med[]>([]);
  const [babyId, setBabyId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!userId || !mode) return;
    try {
      const kinds = KINDS[mode] ?? [];
      let baby: string | null = null;
      if (mode === 'postpartum') {
        const { data } = await db.from('babies').select('id').eq('user_id', userId).order('created_at', { ascending: true }).limit(1);
        baby = ((data as { id: string }[] | null) ?? [])[0]?.id ?? null;
      }
      const [row, evRes, perRes, medRes] = await Promise.all([
        readTodayRow(userId),
        kinds.length
          ? db.from('life_events').select('*').eq('user_id', userId).in('kind', kinds).gte('occurred_at', startOfToday().toISOString())
          : Promise.resolve({ data: [] }),
        CYCLE.includes(mode)
          ? db.from('period_tracking').select('period_start_date').eq('user_id', userId).order('period_start_date', { ascending: false }).limit(1)
          : Promise.resolve({ data: [] }),
        mode === 'ivf'
          ? db.from('medications').select('*').eq('user_id', userId).eq('active', true).order('created_at', { ascending: true })
          : Promise.resolve({ data: [] }),
      ]);
      // Baby entries: the first baby's only (Home follows one baby, as its hero did).
      const rows = ((evRes.data ?? []) as Record<string, unknown>[])
        .filter(r => mode !== 'postpartum' || (baby != null && r.baby_id === baby));
      const events = rows.map((r): TodayEvent => {
        let data = r.data as unknown;
        if (typeof data === 'string') { try { data = JSON.parse(data); } catch { data = {}; } }
        return { id: String(r.id), kind: r.kind as TodayEvent['kind'], occurred_at: new Date(String(r.occurred_at)).toISOString(), ended_at: r.ended_at ? new Date(String(r.ended_at)).toISOString() : null, data: (data ?? {}) as Record<string, unknown> };
      });
      const lastStart = ((perRes.data ?? []) as { period_start_date: string }[])[0]?.period_start_date?.slice(0, 10);
      const running: QuickLogState['running'] = {};
      const c = readJson<{ startedAt: number; endedAt: number | null } | null>(deviceKeys.contraction(userId), null);
      if (c && c.endedAt == null) running.contraction = c.startedAt;
      if (baby) {
        const f = readJson<{ side: string; start: number } | null>(deviceKeys.feed(baby), null);
        if (f?.side === 'breast_l') running.feed_l = f.start;
        if (f?.side === 'breast_r') running.feed_r = f.start;
        const s = readJson<number | null>(deviceKeys.sleep(baby), null);
        if (s) running.baby_sleep = Number(s);
      }
      const k = readJson<KickSession | null>(deviceKeys.kickSession(userId), null);
      setBabyId(baby);
      setMeds((medRes.data ?? []) as Med[]);
      setState({
        row, events, running,
        taps: readJson(deviceKeys.taps(userId), {}),
        kickSession: k && k.endedAt == null ? { startedAt: k.startedAt, taps: k.taps ?? [] } : null,
        periodStartedToday: lastStart === format(new Date(), 'yyyy-MM-dd'),
      });
    } catch {
      // Keep the last known state; tiles still work.
    } finally {
      setLoaded(true);
    }
  }, [userId, mode]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => onHealthDataChange(() => { void load(); }), [load]);

  const done = () => { emitHealthDataChange(); };
  const withReload = (undo: Undo | null): Undo | null => (undo ? async () => { await undo(); done(); } : null);

  const rowLog = async (edit: RowEdit, key: string, word: string, at: Date): Promise<LogResult> => {
    const r = await logRowEdit(userId!, edit);
    if (r.already) return { title: `${word} already logged today`, undo: null };
    const untap = recordTap(userId!, key, at);
    return { title: `${word} logged · ${hhmm(at)}`, undo: withReload(async () => { await r.undo?.(); untap(); }) };
  };

  const kick = async (at: Date): Promise<LogResult> => {
    const key = deviceKeys.kickSession(userId!);
    let cur = readJson<KickSession | null>(key, null);
    if (cur && cur.endedAt == null && !sameDay(cur.startedAt) && cur.count > 0) {
      // Yesterday's unfinished session: save it as the counter's Stop would.
      await addEvent(userId!, 'kick_session', { occurred_at: new Date(cur.startedAt).toISOString(), ended_at: new Date(cur.taps[cur.taps.length - 1] ?? cur.startedAt).toISOString(), data: { count: cur.count, taps: cur.taps } });
      cur = null;
    }
    if (!cur || cur.endedAt != null || !sameDay(cur.startedAt)) cur = { id: crypto.randomUUID(), startedAt: at.getTime(), endedAt: null, count: 0, taps: [] };
    const prev = cur;
    const next: KickSession = { ...cur, count: cur.count + 1, taps: [...cur.taps, at.getTime()] };
    if (next.count >= 10) {
      // Ten movements complete a session (as the kick counter does): saved to the account.
      writeJson(key, null);
      const ev = await addEvent(userId!, 'kick_session', { occurred_at: new Date(next.startedAt).toISOString(), ended_at: at.toISOString(), data: { count: next.count, taps: next.taps } });
      return { title: `Kick logged · ${hhmm(at)} · 10 done`, undo: withReload(async () => { await ev.undo(); writeJson(key, prev); }) };
    }
    writeJson(key, next);
    return {
      title: `Kick logged · ${hhmm(at)}`,
      undo: withReload(async () => {
        const c = readJson<KickSession | null>(key, null);
        if (c && c.id === next.id) writeJson(key, prev.count > 0 ? prev : null);
      }),
    };
  };

  const timer = async (t: TimerKind, at: Date): Promise<LogResult> => {
    const isFeed = t === 'feed_l' || t === 'feed_r';
    if ((isFeed || t === 'baby_sleep') && !babyId) return { title: 'Add your baby first', undo: null };
    const key = t === 'contraction' ? deviceKeys.contraction(userId!) : isFeed ? deviceKeys.feed(babyId!) : deviceKeys.sleep(babyId!);
    const raw = localStorage.getItem(key);
    const stopSave = async (start: number, kind: LifeEventKind, data?: Record<string, unknown>) =>
      addEvent(userId!, kind, { occurred_at: new Date(start).toISOString(), ended_at: at.toISOString(), baby_id: kind === 'contraction' ? null : babyId, data });
    const since = state.running[t];
    if (since) {
      writeJson(key, null);
      const kind: LifeEventKind = t === 'contraction' ? 'contraction' : isFeed ? 'feed' : 'baby_sleep';
      const ev = await stopSave(since, kind, isFeed ? { method: FEED_SIDE[t] } : undefined);
      return { title: `${TIMER_WORD[t]} saved · ${mmss(at.getTime() - since)}`, undo: withReload(async () => { await ev.undo(); writeJson(key, raw); }) };
    }
    const undos: Undo[] = [];
    if (isFeed) {
      // The other side still running: finish it first.
      const other = t === 'feed_l' ? 'feed_r' : 'feed_l';
      const os = state.running[other];
      if (os) {
        const ev = await stopSave(os, 'feed', { method: FEED_SIDE[other] });
        undos.push(async () => { await ev.undo(); writeJson(key, raw); });
      }
      writeJson(key, { side: FEED_SIDE[t], start: at.getTime() });
    } else if (t === 'contraction') {
      writeJson(key, { id: crypto.randomUUID(), startedAt: at.getTime(), endedAt: null });
    } else {
      writeJson(key, at.getTime());
    }
    return {
      title: `${TIMER_WORD[t]} started · ${hhmm(at)} · tap again to stop`,
      undo: withReload(async () => { writeJson(key, null); for (const u of undos.reverse()) await u(); }),
    };
  };

  const event = async (kind: LifeEventKind, data: Record<string, unknown>, word: string, at: Date, baby = false): Promise<LogResult> => {
    if (baby && !babyId) return { title: 'Add your baby first', undo: null };
    const ev = await addEvent(userId!, kind, { occurred_at: at.toISOString(), baby_id: baby ? babyId : null, data });
    return { title: `${word} logged · ${hhmm(at)}`, undo: withReload(ev.undo) };
  };

  /** Log one tap. `choice` is the option picked on a two-choice tile. */
  const log = useCallback(async (tile: Tile, choice?: { label: string; value: string }): Promise<LogResult | null> => {
    if (!userId) return null;
    const at = new Date();
    const a = tile.action;
    const word = loggedWord(tile, choice?.label);
    let res: LogResult | null = null;
    switch (a.kind) {
      case 'symptom': res = await rowLog(symptomEdit(a.value), tapKey.symptom(a.value), word, at); break;
      case 'mood': res = await rowLog(moodEdit(a.value), tapKey.mood(a.value), word, at); break;
      case 'flow': res = await rowLog(segmentEdit('Flow', a.value), tapKey.segment('Flow'), word, at); break;
      case 'hotflush': res = await rowLog(hotFlushEdit, tapKey.segment('Hot flashes'), word, at); break;
      case 'choice':
        if (!choice) return null;
        res = await rowLog(segmentEdit(a.segment, choice.value), tapKey.segment(a.segment), word, at);
        break;
      case 'pill': {
        res = await rowLog(segmentEdit('Pill', a.value), tapKey.segment('Pill'), word, at);
        // First pill of a pack stamps the pack start, as the method card does.
        const packKey = `contraception:${userId}:packStartDate`;
        if (res.undo && a.value === 'on-time' && !localStorage.getItem(packKey)) {
          writeJson(packKey, format(at, 'yyyy-MM-dd'));
          const u = res.undo;
          res = { ...res, undo: async () => { await u(); writeJson(packKey, null); } };
        }
        break;
      }
      case 'period': {
        const r = await startPeriod(userId, opts.cycleLength ?? 28);
        if (r.already) { res = { title: 'Period already logged', undo: null }; break; }
        const untap = recordTap(userId, tapKey.period, at);
        res = { title: `Period started · ${hhmm(at)}`, undo: withReload(async () => { await r.undo?.(); untap(); }) };
        break;
      }
      case 'kick': res = await kick(at); break;
      case 'timer': res = await timer(a.timer, at); break;
      case 'nappy': res = await event('nappy', { type: a.value }, word, at, true); break;
      case 'bottle': res = await event('feed', { method: 'bottle', ml: null, milk: null }, word, at, true); break;
      case 'dose': res = await event('med_dose', { medication_id: a.medicationId, name: a.name, dose: a.dose }, `${a.name}`, at); break;
      default: return null;
    }
    done();
    return res;
    // The helpers read the latest state through the closure each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, state, babyId, opts.cycleLength]);

  return { state, meds, hasBaby: !!babyId, loaded, log, reload: load };
}
