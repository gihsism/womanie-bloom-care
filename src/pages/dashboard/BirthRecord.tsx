import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/integrations/db/client';
import { useLifeEvents } from '@/hooks/useLifeEvents';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import DocumentUpload from '@/components/dashboard/DocumentUpload';
import { ArrowLeft, Baby, Pill, FileText, Timer, Plus, Trash2, Check } from 'lucide-react';
import { format, parseISO } from 'date-fns';

// Labour & birth record: birth details (birth_records + babies), medicines
// given during labour (life_events 'labour_med'), contractions timed in
// the app, and hospital reports (health_documents of the two birth types,
// analysed by the AI like any upload).

const DELIVERY_TYPES = [
  'Vaginal birth',
  'Assisted (forceps / vacuum)',
  'Planned caesarean',
  'Emergency caesarean',
  'Water birth',
];
const PAIN_RELIEF = ['None', 'Gas & air', 'Epidural', 'Spinal', 'Opioid (e.g. pethidine)', 'TENS', 'Water / bath', 'Breathing / hypnobirthing'];
const LABOUR_MEDS = [
  'Epidural top-up', 'Oxytocin (Syntocinon)', 'Antibiotics', 'Induction (prostaglandin)', 'Misoprostol',
  'Pethidine / opioid', 'Paracetamol', 'Anti-D', 'Local anaesthetic', 'Vitamin K (baby)',
];
const BIRTH_DOC_TYPES = ['Labour / Birth Report', 'Hospital Discharge Summary'];

interface BirthForm {
  id?: string;
  baby_id?: string | null;
  baby_name: string;
  baby_sex: string;
  labour_started_at: string; // datetime-local value
  birth_at: string;
  place: string;
  delivery_type: string;
  pain_relief: string[];
  birth_weight_g: string;
  birth_length_cm: string;
  apgar_1: string;
  apgar_5: string;
  complications: string;
  notes: string;
}

const EMPTY: BirthForm = {
  baby_name: '', baby_sex: '', labour_started_at: '', birth_at: '', place: '', delivery_type: '',
  pain_relief: [], birth_weight_g: '', birth_length_cm: '', apgar_1: '', apgar_5: '', complications: '', notes: '',
};

const toLocalInput = (iso: string | null | undefined) => iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : '';
const toIso = (local: string) => local ? new Date(local).toISOString() : null;
const intOrNull = (v: string) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const numOrNull = (v: string) => { const n = parseFloat(v.replace(',', '.')); return Number.isFinite(n) ? n : null; };

interface LabourMed { name: string; dose: string | null; note: string | null }
interface Doc { id: string; file_name: string; ai_suggested_name: string | null; document_type: string; uploaded_at: string; ai_summary: string | null }

export default function BirthRecord() {
  usePageTitle('Labour & birth');
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const [form, setForm] = useState<BirthForm>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [medName, setMedName] = useState('');
  const [medDose, setMedDose] = useState('');
  const [medTime, setMedTime] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const labourMeds = useLifeEvents<LabourMed>('labour_med', { limit: 100 });
  const contractions = useLifeEvents('contraction', { limit: 500 });

  const load = useCallback(async () => {
    if (!userId) return;
    const { data: recs, error: err } = await db.from('birth_records').select('*')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(1);
    if (err) { setError('Could not load your birth record.'); setLoaded(true); return; }
    const r = (recs ?? [])[0] as Record<string, unknown> | undefined;
    if (r) {
      let babyName = '', babySex = '';
      if (r.baby_id) {
        const { data: babies } = await db.from('babies').select('*').eq('user_id', userId).eq('id', r.baby_id as string);
        const b = (babies ?? [])[0] as { name?: string; sex?: string } | undefined;
        babyName = b?.name ?? ''; babySex = b?.sex ?? '';
      }
      setForm({
        id: r.id as string,
        baby_id: (r.baby_id as string | null) ?? null,
        baby_name: babyName,
        baby_sex: babySex,
        labour_started_at: toLocalInput(r.labour_started_at as string | null),
        birth_at: toLocalInput(r.birth_at as string | null),
        place: (r.place as string) ?? '',
        delivery_type: (r.delivery_type as string) ?? '',
        pain_relief: (r.pain_relief as string[]) ?? [],
        birth_weight_g: r.birth_weight_g != null ? String(r.birth_weight_g) : '',
        birth_length_cm: r.birth_length_cm != null ? String(r.birth_length_cm) : '',
        apgar_1: r.apgar_1 != null ? String(r.apgar_1) : '',
        apgar_5: r.apgar_5 != null ? String(r.apgar_5) : '',
        complications: (r.complications as string) ?? '',
        notes: (r.notes as string) ?? '',
      });
    }
    setLoaded(true);
  }, [userId]);

  const loadDocs = useCallback(async () => {
    if (!userId) return;
    const { data } = await db.from('health_documents')
      .select('id, file_name, ai_suggested_name, document_type, uploaded_at, ai_summary')
      .eq('user_id', userId).order('uploaded_at', { ascending: false });
    setDocs(((data ?? []) as Doc[]).filter(d => BIRTH_DOC_TYPES.includes(d.document_type)));
  }, [userId]);

  useEffect(() => { void load(); void loadDocs(); }, [load, loadDocs]);

  const set = <K extends keyof BirthForm>(k: K, v: BirthForm[K]) => { setForm(f => ({ ...f, [k]: v })); setSaved(false); };

  const save = async () => {
    if (!userId) return;
    setSaving(true); setError(null);
    try {
      // Baby: create or update when a name is given.
      let babyId = form.baby_id ?? null;
      const babyName = form.baby_name.trim();
      const birthDate = form.birth_at ? format(new Date(form.birth_at), 'yyyy-MM-dd') : null;
      if (babyName) {
        if (babyId) {
          await db.from('babies').update({ name: babyName, sex: form.baby_sex || null, birth_date: birthDate, updated_at: new Date().toISOString() })
            .eq('id', babyId).eq('user_id', userId);
        } else {
          const { data: b, error: be } = await db.from('babies')
            .insert({ user_id: userId, name: babyName, sex: form.baby_sex || null, birth_date: birthDate }).select('*');
          if (be) throw new Error('baby');
          babyId = ((Array.isArray(b) ? b[0] : b) as { id: string }).id;
        }
      }
      const row = {
        baby_id: babyId,
        labour_started_at: toIso(form.labour_started_at),
        birth_at: toIso(form.birth_at),
        place: form.place.trim() || null,
        delivery_type: form.delivery_type || null,
        pain_relief: form.pain_relief,
        birth_weight_g: intOrNull(form.birth_weight_g),
        birth_length_cm: numOrNull(form.birth_length_cm),
        apgar_1: intOrNull(form.apgar_1),
        apgar_5: intOrNull(form.apgar_5),
        complications: form.complications.trim() || null,
        notes: form.notes.trim() || null,
        updated_at: new Date().toISOString(),
      };
      if (form.id) {
        const { error: ue } = await db.from('birth_records').update(row).eq('id', form.id).eq('user_id', userId);
        if (ue) throw new Error('update');
        setForm(f => ({ ...f, baby_id: babyId }));
      } else {
        const { data, error: ie } = await db.from('birth_records').insert({ user_id: userId, ...row }).select('*');
        if (ie) throw new Error('insert');
        const created = (Array.isArray(data) ? data[0] : data) as { id: string };
        setForm(f => ({ ...f, id: created.id, baby_id: babyId }));
      }
      setSaved(true);
    } catch {
      setError('Could not save. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const addMed = async () => {
    if (!medName.trim()) return;
    const ok = await labourMeds.add({
      occurred_at: toIso(medTime) ?? new Date().toISOString(),
      data: { name: medName.trim(), dose: medDose.trim() || null, note: null },
    });
    if (ok) { setMedName(''); setMedDose(''); setMedTime(format(new Date(), "yyyy-MM-dd'T'HH:mm")); }
  };

  // Contractions during labour: from labour start (or 48h before birth) to birth.
  const labourStart = form.labour_started_at ? new Date(form.labour_started_at).getTime()
    : form.birth_at ? new Date(form.birth_at).getTime() - 48 * 3600_000 : null;
  const labourEnd = form.birth_at ? new Date(form.birth_at).getTime() : null;
  const labourContractions = contractions.events.filter(e => {
    const t = Date.parse(e.occurred_at);
    return labourStart !== null && labourEnd !== null && t >= labourStart && t <= labourEnd;
  });
  const labourHours = labourStart !== null && labourEnd !== null && form.labour_started_at
    ? Math.max(0, (labourEnd - labourStart) / 3600_000) : null;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="w-full px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div className="h-6 w-px bg-border" />
          <h1 className="text-xl font-bold text-primary">Labour & birth</h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <p className="text-sm text-muted-foreground">
          Keep your birth story in one place: the details, medicines you were given, contractions you timed,
          and your hospital reports. Fill in what you know; everything is optional and you can come back any time.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Birth details */}
        <Card className="p-4 space-y-3">
          <h2 className="font-semibold flex items-center gap-2"><Baby className="h-4 w-4 text-primary" /> Birth details</h2>
          {!loaded ? <p className="text-xs text-muted-foreground">Loading…</p> : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="baby-name" className="text-xs">Baby’s name</Label>
                  <Input id="baby-name" value={form.baby_name} onChange={e => set('baby_name', e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Sex</Label>
                  <div className="flex gap-2 mt-1">
                    {['Girl', 'Boy', 'Other'].map(s => (
                      <Button key={s} type="button" size="sm" variant={form.baby_sex === s ? 'default' : 'outline'}
                        onClick={() => set('baby_sex', form.baby_sex === s ? '' : s)}>{s}</Button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label htmlFor="labour-start" className="text-xs">Labour started</Label>
                  <Input id="labour-start" type="datetime-local" value={form.labour_started_at} onChange={e => set('labour_started_at', e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="birth-at" className="text-xs">Baby born</Label>
                  <Input id="birth-at" type="datetime-local" value={form.birth_at} onChange={e => set('birth_at', e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="place" className="text-xs">Place (hospital, birth centre, home)</Label>
                  <Input id="place" value={form.place} onChange={e => set('place', e.target.value)} />
                </div>
              </div>

              <div>
                <Label className="text-xs">Type of birth</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {DELIVERY_TYPES.map(t => (
                    <Button key={t} type="button" size="sm" variant={form.delivery_type === t ? 'default' : 'outline'} className="text-xs"
                      onClick={() => set('delivery_type', form.delivery_type === t ? '' : t)}>{t}</Button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-xs">Pain relief</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {PAIN_RELIEF.map(p => {
                    const on = form.pain_relief.includes(p);
                    return (
                      <Button key={p} type="button" size="sm" variant={on ? 'default' : 'outline'} className="text-xs"
                        onClick={() => set('pain_relief', on ? form.pain_relief.filter(x => x !== p) : [...form.pain_relief, p])}>{p}</Button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <Label htmlFor="weight" className="text-xs">Weight (g)</Label>
                  <Input id="weight" inputMode="numeric" value={form.birth_weight_g} onChange={e => set('birth_weight_g', e.target.value)} placeholder="3400" />
                </div>
                <div>
                  <Label htmlFor="length" className="text-xs">Length (cm)</Label>
                  <Input id="length" inputMode="decimal" value={form.birth_length_cm} onChange={e => set('birth_length_cm', e.target.value)} placeholder="50" />
                </div>
                <div>
                  <Label htmlFor="apgar1" className="text-xs">Apgar 1 min</Label>
                  <Input id="apgar1" inputMode="numeric" value={form.apgar_1} onChange={e => set('apgar_1', e.target.value)} placeholder="0–10" />
                </div>
                <div>
                  <Label htmlFor="apgar5" className="text-xs">Apgar 5 min</Label>
                  <Input id="apgar5" inputMode="numeric" value={form.apgar_5} onChange={e => set('apgar_5', e.target.value)} placeholder="0–10" />
                </div>
              </div>

              <div>
                <Label htmlFor="complications" className="text-xs">Complications (if any)</Label>
                <Textarea id="complications" rows={2} value={form.complications} onChange={e => set('complications', e.target.value)} />
              </div>
              <div>
                <Label htmlFor="notes" className="text-xs">Notes, memories, how you felt</Label>
                <Textarea id="notes" rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} />
              </div>
              {form.baby_id && (
                <Button type="button" variant="outline" className="w-full" onClick={() => navigate('/dashboard/baby')}>
                  Open baby tracker (feeds, sleep, nappies, growth)
                </Button>
              )}
              <Button onClick={save} disabled={saving} className="w-full gap-2">
                {saved ? <><Check className="h-4 w-4" /> Saved</> : saving ? 'Saving…' : 'Save birth details'}
              </Button>
            </>
          )}
        </Card>

        {/* Labour medicines */}
        <Card className="p-4 space-y-3">
          <h2 className="font-semibold flex items-center gap-2"><Pill className="h-4 w-4 text-primary" /> Medicines during labour</h2>
          <p className="text-xs text-muted-foreground">What you (or your baby) were given, and when. Your partner can fill this in during labour.</p>
          {labourMeds.error && <p className="text-xs text-destructive">{labourMeds.error}</p>}
          <div className="flex flex-wrap gap-1">
            {LABOUR_MEDS.map(m => (
              <button key={m} type="button" onClick={() => setMedName(m)}
                className={`text-[11px] px-2 py-0.5 rounded-full ${medName === m ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70'}`}>{m}</button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Input aria-label="Medicine" value={medName} onChange={e => setMedName(e.target.value)} placeholder="Medicine" />
            <Input aria-label="Dose" value={medDose} onChange={e => setMedDose(e.target.value)} placeholder="Dose (optional)" />
            <Input aria-label="Time given" type="datetime-local" value={medTime} onChange={e => setMedTime(e.target.value)} />
          </div>
          <Button size="sm" variant="outline" className="gap-1" onClick={addMed} disabled={!medName.trim()}>
            <Plus className="h-3.5 w-3.5" /> Add medicine
          </Button>
          {labourMeds.events.length > 0 && (
            <ul className="divide-y text-sm">
              {[...labourMeds.events].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)).map(m => (
                <li key={m.id} className="py-1.5 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground tabular-nums w-24 flex-shrink-0">{format(parseISO(m.occurred_at), 'MMM d, HH:mm')}</span>
                  <span className="flex-1">{m.data?.name}{m.data?.dose ? <span className="text-muted-foreground"> · {m.data.dose}</span> : null}</span>
                  <button type="button" aria-label="Remove" className="text-muted-foreground/60 hover:text-destructive" onClick={() => labourMeds.remove(m.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Contractions */}
        <Card className="p-4 space-y-2">
          <h2 className="font-semibold flex items-center gap-2"><Timer className="h-4 w-4 text-primary" /> Contractions</h2>
          {labourEnd === null ? (
            <p className="text-xs text-muted-foreground">
              Use the contraction timer on your pregnancy dashboard when labour starts. Once you add the birth time above,
              the contractions you timed appear here.
            </p>
          ) : labourContractions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No contractions were timed in the app during this labour.</p>
          ) : (
            <p className="text-sm">
              {labourContractions.length} contractions timed
              {labourHours !== null ? ` over ${labourHours.toFixed(1)} hours of labour` : ''}.
            </p>
          )}
        </Card>

        {/* Hospital reports */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Hospital reports</h2>
            <DocumentUpload defaultType="Labour / Birth Report" onUploaded={() => { void loadDocs(); }} />
          </div>
          <p className="text-xs text-muted-foreground">
            Upload your labour notes, birth report or discharge letter. They’re read and explained in plain language like your other records.
          </p>
          {docs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No birth reports uploaded yet.</p>
          ) : (
            <ul className="divide-y">
              {docs.map(d => (
                <li key={d.id} className="py-2">
                  <button type="button" className="text-left w-full" onClick={() => navigate('/dashboard/medical-history')}>
                    <div className="text-sm font-medium">{d.ai_suggested_name || d.file_name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {d.document_type} · {format(parseISO(d.uploaded_at), 'MMM d, yyyy')}{d.ai_summary ? '' : ' · being analysed'}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
