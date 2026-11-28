import { formatTime } from '@/lib/timeFormat';
import { DATE_FMT, WEEKDAY_DAY_MONTH_FMT } from '@/lib/dateFormat';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLifeEvents, importLocalOnce, type LifeEvent } from '@/hooks/useLifeEvents';
import { Baby, Milk, Moon, Droplets, Ruler, Syringe, Trash2, Play, Square, BarChart3, Plus, Timer, Repeat, Check } from 'lucide-react';
import { METHOD_LABEL, FEED_ACTIVE_KEY, SLEEP_ACTIVE_KEY, quickFeedFrom, quickFeedLabel, quickFeedEvent, fmtClock, type FeedMethod, type FeedData } from '@/lib/babyQuickFeed';
import { useUndoNotice } from './useUndoNotice';
import { BAG_BABY_VACCINES, BAG_SCHEDULE_SOURCE, BAG_SCHEDULE_URL, babyVaccinePlan, rsvTiming, vaccineMarksFrom, type PlannedDose, type PlannedVisit } from '@/lib/babyVaccineSchedule';
// Stats tab draws charts (recharts, ~110 KB gzip): load it when opened.
const BabyStatsTab = lazy(() => import('./BabyStatsTab'));
// WHO growth charts + "Add a measurement" (recharts, WHO tables): loaded with the Growth tab.
const BabyGrowthChart = lazy(() => import('./BabyGrowthChart'));
import { differenceInMinutes, format, isToday, isYesterday, parseISO } from 'date-fns';

// Baby tracker: feeds, sleep, nappies, growth and vaccinations, per baby
// (table babies; entries are life_events tagged with baby_id).
// Replaces the device-only PostpartumFeedingTracker; its feeds are moved
// into the account (onto the first baby) once.

interface BabyRow { id: string; name: string; birth_date: string | null; sex: string | null }
interface NappyData { type: 'wet' | 'dirty' | 'both' }
interface GrowthData { weight_g?: number | null; length_cm?: number | null; head_cm?: number | null; source?: 'typed' | 'photo' }
interface VaccineData { name: string; dose?: string }

const OLD_FEEDS_KEY = (userId: string) => `postpartum:${userId}:feeds`;

const fmtMin = (m: number | null) => {
  if (m === null || !Number.isFinite(m)) return '—';
  // A day or more: "9 days", not "217h 36m" (an old last feed, live).
  if (m >= 24 * 60) { const d = Math.floor(m / (24 * 60)); return d === 1 ? '1 day' : `${d} days`; }
  const h = Math.floor(m / 60); const min = Math.round(m % 60);
  return h === 0 ? `${min}m` : min === 0 ? `${h}h` : `${h}h ${min}m`;
};
const readActive = (key: string): number | null => { try { const v = localStorage.getItem(key); return v ? Number(v) : null; } catch { return null; } };
const writeActive = (key: string, v: number | null) => { try { if (v === null) localStorage.removeItem(key); else localStorage.setItem(key, String(v)); } catch { /* ignore */ } };

function useTick(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

function Remove({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Remove entry" className="-m-2.5 p-2.5 text-muted-foreground/60 hover:text-destructive">
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

// "Now" as the value of a datetime-local input (local time, minutes).
const nowLocal = () => format(new Date(), "yyyy-MM-dd'T'HH:mm");
const toLocalInput = (ms: number) => format(new Date(ms), "yyyy-MM-dd'T'HH:mm");


/** A start time she typed for a running timer: in the past, at most 12 hours ago. */
function parseStart(v: string): number | null {
  const t = new Date(v).getTime();
  if (Number.isNaN(t) || t > Date.now() + 60_000 || t < Date.now() - 12 * 3600_000) return null;
  return Math.min(t, Date.now());
}

/** Same entry moved to a new start; a sleep or timed feed keeps its length. */
function retimed(e: LifeEvent<unknown>, iso: string): { occurred_at: string; ended_at?: string } {
  const delta = Date.parse(iso) - Date.parse(e.occurred_at);
  return e.ended_at ? { occurred_at: iso, ended_at: new Date(Date.parse(e.ended_at) + delta).toISOString() } : { occurred_at: iso };
}


/** "Started 14:05 · Change" under a running timer; lets her set the real start. */
function TimerStart({ start, onChange, id }: { start: number; onChange: (t: number) => void; id: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);
  if (!editing) {
    return (
      <p className="text-xs text-muted-foreground">
        Started {formatTime(new Date(start).toISOString())} ·{' '}
        <button type="button" className="underline" onClick={() => { setValue(toLocalInput(start)); setError(false); setEditing(true); }}>Change start time</button>
      </p>
    );
  }
  const save = () => {
    const t = parseStart(value);
    if (t === null) { setError(true); return; }
    onChange(t); setEditing(false);
  };
  return (
    <div className="space-y-1.5 text-left">
      <Label htmlFor={id} className="text-xs">Started at</Label>
      <div className="flex flex-wrap gap-2">
        <Input id={id} type="datetime-local" value={value} max={nowLocal()} onChange={e => { setValue(e.target.value); setError(false); }} className="h-10 text-base flex-1 min-w-[12rem]" />
        <Button size="sm" className="h-10" onClick={save}>Save</Button>
        <Button size="sm" variant="ghost" className="h-10" onClick={() => setEditing(false)}>Cancel</Button>
      </div>
      {error && <p className="text-xs text-destructive">Choose a time in the last 12 hours.</p>}
    </div>
  );
}

/** Running timer card (feed or sleep): live clock, start time she can correct, save, discard. */
function RunningTimer({ title, start, onStart, onSave, saveLabel, onDiscard, id }: {
  title: string; start: number; onStart: (t: number) => void; onSave: () => void; saveLabel: string; onDiscard: () => void; id: string;
}) {
  const now = useTick(true);
  return (
    <div className="rounded-2xl bg-primary/10 border border-primary/30 p-4 text-center space-y-2" data-testid="baby-timer">
      <div className="text-sm text-primary">{title}</div>
      <div className="font-display text-4xl tabular-nums" aria-live="off" data-testid="baby-timer-clock">{fmtClock(now - start)}</div>
      <TimerStart start={start} onChange={onStart} id={id} />
      <Button size="lg" onClick={onSave} className="gap-2 w-full"><Square className="h-4 w-4" /> {saveLabel}</Button>
      <button type="button" className="text-xs text-muted-foreground underline" onClick={onDiscard}>Discard timer</button>
    </div>
  );
}


function FeedTab({ babyId, openAdd = false }: { babyId: string; openAdd?: boolean }) {
  const feeds = useLifeEvents<FeedData>('feed', {
    babyId, limit: 200,
    beforeLoad: (id) => importLocalOnce<{ at: string; method: FeedMethod }, FeedData>(id, OLD_FEEDS_KEY(id), 'feed', f =>
      f?.at ? { occurred_at: f.at, baby_id: babyId, data: { method: f.method } } : null),
  });
  // Running breastfeeding timer, kept on the device so it survives a reload.
  const [active, setActiveState] = useState<{ side: FeedMethod; start: number } | null>(() => {
    try { const raw = localStorage.getItem(FEED_ACTIVE_KEY(babyId)); return raw ? JSON.parse(raw) : null; } catch { return null; }
  });
  const setActive = (a: { side: FeedMethod; start: number } | null) => {
    setActiveState(a);
    try { if (a) localStorage.setItem(FEED_ACTIVE_KEY(babyId), JSON.stringify(a)); else localStorage.removeItem(FEED_ACTIVE_KEY(babyId)); } catch { /* ignore */ }
  };
  const [notice, show] = useUndoNotice();

  // "Add a feed" form — for a feed that already happened (or one you
  // don't want to time). Opens straight away from Home's "+ Feed".
  const [adding, setAdding] = useState(openAdd);
  const lastSide = feeds.events.find(f => f.data?.method !== 'bottle')?.data?.method;
  const quick = quickFeedFrom(feeds.events[0]);
  const [method, setMethod] = useState<FeedMethod>('breast_l');
  const [at, setAt] = useState(nowLocal);
  const [minutes, setMinutes] = useState('15');
  const [ml, setMl] = useState('');
  const [milk, setMilk] = useState<'breast_milk' | 'formula'>('formula');
  const [busy, setBusy] = useState(false);

  // Suggest the other breast from last time.
  useEffect(() => {
    if (lastSide === 'breast_l') setMethod(m => (m === 'bottle' ? m : 'breast_r'));
    if (lastSide === 'breast_r') setMethod(m => (m === 'bottle' ? m : 'breast_l'));
  }, [lastSide]);

  // The form opens with her last choices (same bottle, or the other breast).
  const openForm = () => {
    setAt(nowLocal());
    if (quick) {
      setMethod(quick.method);
      if (quick.method === 'bottle') { setMl(quick.ml ? String(quick.ml) : ''); if (quick.milk) setMilk(quick.milk); }
      else setMinutes(String(quick.minutes));
    }
    setAdding(true);
  };

  const undoable = (saved: LifeEvent<FeedData> | null, text: string, after?: () => void) => {
    if (!saved) return;
    show(text, async () => { if (await feeds.remove(saved.id)) after?.(); });
  };

  const saveFeed = async () => {
    const start = new Date(at);
    if (Number.isNaN(start.getTime())) return;
    setBusy(true);
    try {
      let saved: LifeEvent<FeedData> | null;
      if (method === 'bottle') {
        const n = parseInt(ml, 10);
        saved = await feeds.add({ occurred_at: start.toISOString(), data: { method: 'bottle', ml: Number.isFinite(n) ? n : null, milk } });
      } else {
        const m = parseInt(minutes, 10);
        const ended = Number.isFinite(m) && m > 0 ? new Date(start.getTime() + m * 60000).toISOString() : undefined;
        saved = await feeds.add({ occurred_at: start.toISOString(), ...(ended ? { ended_at: ended } : {}), data: { method } });
      }
      if (saved) { setAdding(false); setMl(''); }
      undoable(saved, 'Feed added ✓');
    } finally { setBusy(false); }
  };

  // One tap: her last feed again, logged as just finished.
  const quickLog = async () => {
    if (!quick || busy) return;
    setBusy(true);
    try {
      const saved = await feeds.add(quickFeedEvent(quick));
      undoable(saved, `${quickFeedLabel(quick)} logged ✓`);
    } finally { setBusy(false); }
  };

  const startBreast = (side: FeedMethod) => setActive({ side, start: Date.now() });
  const stopBreast = async () => {
    if (!active) return;
    const a = active;
    setActive(null);
    const saved = await feeds.add({ occurred_at: new Date(a.start).toISOString(), ended_at: new Date().toISOString(), data: { method: a.side } });
    if (!saved) { setActive(a); return; }
    // Undo puts the timer back as it was.
    undoable(saved, 'Feed saved ✓', () => setActive(a));
  };

  const today = feeds.events.filter(f => isToday(parseISO(f.occurred_at)));
  const mlToday = today.reduce((s, f) => s + (Number(f.data?.ml) || 0), 0);
  const sinceLast = feeds.events[0] ? differenceInMinutes(new Date(), parseISO(feeds.events[0].occurred_at)) : null;
  const typeLabel: Record<FeedMethod, string> = { breast_l: 'Left breast', breast_r: 'Right breast', bottle: 'Bottle' };

  return (
    <div className="space-y-4">
      {feeds.error && <p className="text-xs text-destructive">{feeds.error}</p>}
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Last feed" value={sinceLast === null ? '—' : `${fmtMin(sinceLast)} ago`} />
        <Stat label="Feeds today" value={String(today.length)} />
        <Stat label="Bottle today" value={mlToday ? `${mlToday} ml` : '—'} />
      </div>

      {active ? (
        <RunningTimer id="feed-timer-start" title={`${METHOD_LABEL[active.side]} · feeding now`} start={active.start}
          onStart={t => setActive({ ...active, start: t })} onSave={() => { void stopBreast(); }} saveLabel="Finished — save feed"
          onDiscard={() => { setActive(null); show('Timer discarded.'); }} />
      ) : adding ? (
        <div className="rounded-2xl border border-foreground/20 bg-card p-4 space-y-4" aria-label="Add a feed" data-hide-install-banner>
          <p className="font-display text-lg">Add a feed</p>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Type of feed">
            {(['breast_l', 'breast_r', 'bottle'] as FeedMethod[]).map(m => (
              <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => setMethod(m)}
                className={`rounded-xl border py-3 text-sm ${method === m ? 'bg-foreground text-background border-foreground' : 'border-border'}`}>
                {typeLabel[m]}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="feed-at" className="text-sm">When did it start?</Label>
            <Input id="feed-at" type="datetime-local" value={at} max={nowLocal()} onChange={e => setAt(e.target.value)} className="h-11 text-base" />
          </div>
          {method === 'bottle' ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="bottle-ml" className="text-sm">Amount (ml)</Label>
                <Input id="bottle-ml" inputMode="numeric" value={ml} onChange={e => setMl(e.target.value)} placeholder="e.g. 90" className="h-11 text-base" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(['formula', 'breast_milk'] as const).map(m => (
                  <button key={m} type="button" onClick={() => setMilk(m)} aria-pressed={milk === m}
                    className={`rounded-xl border py-2.5 text-sm ${milk === m ? 'bg-foreground text-background border-foreground' : 'border-border'}`}>
                    {m === 'formula' ? 'Formula' : 'Breast milk'}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="feed-min" className="text-sm">How long? (minutes)</Label>
              <Input id="feed-min" inputMode="numeric" value={minutes} onChange={e => setMinutes(e.target.value)} placeholder="e.g. 15" className="h-11 text-base" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="lg" onClick={() => setAdding(false)}>Cancel</Button>
            <Button size="lg" onClick={saveFeed} disabled={busy}>Save feed</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {quick && (
            <Button size="lg" className="w-full h-auto min-h-14 py-2.5 text-base gap-2 flex-col" onClick={() => { void quickLog(); }} disabled={busy} data-testid="feed-quick-log">
              <span className="flex items-center gap-2"><Repeat className="h-5 w-5" /> Quick log: {quickFeedLabel(quick)}</span>
              <span className="text-xs font-normal opacity-90">Saved as just now · tap its time below to change it</span>
            </Button>
          )}
          <Button size="lg" variant={quick ? 'outline' : 'default'} className={`w-full gap-2 ${quick ? '' : 'h-14 text-base'}`} onClick={openForm}>
            <Plus className="h-5 w-5" /> Add a feed
          </Button>
          <div className="rounded-2xl border border-border p-3 space-y-2">
            <p className="text-sm text-muted-foreground flex items-center gap-1.5"><Timer className="h-4 w-4" /> Breastfeeding now? Start a timer</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => startBreast('breast_l')} className="gap-1.5">
                <Play className="h-3.5 w-3.5" /> Left{lastSide === 'breast_l' ? ' (last time)' : ''}
              </Button>
              <Button variant="outline" onClick={() => startBreast('breast_r')} className="gap-1.5">
                <Play className="h-3.5 w-3.5" /> Right{lastSide === 'breast_r' ? ' (last time)' : ''}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">The timer keeps running if you close the app.</p>
          </div>
        </div>
      )}
      {notice}

      <EntryList events={feeds.events.slice(0, 30)} onRemove={feeds.remove} onRetime={(e, iso) => feeds.update(e.id, retimed(e, iso))} render={f => (
        <>
          {METHOD_LABEL[f.data?.method as FeedMethod] ?? 'Feed'}
          {f.ended_at ? ` · ${fmtMin(differenceInMinutes(parseISO(f.ended_at), parseISO(f.occurred_at)))}` : ''}
          {f.data?.ml ? ` · ${f.data.ml} ml` : ''}
          {f.data?.milk ? ` (${f.data.milk === 'formula' ? 'formula' : 'breast milk'})` : ''}
        </>
      )} />
      {/* 8-12 feeds a day: AAP breastfeeding policy statement (2022) and NHS. */}
      <p className="text-xs text-muted-foreground">Newborns typically feed 8–12 times in 24 hours. Ask your midwife or health visitor if you’re unsure.</p>
    </div>
  );
}

function SleepTab({ babyId }: { babyId: string }) {
  const sleeps = useLifeEvents('baby_sleep', { babyId, limit: 100 });
  const [start, setStartState] = useState<number | null>(() => readActive(SLEEP_ACTIVE_KEY(babyId)));
  const setStart = (t: number | null) => { setStartState(t); writeActive(SLEEP_ACTIVE_KEY(babyId), t); };
  const [notice, show] = useUndoNotice();
  const [adding, setAdding] = useState(false);
  const [from, setFrom] = useState(nowLocal);
  const [mins, setMins] = useState('60');
  // Her last finished sleep: the "earlier sleep" form starts with its length.
  const lastMin = (() => {
    for (const e of sleeps.events) {
      if (!e.ended_at) continue;
      const m = differenceInMinutes(parseISO(e.ended_at), parseISO(e.occurred_at));
      if (m > 0 && m <= 16 * 60) return m;
    }
    return null;
  })();
  const undoable = (saved: LifeEvent | null, text: string, after?: () => void) => {
    if (saved) show(text, async () => { if (await sleeps.remove(saved.id)) after?.(); });
  };
  const begin = () => setStart(Date.now());
  const end = async () => {
    if (start === null) return;
    const s = start; setStart(null);
    const saved = await sleeps.add({ occurred_at: new Date(s).toISOString(), ended_at: new Date().toISOString() });
    if (!saved) { setStart(s); return; }
    undoable(saved, 'Sleep saved ✓', () => setStart(s));
  };
  const savePast = async () => {
    const s = new Date(from); const m = parseInt(mins, 10);
    if (Number.isNaN(s.getTime()) || !Number.isFinite(m) || m <= 0) return;
    const saved = await sleeps.add({ occurred_at: s.toISOString(), ended_at: new Date(s.getTime() + m * 60000).toISOString() });
    if (saved) setAdding(false);
    undoable(saved, 'Sleep added ✓');
  };
  const todayMin = sleeps.events
    .filter(e => e.ended_at && isToday(parseISO(e.ended_at)))
    .reduce((sum, e) => sum + differenceInMinutes(parseISO(e.ended_at as string), parseISO(e.occurred_at)), 0);
  return (
    <div className="space-y-4">
      {sleeps.error && <p className="text-xs text-destructive">{sleeps.error}</p>}
      <div className="grid grid-cols-2 gap-2 text-center">
        <Stat label="Sleep today" value={fmtMin(todayMin)} />
        <Stat label="Naps today" value={String(sleeps.events.filter(e => e.ended_at && isToday(parseISO(e.ended_at))).length)} />
      </div>
      {start !== null ? (
        <RunningTimer id="sleep-timer-start" title="Sleeping" start={start} onStart={setStart}
          onSave={() => { void end(); }} saveLabel="Woke up — save sleep"
          onDiscard={() => { setStart(null); show('Timer discarded.'); }} />
      ) : adding ? (
        <div className="rounded-2xl border border-foreground/20 bg-card p-4 space-y-4" aria-label="Add a sleep" data-hide-install-banner>
          <p className="font-display text-lg">Add an earlier sleep</p>
          <div className="space-y-1.5">
            <Label htmlFor="sleep-from" className="text-sm">Fell asleep at</Label>
            <Input id="sleep-from" type="datetime-local" value={from} max={nowLocal()} onChange={e => setFrom(e.target.value)} className="h-11 text-base" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sleep-min" className="text-sm">Slept for (minutes)</Label>
            <Input id="sleep-min" inputMode="numeric" value={mins} onChange={e => setMins(e.target.value)} className="h-11 text-base" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="lg" onClick={() => setAdding(false)}>Cancel</Button>
            <Button size="lg" onClick={savePast}>Save sleep</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Button size="lg" onClick={begin} className="w-full h-14 text-base gap-2"><Moon className="h-5 w-5" /> Fell asleep now</Button>
          <Button variant="outline" onClick={() => {
            // Default: the length of her last sleep, ending now.
            const m = lastMin ?? 60;
            setMins(String(m)); setFrom(toLocalInput(Date.now() - m * 60000)); setAdding(true);
          }} className="w-full gap-1.5"><Plus className="h-4 w-4" /> Add an earlier sleep</Button>
          <p className="text-[11px] text-muted-foreground text-center">The timer keeps running if you close the app.</p>
        </div>
      )}
      {notice}
      <EntryList events={sleeps.events.slice(0, 20)} onRemove={sleeps.remove} onRetime={(e, iso) => sleeps.update(e.id, retimed(e, iso))} render={e => (
        <>{e.ended_at ? `Slept ${fmtMin(differenceInMinutes(parseISO(e.ended_at), parseISO(e.occurred_at)))}` : 'Sleep'}</>
      )} />
    </div>
  );
}

function NappyTab({ babyId }: { babyId: string }) {
  const nappies = useLifeEvents<NappyData>('nappy', { babyId, limit: 100 });
  const today = nappies.events.filter(e => isToday(parseISO(e.occurred_at)));
  const wet = today.filter(e => e.data?.type !== 'dirty').length;
  const dirty = today.filter(e => e.data?.type !== 'wet').length;
  const label = { wet: 'Wet', dirty: 'Dirty', both: 'Wet + dirty' } as const;
  const lastType = nappies.events[0]?.data?.type;
  const [notice, show] = useUndoNotice();
  const log = async (type: NappyData['type']) => {
    const saved = await nappies.add({ occurred_at: new Date().toISOString(), data: { type } });
    if (saved) show(`${type === 'both' ? 'Nappy' : `${label[type]} nappy`} added ✓`, () => nappies.remove(saved.id));
  };
  return (
    <div className="space-y-3">
      {nappies.error && <p className="text-xs text-destructive">{nappies.error}</p>}
      <div className="grid grid-cols-2 gap-2 text-center">
        <Stat label="Wet today" value={String(wet)} />
        <Stat label="Dirty today" value={String(dirty)} />
      </div>
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Tap to add a nappy changed now:</p>
        <div className="grid grid-cols-3 gap-2">
          {(['wet', 'dirty', 'both'] as const).map(t => (
            <Button key={t} variant="outline" className="h-12 text-base flex-col gap-0 leading-tight" onClick={() => { void log(t); }}
              aria-label={`+ ${t === 'both' ? 'Both' : label[t]}${lastType === t ? ' (last time)' : ''}`}>
              <span>+ {t === 'both' ? 'Both' : label[t]}</span>
              {lastType === t && <span className="text-[10px] font-normal text-muted-foreground">last time</span>}
            </Button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">Changed it earlier? Tap the time in the list to change it.</p>
      </div>
      {notice}
      <EntryList events={nappies.events.slice(0, 10)} onRemove={nappies.remove} onRetime={(e, iso) => nappies.update(e.id, retimed(e, iso))} render={e => <>{label[e.data?.type ?? 'wet']}</>} />
      <p className="text-[10px] text-muted-foreground">From about day 5, around 6 or more wet nappies a day is a common sign of enough milk. Ask your midwife if you’re worried.</p>
    </div>
  );
}

function GrowthTab({ baby, onBabyChange }: { baby: BabyRow; onBabyChange: (patch: Partial<BabyRow>) => Promise<boolean> }) {
  const babyId = baby.id;
  const growth = useLifeEvents<GrowthData>('baby_growth', { babyId, limit: 100 });
  // One record per measurement (weight, length and head together), as before.
  // The list of measurements, each with its WHO percentile, is drawn by
  // BabyGrowthChart (lazy, with the WHO tables).
  const saveMeasurement = async (m: { measuredOn: string; weightG: number | null; lengthCm: number | null; headCm: number | null; source: 'typed' | 'photo' }) =>
    growth.add({ occurred_at: new Date(`${m.measuredOn}T12:00:00`).toISOString(), data: { weight_g: m.weightG, length_cm: m.lengthCm, head_cm: m.headCm, source: m.source } });
  return (
    <div className="space-y-3">
      {growth.error && <p className="text-xs text-destructive">{growth.error}</p>}
      <Suspense fallback={<p className="text-xs text-muted-foreground">Loading the chart…</p>}>
        <BabyGrowthChart babyName={baby.name} birthDate={baby.birth_date} sex={baby.sex} events={growth.events}
          onSaveMeasurement={async m => !!(await saveMeasurement(m))}
          onSetSex={sex => onBabyChange({ sex })} onSetBirthDate={birth_date => onBabyChange({ birth_date })}
          onRemove={growth.remove} />
      </Suspense>
    </div>
  );
}

const todayYmd = () => format(new Date(), 'yyyy-MM-dd');
const fmtDay = (ymd: string) => format(parseISO(ymd), DATE_FMT);

/** Inline "Date given" + Save for one dose or a whole visit. */
function MarkDoneRow({ id, label, minDate, onSave, onCancel }: {
  id: string; label: string; minDate: string | null; onSave: (on: string) => Promise<void>; onCancel: () => void;
}) {
  const [on, setOn] = useState(todayYmd);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!on || on > todayYmd() || (minDate && on < minDate)) { setError(true); return; }
    setBusy(true);
    await onSave(on);
    setBusy(false);
  };
  return (
    <div className="space-y-1.5 py-1.5" data-testid="vax-mark-row">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <div className="flex flex-wrap gap-2">
        <Input id={id} type="date" value={on} max={todayYmd()} min={minDate ?? undefined} onChange={e => { setOn(e.target.value); setError(false); }} className="h-10 text-base flex-1 min-w-[10rem]" />
        <Button size="sm" className="h-10" disabled={busy} onClick={() => { void save(); }}>Save</Button>
        <Button size="sm" variant="ghost" className="h-10" onClick={onCancel}>Cancel</Button>
      </div>
      {error && <p className="text-xs text-destructive">Choose a date between the birth and today.</p>}
    </div>
  );
}

const CLOSED_TEXT = (d: PlannedDose) => (d.vaccine === 'rsv'
  ? 'Only given before the first birthday.'
  : d.id === 'rota-1' ? 'Only started up to 15 weeks 6 days of age.' : d.id === 'rota-2' ? 'Not given from 24 weeks of age.' : 'No longer given at this age.');

function VaccineVisit({ v, birthDate, marking, setMarking, onMark, onUnmark }: {
  v: PlannedVisit; birthDate: string | null; marking: string | null; setMarking: (k: string | null) => void;
  onMark: (doses: PlannedDose[], on: string) => Promise<void>; onUnmark: (d: PlannedDose) => void;
}) {
  const open = v.doses.filter(d => d.status !== 'done' && d.status !== 'closed');
  const visitKey = `visit:${v.key}`;
  return (
    <li className="py-2.5" data-testid={`vax-visit-${v.key}`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{v.age}</p>
        {v.due && open.length > 0 && <p className="text-[11px] text-muted-foreground tabular-nums">from {format(v.due, DATE_FMT)}</p>}
      </div>
      {v.key === 'rsv' && open.length > 0 && <p className="text-[11px] text-muted-foreground">{rsvTiming(birthDate)}</p>}
      <ul>
        {v.doses.map(d => {
          const info = BAG_BABY_VACCINES[d.vaccine];
          return (
            <li key={d.id} className="py-1.5" data-testid={`vax-dose-${d.id}`}>
              <div className="flex items-center gap-2 text-sm">
                {d.status === 'done' ? <Check className="h-4 w-4 text-primary flex-shrink-0" aria-hidden /> : <span className="w-4 flex-shrink-0" />}
                <span className="flex-1 min-w-0">
                  <span className={d.status === 'closed' ? 'text-muted-foreground' : undefined}>{d.name}</span>
                  {info.category === 'complementary' && <span className="ml-1.5 text-[10px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground align-middle">extra</span>}
                  <span className="block text-[11px] text-muted-foreground">
                    {d.status === 'done' && d.doneOn ? `Done ${fmtDay(d.doneOn)}`
                      : d.status === 'closed' ? CLOSED_TEXT(d)
                      : [d.dose === 1 ? `Protects against ${info.against}.` : '', d.note ?? ''].filter(Boolean).join(' ')}
                  </span>
                </span>
                {d.status === 'done' ? (
                  <button type="button" onClick={() => onUnmark(d)} aria-label={`Remove done mark, ${d.name}`} className="-m-2.5 p-2.5 text-muted-foreground/60 hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : d.status !== 'closed' && marking !== d.id ? (
                  <Button size="sm" variant="outline" className="h-8 flex-shrink-0" aria-label={`Mark done, ${d.name}`} onClick={() => setMarking(d.id)}>Mark done</Button>
                ) : null}
              </div>
              {marking === d.id && (
                <MarkDoneRow id={`vd-${d.id}`} label={`Date given: ${d.name}`} minDate={birthDate}
                  onSave={on => onMark([d], on)} onCancel={() => setMarking(null)} />
              )}
            </li>
          );
        })}
      </ul>
      {open.length > 1 && (v.status === 'due' || v.status === 'soon') && (marking === visitKey ? (
        <MarkDoneRow id={`vd-${v.key}`} label={`Date given: all ${open.length} at ${v.age}`} minDate={birthDate}
          onSave={on => onMark(open, on)} onCancel={() => setMarking(null)} />
      ) : (
        <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setMarking(visitKey)}>Mark all {open.length} done</Button>
      ))}
    </li>
  );
}

function VaccineTab({ baby, onBabyChange }: { baby: BabyRow; onBabyChange: (patch: Partial<BabyRow>) => Promise<boolean> }) {
  const vax = useLifeEvents<VaccineData>('baby_vaccine', { babyId: baby.id, limit: 200 });
  const marks = useMemo(() => vaccineMarksFrom(vax.events), [vax.events]);
  const plan = useMemo(() => babyVaccinePlan(baby.birth_date, marks), [baby.birth_date, marks]);
  const markIds = new Set(marks.map(m => m.id));
  const other = vax.events.filter(e => !markIds.has(e.id));
  const [marking, setMarking] = useState<string | null>(null);
  const [notice, show] = useUndoNotice();
  const [birth, setBirth] = useState('');
  const [birthError, setBirthError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [date, setDate] = useState(todayYmd);

  const onMark = async (doses: PlannedDose[], on: string) => {
    const saved: string[] = [];
    for (const d of doses) {
      const s = await vax.add({ occurred_at: new Date(`${on}T12:00:00`).toISOString(), data: { name: d.name, dose: d.id } });
      if (s) saved.push(s.id);
    }
    setMarking(null);
    if (saved.length) show(saved.length === 1 ? 'Marked done ✓' : `${saved.length} marked done ✓`, async () => { for (const id of saved) await vax.remove(id); });
  };
  const onUnmark = (d: PlannedDose) => { if (d.markId) void vax.remove(d.markId); };
  const saveOther = async () => {
    if (!name.trim()) return;
    const ok = await vax.add({ occurred_at: new Date(`${date}T12:00:00`).toISOString(), data: { name: name.trim() } });
    if (ok) { setName(''); setAdding(false); }
  };
  const saveBirth = async () => {
    if (!birth || birth > todayYmd()) { setBirthError('Enter the birth date.'); return; }
    if (!(await onBabyChange({ birth_date: birth }))) setBirthError('Could not save. Try again.');
  };

  const dueNow = plan.filter(v => v.status === 'due' || v.status === 'soon');
  const later = plan.filter(v => v.status === 'later');
  const done = plan.filter(v => v.status === 'done' || v.status === 'closed');
  const doses = plan.flatMap(v => v.doses);
  const doneCount = doses.filter(d => d.status === 'done').length;
  const section = (title: string, visits: PlannedVisit[], testId: string, empty?: string) => (
    <section className="border-t pt-3" data-testid={testId}>
      <p className="label-mono">{title}</p>
      {visits.length === 0 ? <p className="text-sm text-muted-foreground py-2">{empty}</p> : (
        <ul className="divide-y">
          {visits.map(v => <VaccineVisit key={v.key} v={v} birthDate={baby.birth_date} marking={marking} setMarking={setMarking} onMark={onMark} onUnmark={onUnmark} />)}
        </ul>
      )}
    </section>
  );

  return (
    <div className="space-y-3">
      {vax.error && <p className="text-xs text-destructive">{vax.error}</p>}
      <div className="space-y-1">
        <h4 className="font-semibold text-sm">Swiss vaccination schedule</h4>
        <p className="text-[11px] text-muted-foreground">Birth to 18 months, as recommended by the BAG. Tap Mark done after each visit.</p>
      </div>
      {!baby.birth_date ? (
        <div className="rounded-lg bg-muted/50 p-3 space-y-2" data-testid="vax-birth-picker">
          <p className="text-sm">Add {baby.name}’s birth date to see when each vaccination is due.</p>
          <div className="flex items-end gap-2">
            <div className="flex-1"><Label htmlFor="vax-birth" className="text-xs">Birth date</Label><Input id="vax-birth" type="date" max={todayYmd()} value={birth} onChange={e => { setBirth(e.target.value); setBirthError(null); }} /></div>
            <Button size="sm" onClick={() => { void saveBirth(); }}>Save</Button>
          </div>
          {birthError && <p className="text-xs text-destructive">{birthError}</p>}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 text-center">
          <Stat label="Marked done" value={`${doneCount} of ${doses.length}`} />
          <Stat label="Due now or soon" value={String(dueNow.reduce((n, v) => n + v.doses.filter(d => d.status === 'due' || d.status === 'soon').length, 0))} />
        </div>
      )}
      {notice}
      {baby.birth_date && section('Due now or soon', dueNow, 'vax-due', 'Nothing due in the next 30 days.')}
      {section(baby.birth_date ? 'Later' : 'By age', later, 'vax-later', 'Nothing later in the schedule.')}
      {done.length > 0 && section('Done', done, 'vax-done')}

      <section className="border-t pt-3 space-y-2" data-testid="vax-other">
        <p className="label-mono">Other vaccinations</p>
        <EntryList events={other} onRemove={vax.remove} dateOnly render={e => <>{e.data?.name}</>} />
        {adding ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div><Label htmlFor="v-name" className="text-xs">Vaccine</Label><Input id="v-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. flu" /></div>
              <div><Label htmlFor="v-date" className="text-xs">Date</Label><Input id="v-date" type="date" max={todayYmd()} value={date} onChange={e => setDate(e.target.value)} /></div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => { void saveOther(); }} disabled={!name.trim()}>Add</Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add another vaccination</Button>
        )}
      </section>

      <div className="space-y-1 text-[11px] text-muted-foreground" data-testid="vax-source">
        <p>“extra” = a complementary vaccination: recommended mainly for your baby’s own protection. The others are recommended for all babies.</p>
        <p>Dates are a guide. Ask your paediatrician what your baby needs and when, for example after a premature birth or to catch up a missed dose.</p>
        <p><a href={BAG_SCHEDULE_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{BAG_SCHEDULE_SOURCE}</a> (Schweizerischer Impfplan).</p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/50 rounded-lg p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="font-semibold text-sm">{value}</div>
    </div>
  );
}

function dayHeading(iso: string) {
  const d = parseISO(iso);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, WEEKDAY_DAY_MONTH_FMT);
}

/** Inline "change the time" row for one entry. */
function RetimeRow({ e, onSave, onCancel }: { e: LifeEvent<unknown>; onSave: (iso: string) => Promise<unknown>; onCancel: () => void }) {
  const [value, setValue] = useState(() => toLocalInput(Date.parse(e.occurred_at)));
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const t = new Date(value).getTime();
    if (Number.isNaN(t) || t > Date.now() + 60_000) { setError(true); return; }
    setBusy(true);
    const ok = await onSave(new Date(t).toISOString());
    setBusy(false);
    if (ok) onCancel(); else setError(true);
  };
  const id = `retime-${e.id}`;
  return (
    <li className="py-2.5 space-y-1.5" data-testid="retime-row">
      <Label htmlFor={id} className="text-xs">{e.ended_at ? 'Started at' : 'Time'}</Label>
      <div className="flex flex-wrap gap-2">
        <Input id={id} type="datetime-local" value={value} max={nowLocal()} onChange={ev => { setValue(ev.target.value); setError(false); }} className="h-10 text-base flex-1 min-w-[12rem]" />
        <Button size="sm" className="h-10" disabled={busy} onClick={() => { void save(); }}>Save time</Button>
        <Button size="sm" variant="ghost" className="h-10" onClick={onCancel}>Cancel</Button>
      </div>
      {error && <p className="text-xs text-destructive">Choose a time up to now.</p>}
    </li>
  );
}

function EntryList<D>({ events, onRemove, render, dateOnly, onRetime }: {
  events: LifeEvent<D>[]; onRemove: (id: string) => unknown; render: (e: LifeEvent<D>) => React.ReactNode; dateOnly?: boolean;
  /** Change an entry's time (tap the time). Omitted = the time is plain text. */
  onRetime?: (e: LifeEvent<D>, iso: string) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  if (events.length === 0) return null;
  if (dateOnly) {
    return (
      <ul className="divide-y border-t">
        {events.map(e => (
          <li key={e.id} className="flex items-center gap-3 py-2.5 text-sm">
            <span className="text-muted-foreground tabular-nums w-28 flex-shrink-0">{format(parseISO(e.occurred_at), DATE_FMT)}</span>
            <span className="flex-1">{render(e)}</span>
            <Remove onClick={() => { void onRemove(e.id); }} />
          </li>
        ))}
      </ul>
    );
  }
  // Grouped by day: Today / Yesterday / date, newest first (re-sorted, so
  // an entry whose time she changed moves to its place).
  const sorted = [...events].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const groups: { label: string; items: LifeEvent<D>[] }[] = [];
  for (const e of sorted) {
    const label = dayHeading(e.occurred_at);
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.items.push(e); else groups.push({ label, items: [e] });
  }
  return (
    <div className="space-y-3 border-t pt-3">
      {groups.map(g => (
        <section key={g.label}>
          <p className="label-mono mb-1">{g.label}</p>
          <ul className="divide-y">
            {g.items.map(e => (editing === e.id && onRetime ? (
              <RetimeRow key={e.id} e={e as LifeEvent<unknown>} onSave={iso => onRetime(e, iso)} onCancel={() => setEditing(null)} />
            ) : (
              <li key={e.id} className="flex items-center gap-3 py-2.5 text-sm">
                {onRetime ? (
                  <button type="button" onClick={() => setEditing(e.id)} aria-label={`Change time, ${formatTime(e.occurred_at)}`}
                    className="tabular-nums w-12 flex-shrink-0 font-medium text-left underline decoration-dotted underline-offset-4 -my-2 py-2">
                    {formatTime(e.occurred_at)}
                  </button>
                ) : (
                  <span className="tabular-nums w-12 flex-shrink-0 font-medium">{formatTime(e.occurred_at)}</span>
                )}
                <span className="flex-1">{render(e)}</span>
                <Remove onClick={() => { void onRemove(e.id); }} />
              </li>
            )))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default function BabyTracker({ initialTab = 'feed', openAdd = false }: { initialTab?: string; openAdd?: boolean }) {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const [babies, setBabies] = useState<BabyRow[]>([]);
  const [babyId, setBabyId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(initialTab);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data, error: err } = await db.from('babies').select('*').eq('user_id', userId).order('created_at', { ascending: true });
    if (err) setError('Could not load your baby’s profile.');
    const rows = (data ?? []) as BabyRow[];
    setBabies(rows);
    setBabyId(prev => prev && rows.some(b => b.id === prev) ? prev : rows[0]?.id ?? null);
    setLoaded(true);
  }, [userId]);
  useEffect(() => { void load(); }, [load]);

  const addBaby = async () => {
    const name = newName.trim() || 'Baby';
    const { data, error: err } = await db.from('babies').insert({ user_id: userId, name, birth_date: newDate || null }).select('*');
    if (err) { setError('Could not save. Try again.'); return; }
    const row = (Array.isArray(data) ? data[0] : data) as BabyRow;
    setBabies(prev => [...prev, row]); setBabyId(row.id); setNewName(''); setNewDate(''); setError(null);
  };

  const baby = useMemo(() => babies.find(b => b.id === babyId) ?? null, [babies, babyId]);
  const updateBaby = async (patch: Partial<BabyRow>): Promise<boolean> => {
    if (!baby) return false;
    const { error: err } = await db.from('babies').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', baby.id).eq('user_id', userId);
    if (err) return false;
    setBabies(prev => prev.map(b => (b.id === baby.id ? { ...b, ...patch } : b)));
    return true;
  };
  const ageText = baby?.birth_date ? (() => {
    const days = Math.floor((Date.now() - new Date(`${baby.birth_date}T00:00:00`).getTime()) / 86400000);
    if (days < 0) return null;
    if (days < 14) return `${days} day${days === 1 ? '' : 's'} old`;
    if (days < 120) return `${Math.floor(days / 7)} weeks old`;
    return `${Math.floor(days / 30.4)} months old`;
  })() : null;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold flex items-center gap-2">
          <Baby className="h-4 w-4 text-primary" />
          {baby ? baby.name : 'Baby tracker'}
          {ageText && <Badge variant="outline" className="text-[10px] font-normal">{ageText}</Badge>}
        </h3>
        {babies.length > 1 && (
          <div className="flex gap-1">
            {babies.map(b => (
              <Button key={b.id} size="sm" variant={b.id === babyId ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setBabyId(b.id)}>{b.name}</Button>
            ))}
          </div>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}

      {loaded && !baby && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Add your baby to start logging feeds, sleep, nappies and growth.</p>
          <div className="grid grid-cols-2 gap-2">
            <div><Label htmlFor="b-name" className="text-xs">Name</Label><Input id="b-name" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Baby" /></div>
            <div><Label htmlFor="b-date" className="text-xs">Birth date</Label><Input id="b-date" type="date" value={newDate} onChange={e => setNewDate(e.target.value)} /></div>
          </div>
          <Button size="sm" onClick={addBaby}>Add baby</Button>
        </div>
      )}

      {baby && (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-6 w-full h-auto">
            <TabsTrigger value="feed" className="text-[11px] px-1 flex-col gap-0.5 py-1.5"><Milk className="h-3.5 w-3.5" />Feed</TabsTrigger>
            <TabsTrigger value="sleep" className="text-[11px] px-1 flex-col gap-0.5 py-1.5"><Moon className="h-3.5 w-3.5" />Sleep</TabsTrigger>
            <TabsTrigger value="nappy" className="text-[11px] px-1 flex-col gap-0.5 py-1.5"><Droplets className="h-3.5 w-3.5" />Nappy</TabsTrigger>
            <TabsTrigger value="growth" className="text-[11px] px-1 flex-col gap-0.5 py-1.5"><Ruler className="h-3.5 w-3.5" />Growth</TabsTrigger>
            <TabsTrigger value="vax" className="text-[11px] px-1 flex-col gap-0.5 py-1.5"><Syringe className="h-3.5 w-3.5" />Vaccines</TabsTrigger>
            <TabsTrigger value="stats" className="text-[11px] px-1 flex-col gap-0.5 py-1.5"><BarChart3 className="h-3.5 w-3.5" />Stats</TabsTrigger>
          </TabsList>
          <TabsContent value="feed" className="pt-3"><FeedTab babyId={baby.id} openAdd={openAdd} /></TabsContent>
          <TabsContent value="sleep" className="pt-3"><SleepTab babyId={baby.id} /></TabsContent>
          <TabsContent value="nappy" className="pt-3"><NappyTab babyId={baby.id} /></TabsContent>
          <TabsContent value="growth" className="pt-3"><GrowthTab baby={baby} onBabyChange={updateBaby} /></TabsContent>
          <TabsContent value="vax" className="pt-3"><VaccineTab baby={baby} onBabyChange={updateBaby} /></TabsContent>
          <TabsContent value="stats" className="pt-3"><Suspense fallback={null}><BabyStatsTab babyId={baby.id} onGoTo={setTab} /></Suspense></TabsContent>
        </Tabs>
      )}
    </Card>
  );
}
