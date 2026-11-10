import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLifeEvents } from '@/hooks/useLifeEvents';
import { Pill, Plus, Check, Trash2, Bell, X } from 'lucide-react';
import { format, isToday, parseISO } from 'date-fns';
import { dueReminders } from '@/lib/medicine';

// Medicine & supplement log for every life stage (table medications;
// each "Taken" tap is a life_events row, kind 'med_dose').
// Reminders are on-screen: a medicine shows "Due" when one of its
// reminder times has passed today and the matching dose isn't logged.
// Phone notifications come with the installed iPhone app.

export interface Medication {
  id: string;
  name: string;
  dose: string | null;
  times_per_day: number | null;
  reminder_times: string[] | null;
  stage: string | null;
  notes: string | null;
  active: boolean;
}

interface DoseData { medication_id: string; name: string; dose: string | null }

// Quick-add examples per stage. Only names people commonly track - never
// a recommendation; the card says so.
const EXAMPLES: Record<string, string[]> = {
  pregnancy: ['Prenatal vitamin', 'Folic acid', 'Iron', 'Vitamin D'],
  conception: ['Folic acid', 'Vitamin D', 'Prenatal vitamin'],
  ivf: ['Folic acid', 'Progesterone', 'Estradiol'],
  postpartum: ['Iron', 'Vitamin D', 'Ibuprofen', 'Prenatal vitamin'],
  menopause: ['HRT', 'Vitamin D', 'Calcium', 'Magnesium'],
  'post-menopause': ['Vitamin D', 'Calcium', 'HRT'],
  contraception: ['Contraceptive pill'],
};
const DEFAULT_EXAMPLES = ['Iron', 'Vitamin D', 'Magnesium', 'Painkiller'];

export default function MedicineLog({ stage }: { stage?: string | null }) {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const [meds, setMeds] = useState<Medication[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [times, setTimes] = useState<string[]>(['08:00']);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const doses = useLifeEvents<DoseData>('med_dose', { limit: 300 });

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data, error: err } = await db.from('medications').select('*')
      .eq('user_id', userId).eq('active', true).order('created_at', { ascending: true });
    if (err) setError('Could not load your medicines.');
    else setMeds((data ?? []) as Medication[]);
    setLoaded(true);
  }, [userId]);
  useEffect(() => { void load(); }, [load]);

  const todayCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of doses.events) {
      if (!isToday(parseISO(d.occurred_at))) continue;
      const id = d.data?.medication_id;
      if (id) m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [doses.events]);

  const save = async () => {
    const n = name.trim();
    if (!n || !userId) return;
    const cleanTimes = times.filter(t => /^\d{2}:\d{2}$/.test(t));
    const { data, error: err } = await db.from('medications').insert({
      user_id: userId,
      name: n,
      dose: dose.trim() || null,
      times_per_day: cleanTimes.length || null,
      reminder_times: cleanTimes,
      stage: stage ?? null,
      started_on: format(new Date(), 'yyyy-MM-dd'),
    }).select('*');
    if (err) { setError('Could not save. Check your connection and try again.'); return; }
    const row = (Array.isArray(data) ? data[0] : data) as Medication | undefined;
    if (row) setMeds(prev => [...prev, row]);
    setName(''); setDose(''); setTimes(['08:00']); setAdding(false); setError(null);
  };

  const stop = async (m: Medication) => {
    if (!window.confirm(`Stop tracking ${m.name}? Past doses stay in your history.`)) return;
    const { error: err } = await db.from('medications')
      .update({ active: false, updated_at: new Date().toISOString() }).eq('id', m.id).eq('user_id', userId);
    if (err) { setError('Could not update. Try again.'); return; }
    setMeds(prev => prev.filter(x => x.id !== m.id));
  };

  const take = (m: Medication) =>
    doses.add({ occurred_at: new Date().toISOString(), data: { medication_id: m.id, name: m.name, dose: m.dose } });

  const undoLast = (m: Medication) => {
    const last = doses.events.find(d => d.data?.medication_id === m.id && isToday(parseISO(d.occurred_at)));
    if (last) void doses.remove(last.id);
  };

  const examples = (stage && EXAMPLES[stage]) || DEFAULT_EXAMPLES;
  const recent = doses.events.slice(0, 8);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Pill className="h-4 w-4 text-primary" />
          Medicines & supplements
        </h3>
        {!adding && (
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        )}
      </div>

      {(error || doses.error) && <p className="text-xs text-destructive">{error || doses.error}</p>}

      {adding && (
        <div className="rounded-lg border p-3 space-y-2">
          <div className="flex flex-wrap gap-1">
            {examples.map(ex => (
              <button key={ex} type="button" onClick={() => setName(ex)}
                className="text-[11px] px-2 py-0.5 rounded-full bg-muted hover:bg-muted/70">
                {ex}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="med-name" className="text-xs">Name</Label>
              <Input id="med-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Iron" />
            </div>
            <div>
              <Label htmlFor="med-dose" className="text-xs">Dose (optional)</Label>
              <Input id="med-dose" value={dose} onChange={e => setDose(e.target.value)} placeholder="e.g. 100 mg" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Reminder times</Label>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              {times.map((t, i) => (
                <div key={i} className="flex items-center gap-1">
                  <Input type="time" value={t} className="h-8 w-28"
                    aria-label={`Reminder time ${i + 1}`}
                    onChange={e => setTimes(prev => prev.map((x, j) => j === i ? e.target.value : x))} />
                  <button type="button" aria-label="Remove time" className="text-muted-foreground hover:text-destructive"
                    onClick={() => setTimes(prev => prev.filter((_, j) => j !== i))}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {times.length < 6 && (
                <Button type="button" size="sm" variant="ghost" className="h-8 text-xs"
                  onClick={() => setTimes(prev => [...prev, '20:00'])}>
                  + time
                </Button>
              )}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" className="flex-1" onClick={() => { setAdding(false); setName(''); setDose(''); }}>
              Cancel
            </Button>
            <Button size="sm" className="flex-1" onClick={save} disabled={!name.trim()}>Save</Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Examples are names people often track, not recommendations. Take medicines as your doctor or pharmacist advised.
          </p>
        </div>
      )}

      {loaded && meds.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground">
          Add the medicines, vitamins or supplements you take. Tap “Taken” each time, and see what’s due today.
        </p>
      )}

      <ul className="space-y-2">
        {meds.map(m => {
          const taken = todayCount.get(m.id) ?? 0;
          const due = dueReminders(m.reminder_times ?? [], taken, now);
          const target = m.times_per_day ?? 0;
          return (
            <li key={m.id} className={`rounded-lg border p-2.5 ${due.length ? 'border-primary/50 bg-primary/5' : ''}`}>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {m.name}{m.dose ? <span className="text-muted-foreground font-normal"> · {m.dose}</span> : null}
                  </div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                    {target > 0 ? `${taken} of ${target} today` : `${taken} today`}
                    {(m.reminder_times ?? []).length > 0 && (
                      <span className="flex items-center gap-0.5"><Bell className="h-3 w-3" />{(m.reminder_times ?? []).join(', ')}</span>
                    )}
                    {due.length > 0 && <Badge className="h-4 px-1.5 text-[10px]">Due {due[0]}</Badge>}
                  </div>
                </div>
                <Button size="sm" className="h-8 gap-1" onClick={() => take(m)}>
                  <Check className="h-3.5 w-3.5" /> Taken
                </Button>
                <button type="button" onClick={() => stop(m)} aria-label={`Stop tracking ${m.name}`}
                  className="text-muted-foreground/60 hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {taken > 0 && (
                <button type="button" onClick={() => undoLast(m)} className="text-[10px] text-muted-foreground underline mt-1">
                  Undo last
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {recent.length > 0 && (
        <div className="pt-2 border-t">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Recently taken</p>
          <ul className="space-y-0.5">
            {recent.map(d => (
              <li key={d.id} className="text-xs flex justify-between text-muted-foreground">
                <span>{d.data?.name}{d.data?.dose ? ` · ${d.data.dose}` : ''}</span>
                <span className="tabular-nums">
                  {isToday(parseISO(d.occurred_at)) ? format(parseISO(d.occurred_at), 'HH:mm') : format(parseISO(d.occurred_at), 'MMM d, HH:mm')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
