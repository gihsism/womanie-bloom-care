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
import { Baby, Milk, Moon, Droplets, Ruler, Syringe, Trash2, Play, Square, BarChart3, Plus, Timer } from 'lucide-react';
// Stats tab draws charts (recharts, ~110 KB gzip): load it when opened.
const BabyStatsTab = lazy(() => import('./BabyStatsTab'));
// WHO weight chart + "Add a weight" (recharts, WHO table): loaded with the Growth tab.
const BabyGrowthChart = lazy(() => import('./BabyGrowthChart'));
import { differenceInMinutes, format, isToday, isYesterday, parseISO } from 'date-fns';

// Baby tracker: feeds, sleep, nappies, growth and vaccinations, per baby
// (table babies; entries are life_events tagged with baby_id).
// Replaces the device-only PostpartumFeedingTracker; its feeds are moved
// into the account (onto the first baby) once.

interface BabyRow { id: string; name: string; birth_date: string | null; sex: string | null }
type FeedMethod = 'breast_l' | 'breast_r' | 'bottle';
interface FeedData { method: FeedMethod; ml?: number | null; milk?: 'breast_milk' | 'formula' | null }
interface NappyData { type: 'wet' | 'dirty' | 'both' }
interface GrowthData { weight_g?: number | null; length_cm?: number | null; head_cm?: number | null; source?: 'typed' | 'photo' }
interface VaccineData { name: string }

const OLD_FEEDS_KEY = (userId: string) => `postpartum:${userId}:feeds`;
const SLEEP_ACTIVE_KEY = (babyId: string) => `womanie_baby_sleep_active_${babyId}`;
const FEED_ACTIVE_KEY = (babyId: string) => `womanie_baby_feed_active_${babyId}`;

const METHOD_LABEL: Record<FeedMethod, string> = { breast_l: 'Left breast', breast_r: 'Right breast', bottle: 'Bottle' };
const COMMON_VACCINES = ['Hepatitis B', 'Vitamin K', 'BCG', '6-in-1 (DTaP/IPV/Hib/HepB)', 'Pneumococcal', 'Rotavirus', 'MenB', 'MMR'];

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

function Saved({ text }: { text: string | null }) {
  if (!text) return null;
  return <p role="status" className="text-sm text-primary text-center">{text}</p>;
}

function useFlash() {
  const [msg, setMsg] = useState<string | null>(null);
  const flash = (m: string) => { setMsg(m); window.setTimeout(() => setMsg(null), 2500); };
  return [msg, flash] as const;
}

function FeedTab({ babyId, openAdd = false }: { babyId: string; openAdd?: boolean }) {
  const feeds = useLifeEvents<FeedData>('feed', {
    babyId, limit: 200,
    beforeLoad: (id) => importLocalOnce<{ at: string; method: FeedMethod }, FeedData>(id, OLD_FEEDS_KEY(id), 'feed', f =>
      f?.at ? { occurred_at: f.at, baby_id: babyId, data: { method: f.method } } : null),
  });
  const [active, setActive] = useState<{ side: FeedMethod; start: number } | null>(() => {
    try { const raw = localStorage.getItem(FEED_ACTIVE_KEY(babyId)); return raw ? JSON.parse(raw) : null; } catch { return null; }
  });
  const now = useTick(!!active);
  const [saved, flash] = useFlash();

  // "Add a feed" form — for a feed that already happened (or one you
  // don't want to time). Opens straight away from Home's "+ Feed".
  const [adding, setAdding] = useState(openAdd);
  const lastSide = feeds.events.find(f => f.data?.method !== 'bottle')?.data?.method;
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

  const openForm = () => { setAt(nowLocal()); setAdding(true); };

  const saveFeed = async () => {
    const start = new Date(at);
    if (Number.isNaN(start.getTime())) return;
    setBusy(true);
    try {
      if (method === 'bottle') {
        const n = parseInt(ml, 10);
        await feeds.add({ occurred_at: start.toISOString(), data: { method: 'bottle', ml: Number.isFinite(n) ? n : null, milk } });
      } else {
        const m = parseInt(minutes, 10);
        const ended = Number.isFinite(m) && m > 0 ? new Date(start.getTime() + m * 60000).toISOString() : undefined;
        await feeds.add({ occurred_at: start.toISOString(), ...(ended ? { ended_at: ended } : {}), data: { method } });
      }
      setAdding(false); setMl('');
      flash('Feed added ✓');
    } finally { setBusy(false); }
  };

  const startBreast = (side: FeedMethod) => {
    const a = { side, start: Date.now() };
    setActive(a);
    try { localStorage.setItem(FEED_ACTIVE_KEY(babyId), JSON.stringify(a)); } catch { /* ignore */ }
  };
  const stopBreast = async () => {
    if (!active) return;
    const a = active;
    setActive(null);
    try { localStorage.removeItem(FEED_ACTIVE_KEY(babyId)); } catch { /* ignore */ }
    await feeds.add({ occurred_at: new Date(a.start).toISOString(), ended_at: new Date().toISOString(), data: { method: a.side } });
    flash('Feed saved ✓');
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
        <div className="rounded-2xl bg-primary/10 border border-primary/30 p-4 text-center space-y-2">
          <div className="text-sm text-primary">{METHOD_LABEL[active.side]} · feeding now</div>
          <div className="font-display text-4xl tabular-nums">{fmtMin((now - active.start) / 60000)}</div>
          <Button size="lg" onClick={stopBreast} className="gap-2 w-full"><Square className="h-4 w-4" /> Finished — save feed</Button>
        </div>
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
          <Button size="lg" className="w-full h-14 text-base gap-2" onClick={openForm}>
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
          </div>
        </div>
      )}
      <Saved text={saved} />

      <EntryList events={feeds.events.slice(0, 30)} onRemove={feeds.remove} render={f => (
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
  const [start, setStart] = useState<number | null>(() => readActive(SLEEP_ACTIVE_KEY(babyId)));
  const now = useTick(start !== null);
  const [saved, flash] = useFlash();
  const [adding, setAdding] = useState(false);
  const [from, setFrom] = useState(nowLocal);
  const [mins, setMins] = useState('60');
  const begin = () => { const t = Date.now(); setStart(t); writeActive(SLEEP_ACTIVE_KEY(babyId), t); };
  const end = async () => {
    if (start === null) return;
    const s = start; setStart(null); writeActive(SLEEP_ACTIVE_KEY(babyId), null);
    await sleeps.add({ occurred_at: new Date(s).toISOString(), ended_at: new Date().toISOString() });
    flash('Sleep saved ✓');
  };
  const savePast = async () => {
    const s = new Date(from); const m = parseInt(mins, 10);
    if (Number.isNaN(s.getTime()) || !Number.isFinite(m) || m <= 0) return;
    await sleeps.add({ occurred_at: s.toISOString(), ended_at: new Date(s.getTime() + m * 60000).toISOString() });
    setAdding(false); flash('Sleep added ✓');
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
        <div className="rounded-2xl bg-primary/10 border border-primary/30 p-4 text-center space-y-2">
          <div className="text-sm text-primary">Sleeping</div>
          <div className="font-display text-4xl tabular-nums">{fmtMin((now - start) / 60000)}</div>
          <Button size="lg" onClick={end} className="gap-2 w-full"><Square className="h-4 w-4" /> Woke up — save sleep</Button>
        </div>
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
          <Button variant="outline" onClick={() => { setFrom(nowLocal()); setAdding(true); }} className="w-full gap-1.5"><Plus className="h-4 w-4" /> Add an earlier sleep</Button>
        </div>
      )}
      <Saved text={saved} />
      <EntryList events={sleeps.events.slice(0, 20)} onRemove={sleeps.remove} render={e => (
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
  const log = (type: NappyData['type']) => nappies.add({ occurred_at: new Date().toISOString(), data: { type } });
  const label = { wet: 'Wet', dirty: 'Dirty', both: 'Wet + dirty' } as const;
  const [saved, flash] = useFlash();
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
          <Button variant="outline" className="h-12 text-base" onClick={() => { void log('wet'); flash('Wet nappy added ✓'); }}>+ Wet</Button>
          <Button variant="outline" className="h-12 text-base" onClick={() => { void log('dirty'); flash('Dirty nappy added ✓'); }}>+ Dirty</Button>
          <Button variant="outline" className="h-12 text-base" onClick={() => { void log('both'); flash('Nappy added ✓'); }}>+ Both</Button>
        </div>
      </div>
      <Saved text={saved} />
      <EntryList events={nappies.events.slice(0, 10)} onRemove={nappies.remove} render={e => <>{label[e.data?.type ?? 'wet']}</>} />
      <p className="text-[10px] text-muted-foreground">From about day 5, around 6 or more wet nappies a day is a common sign of enough milk. Ask your midwife if you’re worried.</p>
    </div>
  );
}

function GrowthTab({ baby, onBabyChange }: { baby: BabyRow; onBabyChange: (patch: Partial<BabyRow>) => Promise<boolean> }) {
  const babyId = baby.id;
  const growth = useLifeEvents<GrowthData>('baby_growth', { babyId, limit: 100 });
  const saveWeight = async (w: { measuredOn: string; weightG: number; source: 'typed' | 'photo' }) =>
    growth.add({ occurred_at: new Date(`${w.measuredOn}T12:00:00`).toISOString(), data: { weight_g: w.weightG, length_cm: null, head_cm: null, source: w.source } });
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [w, setW] = useState(''); const [l, setL] = useState(''); const [h, setH] = useState('');
  const num = (v: string) => { const n = parseFloat(v.replace(',', '.')); return Number.isFinite(n) ? n : null; };
  const save = async () => {
    const data = { weight_g: num(w) !== null ? Math.round(num(w) as number) : null, length_cm: num(l), head_cm: num(h) };
    if (data.weight_g === null && data.length_cm === null && data.head_cm === null) return;
    const ok = await growth.add({ occurred_at: new Date(`${date}T12:00:00`).toISOString(), data });
    if (ok) { setW(''); setL(''); setH(''); }
  };
  return (
    <div className="space-y-3">
      {growth.error && <p className="text-xs text-destructive">{growth.error}</p>}
      <Suspense fallback={<p className="text-xs text-muted-foreground">Loading the chart…</p>}>
        <BabyGrowthChart babyName={baby.name} birthDate={baby.birth_date} sex={baby.sex} events={growth.events}
          onSaveWeight={async w => !!(await saveWeight(w))}
          onSetSex={sex => onBabyChange({ sex })} onSetBirthDate={birth_date => onBabyChange({ birth_date })} />
      </Suspense>
      <p className="label-mono border-t pt-3">Weight, length and head</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div><Label htmlFor="g-date" className="text-xs">Date</Label><Input id="g-date" type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
        <div><Label htmlFor="g-w" className="text-xs">Weight (g)</Label><Input id="g-w" inputMode="numeric" value={w} onChange={e => setW(e.target.value)} placeholder="4200" /></div>
        <div><Label htmlFor="g-l" className="text-xs">Length (cm)</Label><Input id="g-l" inputMode="decimal" value={l} onChange={e => setL(e.target.value)} placeholder="54" /></div>
        <div><Label htmlFor="g-h" className="text-xs">Head (cm)</Label><Input id="g-h" inputMode="decimal" value={h} onChange={e => setH(e.target.value)} placeholder="37" /></div>
      </div>
      <Button size="sm" onClick={save}>Save measurement</Button>
      <EntryList events={growth.events} onRemove={growth.remove} dateOnly render={e => (
        <>
          {[e.data?.weight_g ? `${(Number(e.data.weight_g) / 1000).toFixed(2)} kg` : null,
            e.data?.length_cm ? `${e.data.length_cm} cm long` : null,
            e.data?.head_cm ? `head ${e.data.head_cm} cm` : null].filter(Boolean).join(' · ')}
        </>
      )} />
    </div>
  );
}

function VaccineTab({ babyId }: { babyId: string }) {
  const vax = useLifeEvents<VaccineData>('baby_vaccine', { babyId, limit: 100 });
  const [name, setName] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const save = async () => {
    if (!name.trim()) return;
    const ok = await vax.add({ occurred_at: new Date(`${date}T12:00:00`).toISOString(), data: { name: name.trim() } });
    if (ok) setName('');
  };
  return (
    <div className="space-y-3">
      {vax.error && <p className="text-xs text-destructive">{vax.error}</p>}
      <div className="flex flex-wrap gap-1">
        {COMMON_VACCINES.map(v => (
          <button key={v} type="button" onClick={() => setName(v)}
            className={`text-xs px-2.5 py-1.5 rounded-full ${name === v ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70'}`}>{v}</button>
        ))}
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1"><Label htmlFor="v-name" className="text-xs">Vaccine</Label><Input id="v-name" value={name} onChange={e => setName(e.target.value)} /></div>
        <div className="w-36"><Label htmlFor="v-date" className="text-xs">Date</Label><Input id="v-date" type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
        <Button size="sm" onClick={save} disabled={!name.trim()}>Add</Button>
      </div>
      <EntryList events={vax.events} onRemove={vax.remove} dateOnly render={e => <>{e.data?.name}</>} />
      <p className="text-[10px] text-muted-foreground">Vaccine schedules differ by country — follow your baby’s official health booklet.</p>
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

function EntryList<D>({ events, onRemove, render, dateOnly }: {
  events: LifeEvent<D>[]; onRemove: (id: string) => unknown; render: (e: LifeEvent<D>) => React.ReactNode; dateOnly?: boolean;
}) {
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
  // Grouped by day: Today / Yesterday / date, newest first.
  const groups: { label: string; items: LifeEvent<D>[] }[] = [];
  for (const e of events) {
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
            {g.items.map(e => (
              <li key={e.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="tabular-nums w-12 flex-shrink-0 font-medium">{formatTime(e.occurred_at)}</span>
                <span className="flex-1">{render(e)}</span>
                <Remove onClick={() => { void onRemove(e.id); }} />
              </li>
            ))}
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
          <TabsContent value="vax" className="pt-3"><VaccineTab babyId={baby.id} /></TabsContent>
          <TabsContent value="stats" className="pt-3"><Suspense fallback={null}><BabyStatsTab babyId={baby.id} onGoTo={setTab} /></Suspense></TabsContent>
        </Tabs>
      )}
    </Card>
  );
}
