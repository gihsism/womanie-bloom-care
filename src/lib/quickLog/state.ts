import type { DailyRow } from './daily';
import { getSegment, hotFlushCount } from './daily';
import type { IconKey, Tile, TimerKind } from './tiles';

// What has been logged today, as plain data, and the two things Home
// derives from it: each tile's badge, and the "Today" rows with times.
// Pure, so it is unit-tested without a browser or database.

export interface TodayEvent {
  id: string;
  kind: 'kick_session' | 'contraction' | 'feed' | 'nappy' | 'baby_sleep' | 'med_dose';
  occurred_at: string; // ISO
  ended_at: string | null;
  data: Record<string, unknown>;
}

export interface QuickLogState {
  row: DailyRow;
  /** Device-side tap times for entries the daily row stores without a time (key -> ISO). */
  taps: Record<string, string>;
  /** Today's account events (life_events), any order. */
  events: TodayEvent[];
  /** The kick session in progress on this device. */
  kickSession: { startedAt: number; taps: number[] } | null;
  /** Running timers on this device (start, epoch ms). */
  running: Partial<Record<TimerKind, number>>;
  /** A period start logged for today. */
  periodStartedToday: boolean;
}

export const EMPTY_STATE: QuickLogState = {
  row: { symptoms: null, mood: null, notes: null }, taps: {}, events: [], kickSession: null, running: {}, periodStartedToday: false,
};

/** Key of the device tap-time record for a daily-row entry. */
export const tapKey = {
  symptom: (v: string) => `sym:${v}`,
  mood: (v: string) => `mood:${v}`,
  segment: (label: string) => `seg:${label}`,
  period: 'period',
} as const;

const isSameDay = (iso: string, now: Date) => {
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
};

export function kicksTodayCount(s: QuickLogState, now = new Date()): number {
  const saved = s.events
    .filter(e => e.kind === 'kick_session' && isSameDay(e.occurred_at, now))
    .reduce((n, e) => n + (Number(e.data?.count) || 0), 0);
  const live = s.kickSession && isSameDay(new Date(s.kickSession.startedAt).toISOString(), now) ? s.kickSession.taps.length : 0;
  return saved + live;
}

const feedSide = (t: TimerKind) => (t === 'feed_l' ? 'breast_l' : 'breast_r');

export interface Badge {
  /** A number or "1/2" in the corner. */
  count?: string;
  /** Logged today (a small tick). */
  done?: boolean;
  /** A running timer's start (epoch ms): the tile shows the elapsed time. */
  runningSince?: number;
}

export function badgeFor(tile: Tile, s: QuickLogState, now = new Date()): Badge {
  const a = tile.action;
  const today = s.events.filter(e => isSameDay(e.occurred_at, now));
  const count = (n: number): Badge => (n > 0 ? { count: String(n) } : {});
  switch (a.kind) {
    case 'kick': return count(kicksTodayCount(s, now));
    case 'hotflush': return count(hotFlushCount(s.row));
    case 'timer': {
      const since = s.running[a.timer];
      if (since) return { runningSince: since };
      if (a.timer === 'contraction') return count(today.filter(e => e.kind === 'contraction').length);
      if (a.timer === 'baby_sleep') return count(today.filter(e => e.kind === 'baby_sleep').length);
      return count(today.filter(e => e.kind === 'feed' && e.data?.method === feedSide(a.timer)).length);
    }
    case 'nappy':
      return count(today.filter(e => e.kind === 'nappy' && (e.data?.type === a.value || e.data?.type === 'both')).length);
    case 'bottle': return count(today.filter(e => e.kind === 'feed' && e.data?.method === 'bottle').length);
    case 'dose': {
      const taken = today.filter(e => e.kind === 'med_dose' && e.data?.medication_id === a.medicationId).length;
      return taken > 0 ? { count: `${Math.min(taken, 99)}/${a.perDay}`, done: taken >= a.perDay } : {};
    }
    case 'symptom': return { done: !!s.row.symptoms?.includes(a.value) };
    case 'mood': return { done: !!s.row.mood?.includes(a.value) };
    case 'flow': return { done: getSegment(s.row.notes, 'Flow')?.toLowerCase() === a.value };
    case 'pill': return { done: getSegment(s.row.notes, 'Pill')?.toLowerCase() === a.value };
    case 'choice': return { done: !!getSegment(s.row.notes, a.segment) };
    case 'period': return { done: s.periodStartedToday };
    default: return {};
  }
}

export interface LoggedRow {
  id: string;
  icon: IconKey;
  label: string;
  time: Date | null;
}

const MOOD_WORD: Record<string, string> = {
  sad: 'low', happy: 'happy', calm: 'calm', neutral: 'okay', irritable: 'irritable', anxious: 'anxious', loving: 'loving', tired: 'tired',
};
const SYMPTOM_ICON: Record<string, IconKey> = {
  Cramps: 'cramp', Headache: 'head', 'Back pain': 'back', Nausea: 'nausea', Fatigue: 'tired', Insomnia: 'moon',
  'Joint pain': 'joint', Anxiety: 'anxious', Acne: 'acne', Bloating: 'bloat', 'Hot flashes': 'flame',
};
const SYMPTOM_WORD: Record<string, string> = { Fatigue: 'Tired', Insomnia: 'Bad sleep', Anxiety: 'Anxious', 'Hot flashes': 'Hot flushes' };
const FEED_WORD: Record<string, string> = { breast_l: 'left', breast_r: 'right', bottle: 'bottle' };


/** Everything logged today, newest first, one row per kind of entry. */
export function loggedRows(s: QuickLogState, now = new Date()): LoggedRow[] {
  const at = (key: string): Date | null => (s.taps[key] ? new Date(s.taps[key]) : null);
  const rows: LoggedRow[] = [];
  const today = s.events.filter(e => isSameDay(e.occurred_at, now));
  const latest = (evs: TodayEvent[]) => new Date(Math.max(...evs.map(e => Date.parse(e.ended_at ?? e.occurred_at))));

  if (s.periodStartedToday) rows.push({ id: 'period', icon: 'drop', label: 'Period started', time: at(tapKey.period) });
  const flow = getSegment(s.row.notes, 'Flow');
  if (flow) rows.push({ id: 'flow', icon: flow.toLowerCase() === 'spotting' ? 'spot' : 'drop', label: flow.toLowerCase() === 'spotting' ? 'Spotting' : `Period: ${flow.toLowerCase()}`, time: at(tapKey.segment('Flow')) });
  const pill = getSegment(s.row.notes, 'Pill')?.toLowerCase();
  if (pill) rows.push({ id: 'pill', icon: pill === 'missed' ? 'pillx' : 'pill', label: pill === 'missed' ? 'Missed pill' : pill === 'late' ? 'Pill taken late' : 'Pill taken', time: at(tapKey.segment('Pill')) });
  const hf = hotFlushCount(s.row);
  if (hf) rows.push({ id: 'hot-flush', icon: 'flame', label: `Hot flushes · ${hf}`, time: at(tapKey.segment('Hot flashes')) });
  const sex = getSegment(s.row.notes, 'Intercourse')?.toLowerCase();
  if (sex && sex !== 'no') rows.push({ id: 'sex', icon: 'heart', label: sex === 'yes-unprotected' ? 'Sex: not protected' : 'Sex: protected', time: at(tapKey.segment('Intercourse')) });
  const lh = getSegment(s.row.notes, 'LH test')?.toLowerCase();
  if (lh && lh !== 'not-tested') rows.push({ id: 'lh', icon: 'lh', label: `LH test: ${lh}`, time: at(tapKey.segment('LH test')) });
  for (const v of s.row.symptoms ?? []) {
    rows.push({ id: `sym-${v}`, icon: SYMPTOM_ICON[v] ?? 'note', label: SYMPTOM_WORD[v] ?? v, time: at(tapKey.symptom(v)) });
  }
  for (const v of s.row.mood ?? []) {
    rows.push({ id: `mood-${v}`, icon: 'moodlow', label: `Mood: ${MOOD_WORD[v] ?? v}`, time: at(tapKey.mood(v)) });
  }

  const kicks = kicksTodayCount(s, now);
  if (kicks) {
    const tapsAt = [...(s.kickSession?.taps ?? []), ...today.filter(e => e.kind === 'kick_session').map(e => Date.parse(e.ended_at ?? e.occurred_at))];
    rows.push({ id: 'kicks', icon: 'foot', label: `Kicks · ${kicks} so far`, time: tapsAt.length ? new Date(Math.max(...tapsAt)) : null });
  }
  const group = (kind: TodayEvent['kind'], pred: (e: TodayEvent) => boolean, id: string, icon: IconKey, word: (n: number, evs: TodayEvent[]) => string) => {
    const evs = today.filter(e => e.kind === kind && pred(e));
    if (evs.length) rows.push({ id, icon, label: word(evs.length, evs), time: latest(evs) });
  };
  group('contraction', e => !!e.ended_at, 'contractions', 'wave', n => (n === 1 ? 'Contraction' : `Contractions · ${n}`));
  group('feed', () => true, 'feeds', 'bottle', (n, evs) => {
    const last = [...evs].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0];
    return `Feeds · ${n} · last ${FEED_WORD[String(last.data?.method)] ?? 'feed'}`;
  });
  group('nappy', e => e.data?.type !== 'dirty', 'wet', 'wet', n => `Wet nappies · ${n}`);
  group('nappy', e => e.data?.type !== 'wet', 'dirty', 'dirty', n => `Dirty nappies · ${n}`);
  group('baby_sleep', e => !!e.ended_at, 'sleep', 'moon', (n, evs) => {
    const min = evs.reduce((m, e) => m + Math.max(0, (Date.parse(e.ended_at!) - Date.parse(e.occurred_at)) / 60000), 0);
    const h = Math.floor(min / 60); const mm = Math.round(min % 60);
    return `Sleep · ${h ? `${h}h ${mm}m` : `${mm}m`} (${n})`;
  });
  const meds = new Map<string, TodayEvent[]>();
  for (const e of today.filter(x => x.kind === 'med_dose')) {
    const k = String(e.data?.medication_id ?? e.data?.name ?? e.id);
    meds.set(k, [...(meds.get(k) ?? []), e]);
  }
  for (const [k, evs] of meds) {
    const name = String(evs[0].data?.name ?? 'Medicine');
    rows.push({ id: `dose-${k}`, icon: 'syringe', label: evs.length > 1 ? `${name} · ${evs.length} doses` : `${name} taken`, time: latest(evs) });
  }

  // Newest first; entries without a known time (logged in the sheet) last.
  return rows.sort((a, b) => (b.time?.getTime() ?? 0) - (a.time?.getTime() ?? 0));
}
