import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLifeEvents, importLocalOnce, type LifeEvent } from '@/hooks/useLifeEvents';
import { Baby, Milk, Moon, Droplets, Ruler, Syringe, Trash2, Play, Square, BarChart3 } from 'lucide-react';
import BabyStatsTab from './BabyStatsTab';
import { differenceInMinutes, format, isToday, parseISO } from 'date-fns';

// Baby tracker: feeds, sleep, nappies, growth and vaccinations, per baby
// (table babies; entries are life_events tagged with baby_id).
// Replaces the device-only PostpartumFeedingTracker; its feeds are moved
// into the account (onto the first baby) once.

interface BabyRow { id: string; name: string; birth_date: string | null; sex: string | null }
type FeedMethod = 'breast_l' | 'breast_r' | 'bottle';
interface FeedData { method: FeedMethod; ml?: number | null; milk?: 'breast_milk' | 'formula' | null }
interface NappyData { type: 'wet' | 'dirty' | 'both' }
interface GrowthData { weight_g?: number | null; length_cm?: number | null; head_cm?: number | null }
interface VaccineData { name: string }

const OLD_FEEDS_KEY = (userId: string) => `postpartum:${userId}:feeds`;
const SLEEP_ACTIVE_KEY = (babyId: string) => `womanie_baby_sleep_active_${babyId}`;
const FEED_ACTIVE_KEY = (babyId: string) => `womanie_baby_feed_active_${babyId}`;

const METHOD_LABEL: Record<FeedMethod, string> = { breast_l: 'Left breast', breast_r: 'Right breast', bottle: 'Bottle' };
const COMMON_VACCINES = ['Hepatitis B', 'Vitamin K', 'BCG', '6-in-1 (DTaP/IPV/Hib/HepB)', 'Pneumococcal', 'Rotavirus', 'MenB', 'MMR'];

const fmtMin = (m: number | null) => {
  if (m === null || !Number.isFinite(m)) return '—';
  const h = Math.floor(m / 60); const min = Math.round(m % 60);
  return h === 0 ? `${min}m` : min === 0 ? `${h}h` : `${h}h ${min}m`;
};
const when = (iso: string) => isToday(parseISO(iso)) ? format(parseISO(iso), 'HH:mm') : format(parseISO(iso), 'MMM d, HH:mm');
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
    <button type="button" onClick={onClick} aria-label="Remove entry" className="text-muted-foreground/60 hover:text-destructive">
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

function FeedTab({ babyId }: { babyId: string }) {
  const feeds = useLifeEvents<FeedData>('feed', {
    babyId, limit: 200,
    beforeLoad: (id) => importLocalOnce<{ at: string; method: FeedMethod }, FeedData>(id, OLD_FEEDS_KEY(id), 'feed', f =>
      f?.at ? { occurred_at: f.at, baby_id: babyId, data: { method: f.method } } : null),
  });
  const [active, setActive] = useState<{ side: FeedMethod; start: number } | null>(() => {
    try { const raw = localStorage.getItem(FEED_ACTIVE_KEY(babyId)); return raw ? JSON.parse(raw) : null; } catch { return null; }
  });
  const [ml, setMl] = useState('');
  const [milk, setMilk] = useState<'breast_milk' | 'formula'>('formula');
  const now = useTick(!!active);

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
  };
  const logBottle = async () => {
    const n = parseInt(ml, 10);
    await feeds.add({ occurred_at: new Date().toISOString(), data: { method: 'bottle', ml: Number.isFinite(n) ? n : null, milk } });
    setMl('');
  };

  const today = feeds.events.filter(f => isToday(parseISO(f.occurred_at)));
  const mlToday = today.reduce((s, f) => s + (Number(f.data?.ml) || 0), 0);
  const sinceLast = feeds.events[0] ? differenceInMinutes(new Date(), parseISO(feeds.events[0].occurred_at)) : null;
  const lastSide = feeds.events.find(f => f.data?.method !== 'bottle')?.data?.method;

  return (
    <div className="space-y-3">
      {feeds.error && <p className="text-xs text-destructive">{feeds.error}</p>}
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Last feed" value={sinceLast === null ? '—' : `${fmtMin(sinceLast)} ago`} />
        <Stat label="Feeds today" value={String(today.length)} />
        <Stat label="Bottle today" value={mlToday ? `${mlToday} ml` : '—'} />
      </div>
      {active ? (
        <div className="rounded-xl bg-primary/10 border border-primary/30 p-3 text-center space-y-2">
          <div className="text-xs text-primary">{METHOD_LABEL[active.side]} · feeding</div>
          <div className="text-3xl font-bold tabular-nums">{fmtMin((now - active.start) / 60000)}</div>
          <Button onClick={stopBreast} className="gap-1"><Square className="h-4 w-4" /> Stop</Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => startBreast('breast_l')} className="gap-1">
            <Play className="h-3.5 w-3.5" /> Left{lastSide === 'breast_l' ? ' (last)' : ''}
          </Button>
          <Button variant="outline" onClick={() => startBreast('breast_r')} className="gap-1">
            <Play className="h-3.5 w-3.5" /> Right{lastSide === 'breast_r' ? ' (last)' : ''}
          </Button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <div className="w-24">
          <Label htmlFor="bottle-ml" className="text-xs">Bottle (ml)</Label>
          <Input id="bottle-ml" inputMode="numeric" value={ml} onChange={e => setMl(e.target.value)} placeholder="90" />
        </div>
        <div className="flex gap-1">
          {(['formula', 'breast_milk'] as const).map(m => (
            <Button key={m} type="button" size="sm" variant={milk === m ? 'default' : 'outline'} className="text-xs" onClick={() => setMilk(m)}>
              {m === 'formula' ? 'Formula' : 'Breast milk'}
            </Button>
          ))}
        </div>
        <Button size="sm" onClick={logBottle}>Log</Button>
      </div>
      <EntryList events={feeds.events.slice(0, 12)} onRemove={feeds.remove} render={f => (
        <>
          {METHOD_LABEL[f.data?.method as FeedMethod] ?? 'Feed'}
          {f.ended_at ? ` · ${fmtMin(differenceInMinutes(parseISO(f.ended_at), parseISO(f.occurred_at)))}` : ''}
          {f.data?.ml ? ` · ${f.data.ml} ml` : ''}
          {f.data?.milk ? ` (${f.data.milk === 'formula' ? 'formula' : 'breast milk'})` : ''}
        </>
      )} />
      <p className="text-[10px] text-muted-foreground">Newborns typically feed 8–12 times in 24 hours. Ask your midwife or health visitor if you’re unsure.</p>
    </div>
  );
}

function SleepTab({ babyId }: { babyId: string }) {
  const sleeps = useLifeEvents('baby_sleep', { babyId, limit: 100 });
  const [start, setStart] = useState<number | null>(() => readActive(SLEEP_ACTIVE_KEY(babyId)));
  const now = useTick(start !== null);
  const begin = () => { const t = Date.now(); setStart(t); writeActive(SLEEP_ACTIVE_KEY(babyId), t); };
  const end = async () => {
    if (start === null) return;
    const s = start; setStart(null); writeActive(SLEEP_ACTIVE_KEY(babyId), null);
    await sleeps.add({ occurred_at: new Date(s).toISOString(), ended_at: new Date().toISOString() });
  };
  const todayMin = sleeps.events
    .filter(e => e.ended_at && isToday(parseISO(e.ended_at)))
    .reduce((sum, e) => sum + differenceInMinutes(parseISO(e.ended_at as string), parseISO(e.occurred_at)), 0);
  return (
    <div className="space-y-3">
      {sleeps.error && <p className="text-xs text-destructive">{sleeps.error}</p>}
      <div className="grid grid-cols-2 gap-2 text-center">
        <Stat label="Sleep today" value={fmtMin(todayMin)} />
        <Stat label="Naps today" value={String(sleeps.events.filter(e => e.ended_at && isToday(parseISO(e.ended_at))).length)} />
      </div>
      {start !== null ? (
        <div className="rounded-xl bg-primary/10 border border-primary/30 p-3 text-center space-y-2">
          <div className="text-xs text-primary">Sleeping</div>
          <div className="text-3xl font-bold tabular-nums">{fmtMin((now - start) / 60000)}</div>
          <Button onClick={end} className="gap-1"><Square className="h-4 w-4" /> Woke up</Button>
        </div>
      ) : (
        <Button onClick={begin} className="w-full gap-1"><Moon className="h-4 w-4" /> Fell asleep</Button>
      )}
      <EntryList events={sleeps.events.slice(0, 10)} onRemove={sleeps.remove} render={e => (
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
  return (
    <div className="space-y-3">
      {nappies.error && <p className="text-xs text-destructive">{nappies.error}</p>}
      <div className="grid grid-cols-2 gap-2 text-center">
        <Stat label="Wet today" value={String(wet)} />
        <Stat label="Dirty today" value={String(dirty)} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Button variant="outline" onClick={() => log('wet')}>Wet</Button>
        <Button variant="outline" onClick={() => log('dirty')}>Dirty</Button>
        <Button variant="outline" onClick={() => log('both')}>Both</Button>
      </div>
      <EntryList events={nappies.events.slice(0, 10)} onRemove={nappies.remove} render={e => <>{label[e.data?.type ?? 'wet']}</>} />
      <p className="text-[10px] text-muted-foreground">From about day 5, around 6 or more wet nappies a day is a common sign of enough milk. Ask your midwife if you’re worried.</p>
    </div>
  );
}

function GrowthTab({ babyId }: { babyId: string }) {
  const growth = useLifeEvents<GrowthData>('baby_growth', { babyId, limit: 100 });
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
            className={`text-[11px] px-2 py-0.5 rounded-full ${name === v ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70'}`}>{v}</button>
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

function EntryList<D>({ events, onRemove, render, dateOnly }: {
  events: LifeEvent<D>[]; onRemove: (id: string) => unknown; render: (e: LifeEvent<D>) => React.ReactNode; dateOnly?: boolean;
}) {
  if (events.length === 0) return null;
  return (
    <ul className="space-y-1 max-h-48 overflow-y-auto pt-2 border-t">
      {events.map(e => (
        <li key={e.id} className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground tabular-nums w-24 flex-shrink-0">
            {dateOnly ? format(parseISO(e.occurred_at), 'MMM d, yyyy') : when(e.occurred_at)}
          </span>
          <span className="flex-1">{render(e)}</span>
          <Remove onClick={() => { void onRemove(e.id); }} />
        </li>
      ))}
    </ul>
  );
}

export default function BabyTracker({ initialTab = 'feed' }: { initialTab?: string }) {
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
          <TabsContent value="feed" className="pt-3"><FeedTab babyId={baby.id} /></TabsContent>
          <TabsContent value="sleep" className="pt-3"><SleepTab babyId={baby.id} /></TabsContent>
          <TabsContent value="nappy" className="pt-3"><NappyTab babyId={baby.id} /></TabsContent>
          <TabsContent value="growth" className="pt-3"><GrowthTab babyId={baby.id} /></TabsContent>
          <TabsContent value="vax" className="pt-3"><VaccineTab babyId={baby.id} /></TabsContent>
          <TabsContent value="stats" className="pt-3"><BabyStatsTab babyId={baby.id} onGoTo={setTab} /></TabsContent>
        </Tabs>
      )}
    </Card>
  );
}
