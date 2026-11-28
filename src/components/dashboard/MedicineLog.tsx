import { formatTime, TIME_FMT } from '@/lib/timeFormat';
import { useConfirm } from '@/components/ConfirmDialog';
import { stopMedicineConfirm } from '@/lib/confirmCopy';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { insertLifeEvent } from '@/hooks/useLifeEvents';
import { useOfflineLifeEvents } from '@/hooks/useOfflineLifeEvents';
import { Pill, Plus, Check, Trash2, Bell, X, Pencil, CloudOff } from 'lucide-react';
import { format, isToday, parseISO } from 'date-fns';
import { dueReminders } from '@/lib/medicine';
import { supplyNote } from '@/lib/medicineSupply';
import { emitHealthDataChange } from '@/lib/data-events';
import EvidenceNote from '@/components/research/EvidenceNote';
import { medicineMarker, specsForMarkers } from '@/lib/evidenceTopics';

// Medicine & supplement log for every life stage (table medications;
// each "Taken" tap is a life_events row, kind 'med_dose').
// Reminders are on-screen: a medicine shows "Due" when one of its
// reminder times has passed today and the matching dose isn't logged.
// Phone notifications come with the installed iPhone app.
// Editing (name, dose, reminder times) updates the same row, so its id —
// and with it today's ticks and the phone-reminder keys — stays the same;
// the sender reads the new times at its next run and never re-sends a
// dose it already reminded of (api/_lib/push-run.ts, slotKey). History is
// kept: every dose row stores the name and dose it was taken under, and
// each edit adds a 'med_change' life event with the before/after values.

export interface Medication {
  id: string;
  name: string;
  dose: string | null;
  times_per_day: number | null;
  reminder_times: string[] | null;
  stage: string | null;
  notes: string | null;
  active: boolean;
  started_on?: string | null;
  // Migration 027: when it runs out (course end and/or current pack).
  ends_on?: string | null;
  pack_size?: number | null;
  pack_started_on?: string | null;
}

const SUPPLY_KEYS = ['ends_on', 'pack_size', 'pack_started_on'] as const;

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
  const [confirm, confirmDialog] = useConfirm();
  const [meds, setMeds] = useState<Medication[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  // The medicine being edited (the form is the add form, prefilled).
  const [editing, setEditing] = useState<Medication | null>(null);
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [times, setTimes] = useState<string[]>(['08:00']);
  // When she started it (defaults to today). Medicines she already took
  // before joining keep their real start, so the menopause symptom trends
  // can line changes up with it.
  const [startedOn, setStartedOn] = useState('');
  // When it runs out: last day of a course, or doses in the current pack
  // and the day that pack was started (Home shows a row 3 days before).
  const [endsOn, setEndsOn] = useState('');
  const [packSize, setPackSize] = useState('');
  const [packStartedOn, setPackStartedOn] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  // A "Taken" tap with no signal is kept on the device and sent when the
  // connection is back (same queue as the kick counter), so it still
  // counts today instead of being lost.
  const doses = useOfflineLifeEvents<DoseData>('med_dose', { limit: 300 });
  const pendingDoses = useMemo(
    () => doses.pending.map(p => ({ id: p.localId, occurred_at: p.occurred_at, data: p.data, pending: true as const })),
    [doses.pending],
  );
  const allDoses = useMemo(
    () => [...pendingDoses, ...doses.events.map(e => ({ id: e.id, occurred_at: e.occurred_at, data: e.data, pending: false as const }))]
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)),
    [pendingDoses, doses.events],
  );

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
    for (const d of allDoses) {
      if (!isToday(parseISO(d.occurred_at))) continue;
      const id = d.data?.medication_id;
      if (id) m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [allDoses]);

  // A yyyy-mm-dd start date that is not in the future, else null.
  const validStart = (v: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(v) && v <= format(new Date(), 'yyyy-MM-dd') ? v : null;

  const closeForm = () => {
    setAdding(false); setEditing(null); setName(''); setDose(''); setTimes(['08:00']); setStartedOn('');
    setEndsOn(''); setPackSize(''); setPackStartedOn('');
  };

  // The supply fields as stored: a pack needs a size; its start defaults to today.
  const supplyFields = () => {
    const n = Number(packSize);
    const size = packSize.trim() && Number.isInteger(n) && n > 0 && n <= 1000 ? n : null;
    const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
    return {
      ends_on: isDay(endsOn) ? endsOn : null,
      pack_size: size,
      pack_started_on: size ? (isDay(packStartedOn) ? packStartedOn : format(new Date(), 'yyyy-MM-dd')) : null,
    };
  };
  const SUPPLY_NOT_SAVED = 'Saved. The pack and end date could not be stored yet; try again later.';

  const startEdit = (m: Medication) => {
    setEditing(m);
    setName(m.name);
    setDose(m.dose ?? '');
    setTimes([...(m.reminder_times ?? [])]);
    // The start date lines symptom changes up with this medicine (menopause
    // trends, HRT questions), so a wrong one has to be correctable here.
    setStartedOn(m.started_on ? String(m.started_on).slice(0, 10) : '');
    setEndsOn(m.ends_on ? String(m.ends_on).slice(0, 10) : '');
    setPackSize(m.pack_size ? String(m.pack_size) : '');
    setPackStartedOn(m.pack_started_on ? String(m.pack_started_on).slice(0, 10) : '');
    setAdding(true);
    setError(null);
  };

  const saveEdit = async (m: Medication, n: string, cleanTimes: string[]) => {
    const prevStart = m.started_on ? String(m.started_on).slice(0, 10) : null;
    const nextStart = validStart(startedOn);
    const changes = {
      name: n,
      dose: dose.trim() || null,
      times_per_day: cleanTimes.length || null,
      reminder_times: cleanTimes,
      // Only a valid, changed date is written; clearing the box keeps the old one.
      ...(nextStart && nextStart !== prevStart ? { started_on: nextStart } : {}),
    };
    // Supply columns arrive with migration 027: send them once the row has
    // them or she filled one in; without the columns, retry without them.
    const supply = supplyFields();
    const withSupply = SUPPLY_KEYS.some(k => k in m) || SUPPLY_KEYS.some(k => supply[k] != null);
    const stamp = { updated_at: new Date().toISOString() };
    let { error: err } = await db.from('medications')
      .update({ ...changes, ...(withSupply ? supply : {}), ...stamp }).eq('id', m.id).eq('user_id', userId);
    let supplySaved = withSupply;
    if (err && withSupply) {
      ({ error: err } = await db.from('medications').update({ ...changes, ...stamp }).eq('id', m.id).eq('user_id', userId));
      supplySaved = false;
    }
    if (err) { setError('Could not save. Check your connection and try again.'); return; }
    setMeds(prev => prev.map(x => (x.id === m.id ? { ...x, ...changes, ...(supplySaved ? supply : {}) } : x)));
    // History: what it was before and after (doses keep their own name/dose).
    const before: Record<string, unknown> = { name: m.name, dose: m.dose, reminder_times: m.reminder_times ?? [] };
    const after: Record<string, unknown> = { name: changes.name, dose: changes.dose, reminder_times: cleanTimes };
    if ('started_on' in changes) { before.started_on = prevStart; after.started_on = changes.started_on; }
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      void insertLifeEvent(userId, 'med_change', { occurred_at: new Date().toISOString(), data: { medication_id: m.id, before, after } });
    }
    closeForm(); setError(withSupply && !supplySaved ? SUPPLY_NOT_SAVED : null);
    emitHealthDataChange();
  };

  const save = async () => {
    const n = name.trim();
    if (!n || !userId) return;
    // Sorted and de-duplicated, the way the reminder sender reads them.
    const cleanTimes = [...new Set(times.filter(t => /^\d{2}:\d{2}$/.test(t)))].sort();
    if (editing) { await saveEdit(editing, n, cleanTimes); return; }
    const base = {
      user_id: userId,
      name: n,
      dose: dose.trim() || null,
      times_per_day: cleanTimes.length || null,
      reminder_times: cleanTimes,
      stage: stage ?? null,
      started_on: validStart(startedOn) ?? format(new Date(), 'yyyy-MM-dd'),
    };
    // Supply fields only when filled in (columns arrive with migration 027).
    const supply = supplyFields();
    const withSupply = SUPPLY_KEYS.some(k => supply[k] != null);
    let { data, error: err } = await db.from('medications').insert(withSupply ? { ...base, ...supply } : base).select('*');
    let supplySaved = withSupply;
    if (err && withSupply) {
      ({ data, error: err } = await db.from('medications').insert(base).select('*'));
      supplySaved = false;
    }
    if (err) { setError('Could not save. Check your connection and try again.'); return; }
    const row = (Array.isArray(data) ? data[0] : data) as Medication | undefined;
    if (row) setMeds(prev => [...prev, row]);
    closeForm(); setError(withSupply && !supplySaved ? SUPPLY_NOT_SAVED : null);
    emitHealthDataChange();
  };

  const stop = async (m: Medication) => {
    if (!(await confirm(stopMedicineConfirm(m.name)))) return;
    const base = { active: false, updated_at: new Date().toISOString() };
    // stopped_on arrives with migration 018; until then retry without it.
    let { error: err } = await db.from('medications')
      .update({ ...base, stopped_on: format(new Date(), 'yyyy-MM-dd') }).eq('id', m.id).eq('user_id', userId);
    if (err) {
      ({ error: err } = await db.from('medications').update(base).eq('id', m.id).eq('user_id', userId));
    }
    if (err) { setError('Could not update. Try again.'); return; }
    setMeds(prev => prev.filter(x => x.id !== m.id));
    emitHealthDataChange();
  };

  // Home's "Today" list re-reads which medicines are due after each tick.
  const take = async (m: Medication) => {
    await doses.addOrQueue({ occurred_at: new Date().toISOString(), ended_at: null, data: { medication_id: m.id, name: m.name, dose: m.dose } });
    emitHealthDataChange();
  };

  const undoLast = (m: Medication) => {
    const last = allDoses.find(d => d.data?.medication_id === m.id && isToday(parseISO(d.occurred_at)));
    if (!last) return;
    if (last.pending) { doses.removePending(last.id); emitHealthDataChange(); return; }
    void doses.remove(last.id).then(() => emitHealthDataChange());
  };

  const examples = (stage && EXAMPLES[stage]) || DEFAULT_EXAMPLES;
  const recent = allDoses.slice(0, 8);

  return (
    <Card className="p-4 space-y-3">
    {confirmDialog}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Pill className="h-4 w-4 text-primary" />
          Medicines & supplements
        </h3>
        {!adding && !editing && (
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        )}
      </div>

      {(error || doses.error) && <p className="text-xs text-destructive">{error || doses.error}</p>}

      {adding && (
        <div className="rounded-lg border p-3 space-y-2" data-hide-install-banner>
          {editing && <p className="text-sm font-medium">Edit {editing.name}</p>}
          {!editing && <div className="flex flex-wrap gap-1">
            {examples.map(ex => (
              <button key={ex} type="button" onClick={() => setName(ex)}
                className="text-xs px-2.5 py-1.5 rounded-full bg-muted hover:bg-muted/70">
                {ex}
              </button>
            ))}
          </div>}
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
            <Label htmlFor="med-started" className="text-xs">Started on (optional)</Label>
            <Input id="med-started" type="date" value={startedOn} max={format(now, 'yyyy-MM-dd')}
              onChange={e => setStartedOn(e.target.value)} className="h-8 w-44" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="med-pack" className="text-xs">Doses in pack (optional)</Label>
              <Input id="med-pack" type="number" inputMode="numeric" min={1} max={1000} value={packSize}
                onChange={e => setPackSize(e.target.value)} placeholder="e.g. 30" className="h-8" />
            </div>
            <div>
              <Label htmlFor="med-pack-start" className="text-xs">Pack started on</Label>
              <Input id="med-pack-start" type="date" value={packStartedOn} max={format(now, 'yyyy-MM-dd')}
                onChange={e => setPackStartedOn(e.target.value)} className="h-8" disabled={!packSize.trim()} />
            </div>
          </div>
          <div>
            <Label htmlFor="med-ends" className="text-xs">Last day of the course (optional)</Label>
            <Input id="med-ends" type="date" value={endsOn}
              onChange={e => setEndsOn(e.target.value)} className="h-8 w-44" />
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
            <Button size="sm" variant="outline" className="flex-1" onClick={closeForm}>
              Cancel
            </Button>
            <Button size="sm" className="flex-1" onClick={save} disabled={!name.trim()}>Save</Button>
          </div>
          {editing && (
            <p className="text-[10px] text-muted-foreground">
              Past doses keep the name and dose they were taken under. New reminder times apply from now on.
            </p>
          )}
          {!editing && <p className="text-[10px] text-muted-foreground">
            Examples are names people often track, not recommendations. Take medicines as your doctor or pharmacist advised.
          </p>}
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
                    {supplyNote(m) && <span>· {supplyNote(m)}</span>}
                  </div>
                </div>
                <Button size="sm" className="h-8 gap-1" onClick={() => take(m)}>
                  <Check className="h-3.5 w-3.5" /> Taken
                </Button>
                <button type="button" onClick={() => startEdit(m)} aria-label={`Edit ${m.name}`}
                  disabled={adding}
                  className="tap-target text-muted-foreground/60 hover:text-primary disabled:opacity-40">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
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
                <span className="flex items-center gap-1">
                  {d.data?.name}{d.data?.dose ? ` · ${d.data.dose}` : ''}
                  {d.pending && <CloudOff className="h-3 w-3" aria-label="Not synced yet" />}
                </span>
                <span className="tabular-nums">
                  {isToday(parseISO(d.occurred_at)) ? formatTime(d.occurred_at) : format(parseISO(d.occurred_at), `d MMM, ${TIME_FMT}`)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* What the research says about what she takes (HRT, iron, folic acid...). */}
      <EvidenceNote specs={specsForMarkers(meds.map(m => medicineMarker(m.name)), stage)} className="pt-1 border-t" />
    </Card>
  );
}
