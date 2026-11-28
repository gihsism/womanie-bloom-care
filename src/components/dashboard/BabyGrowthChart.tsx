import { useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ageLabel, curveRows, kgLabel, CURVES, DAYS_PER_MONTH, latestLine, MAX_AGE_DAYS, normaliseSex, parseWeight,
  weightPoints, type GrowthSex,
} from '@/lib/babyGrowth';

// Weight-for-age chart (WHO Child Growth Standards, birth-24 months) and
// "Add a weight" (typed, or read from a photo of the scale and confirmed
// by her). Loaded lazily from the Growth tab: recharts + the WHO table
// stay out of the main bundle.
//
// Colours: WHO curves in muted greys (50th a little stronger, 3rd/97th
// dashed), her baby's points in the brand primary - one series stands out,
// the reference lines recede. Curve labels sit at the right end, as in
// the official charts.

export interface GrowthEventLike {
  id: string;
  occurred_at: string;
  data?: { weight_g?: number | null } | null;
}

export interface WeightToSave { measuredOn: string; weightG: number; source: 'typed' | 'photo' }

interface Props {
  babyName: string;
  birthDate: string | null;
  sex: string | null;
  events: GrowthEventLike[];
  onSaveWeight: (w: WeightToSave) => Promise<boolean>;
  onSetSex: (sex: GrowthSex) => Promise<boolean>;
  onSetBirthDate: (date: string) => Promise<boolean>;
}

const CURVE_STROKE: Record<number, { stroke: string; dash?: string; width: number }> = {
  3: { stroke: 'hsl(var(--muted-foreground) / 0.45)', dash: '4 3', width: 1 },
  15: { stroke: 'hsl(var(--muted-foreground) / 0.45)', width: 1 },
  50: { stroke: 'hsl(var(--muted-foreground) / 0.8)', width: 1.5 },
  85: { stroke: 'hsl(var(--muted-foreground) / 0.45)', width: 1 },
  97: { stroke: 'hsl(var(--muted-foreground) / 0.45)', dash: '4 3', width: 1 },
};
const BABY = 'hsl(var(--primary))';
const axis = { fontSize: 10, fill: 'hsl(var(--muted-foreground))' };
const localDate = (iso: string) => format(parseISO(iso), 'yyyy-MM-dd');
const today = () => format(new Date(), 'yyyy-MM-dd');

/** X range and ticks: weeks for the first ~3 months, then months. */
function xScale(lastDay: number) {
  const want = Math.max(91, Math.ceil(lastDay * 1.2) + 14);
  if (want <= 98) {
    const end = 98;
    const ticks = Array.from({ length: 8 }, (_, i) => i * 14);
    return { end, ticks, label: (d: number) => (d === 0 ? 'Birth' : `${d / 7} wk`) };
  }
  const months = Math.min(24, Math.ceil(want / DAYS_PER_MONTH));
  const step = months <= 6 ? 1 : months <= 12 ? 2 : 3;
  const endMonths = Math.min(24, Math.ceil(months / step) * step);
  const ticks: number[] = [];
  for (let m = 0; m <= endMonths; m += step) ticks.push(Math.min(MAX_AGE_DAYS, Math.round(m * DAYS_PER_MONTH)));
  return {
    end: Math.min(MAX_AGE_DAYS, Math.round(endMonths * DAYS_PER_MONTH)),
    ticks,
    label: (d: number) => (d === 0 ? 'Birth' : `${Math.round(d / DAYS_PER_MONTH)} mo`),
  };
}

/** Shrink a photo to <= 1600 px JPEG (base64) before it is sent. */
async function photoToJpeg(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('decode'));
      i.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85).replace(/^data:[^,]*,/, '');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function SexPicker({ babyName, onSetSex }: { babyName: string; onSetSex: Props['onSetSex'] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pick = async (s: GrowthSex) => {
    setBusy(true); setError(null);
    const ok = await onSetSex(s);
    setBusy(false);
    if (!ok) setError('Could not save. Try again.');
  };
  return (
    <div className="rounded-lg bg-muted/50 p-3 space-y-2" data-testid="growth-sex-picker">
      <p className="text-sm">The WHO weight charts are different for girls and boys. Is {babyName} a girl or a boy?</p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => { void pick('female'); }}>Girl</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => { void pick('male'); }}>Boy</Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function BirthDatePicker({ babyName, onSetBirthDate }: { babyName: string; onSetBirthDate: Props['onSetBirthDate'] }) {
  const [date, setDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (!date || date > today()) { setError('Enter the birth date.'); return; }
    if (!(await onSetBirthDate(date))) setError('Could not save. Try again.');
  };
  return (
    <div className="rounded-lg bg-muted/50 p-3 space-y-2">
      <p className="text-sm">Add {babyName}’s birth date to place the weights on the chart.</p>
      <div className="flex items-end gap-2">
        <div className="flex-1"><Label htmlFor="gc-birth" className="text-xs">Birth date</Label><Input id="gc-birth" type="date" max={today()} value={date} onChange={e => setDate(e.target.value)} /></div>
        <Button size="sm" onClick={() => { void save(); }}>Save</Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function Chart({ sex, points }: { sex: GrowthSex; points: ReturnType<typeof weightPoints> }) {
  const last = points[points.length - 1];
  const x = xScale(last?.day ?? 0);
  const curves = useMemo(() => curveRows(sex, x.end, x.end <= 98 ? 2 : 7), [sex, x.end]);
  const yMin = Math.floor(Math.min(curves[0].p3, ...points.map(p => p.kg)) - 0.2);
  const yMax = Math.ceil(Math.max(curves[curves.length - 1].p97, ...points.map(p => p.kg)) + 0.2);
  const yStep = yMax - yMin > 8 ? 2 : 1;
  const yTicks: number[] = [];
  for (let v = Math.max(0, yMin); v <= yMax; v += yStep) yTicks.push(v);
  const babyRows = points.map(p => ({ day: p.day, baby: p.kg }));
  const lastIdx = curves.length - 1;

  return (
    <div className="h-64 w-full" data-testid="growth-chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart margin={{ top: 8, right: 34, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.6} />
          <XAxis type="number" dataKey="day" domain={[0, x.end]} ticks={x.ticks} tickFormatter={x.label}
            tick={axis} tickLine={false} axisLine={false} allowDuplicatedCategory={false} />
          <YAxis type="number" domain={[Math.max(0, yMin), yMax]} ticks={yTicks} tick={axis} tickLine={false} axisLine={false}
            width={40} tickFormatter={(v: number) => `${v}`} unit=" kg" />
          {CURVES.map(c => {
            const st = CURVE_STROKE[c.p];
            const key = `p${c.p}`;
            return (
              <Line key={key} data={curves} dataKey={key} type="monotone" stroke={st.stroke} strokeWidth={st.width}
                strokeDasharray={st.dash} dot={false} activeDot={false} isAnimationActive={false}
                label={(props: { x?: number; y?: number; index?: number }) => props.index === lastIdx
                  ? <text key={`l-${key}`} x={(props.x ?? 0) + 4} y={(props.y ?? 0) + 3} fontSize={10} fill="hsl(var(--muted-foreground))">{c.p === 3 ? '3rd' : `${c.p}th`}</text>
                  : <g key={`l-${key}-${props.index}`} />} />
            );
          })}
          <Line data={babyRows} dataKey="baby" type="linear" stroke={BABY} strokeWidth={2}
            dot={{ r: 3.5, fill: BABY, stroke: 'hsl(var(--card))', strokeWidth: 1.5 }} activeDot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function AddWeight({ onSaveWeight, birthDate }: { onSaveWeight: Props['onSaveWeight']; birthDate: string | null }) {
  const [date, setDate] = useState(today());
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState<'kg' | 'g'>('kg');
  const [source, setSource] = useState<'typed' | 'photo'>('typed');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = async () => {
    setSaved(null);
    const r = parseWeight(value, unit);
    if (!r.ok) { setError(r.error); return; }
    if (!date || date > today()) { setError('Choose a date up to today.'); return; }
    if (birthDate && date < birthDate) { setError('Choose a date on or after the birth date.'); return; }
    setError(null);
    const ok = await onSaveWeight({ measuredOn: date, weightG: Math.round(r.kg * 1000), source });
    if (!ok) { setError('Could not save. Try again.'); return; }
    setValue(''); setNote(null); setSource('typed'); setDate(today());
    setSaved('Weight saved.');
    window.setTimeout(() => setSaved(null), 2500);
  };

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setReading(true); setError(null); setNote(null); setSaved(null);
    try {
      let image: string;
      try { image = await photoToJpeg(file); } catch {
        setNote('This photo could not be opened here. Try a JPEG photo or a screenshot of it, or type the weight in.');
        return;
      }
      const resp = await fetch('/api/baby/scale-photo', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, mediaType: 'image/jpeg' }),
      });
      const body = (await resp.json().catch(() => ({}))) as { weight_kg?: number | null; confidence?: number; error?: string };
      if (!resp.ok) { setNote(body.error || 'The photo could not be read right now. Type the weight in instead.'); return; }
      if (typeof body.weight_kg !== 'number') {
        setNote('We couldn’t read a number on this photo. Try again with the display sharp and filling more of the picture, or type the weight in.');
        return;
      }
      setUnit('kg');
      setValue(String(body.weight_kg));
      setSource('photo');
      const unsure = (body.confidence ?? 0) < 0.6 ? ' We are not fully sure of every digit.' : '';
      setNote(`Read from the photo: ${body.weight_kg} kg.${unsure} Check it matches the scale, correct it if needed, then tap Save weight.`);
    } catch {
      setNote('The photo could not be read right now. Type the weight in instead.');
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2 border-t pt-3" data-testid="add-weight">
      <p className="label-mono">Add a weight</p>
      <div className="grid grid-cols-2 gap-2">
        <div><Label htmlFor="aw-date" className="text-xs">Date</Label><Input id="aw-date" type="date" max={today()} min={birthDate ?? undefined} value={date} onChange={e => setDate(e.target.value)} /></div>
        <div>
          <Label htmlFor="aw-weight" className="text-xs">Weight ({unit})</Label>
          <Input id="aw-weight" inputMode="decimal" value={value} placeholder={unit === 'kg' ? '4.6' : '4600'}
            aria-invalid={error ? true : undefined} aria-describedby={error ? 'aw-error' : undefined}
            onChange={e => { setValue(e.target.value); setError(null); }} />
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <div role="group" aria-label="Unit" className="inline-flex rounded-md border p-0.5">
          {(['kg', 'g'] as const).map(u => (
            <button key={u} type="button" aria-pressed={unit === u} onClick={() => { setUnit(u); setError(null); }}
              className={`text-xs px-3 py-1.5 rounded ${unit === u ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{u}</button>
          ))}
        </div>
        <Button size="sm" onClick={() => { void save(); }} disabled={reading}>Save weight</Button>
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={reading}>
          <Camera className="h-3.5 w-3.5 mr-1" />{reading ? 'Reading the scale…' : 'Photo of the scale'}
        </Button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" data-testid="scale-photo-input"
          aria-label="Photo of the scale" onChange={e => { void onPhoto(e.target.files?.[0]); }} />
      </div>
      {error && <p id="aw-error" className="text-xs text-destructive">{error}</p>}
      {note && <p role="status" className="text-xs text-foreground bg-muted/50 rounded-md p-2" data-testid="scale-photo-note">{note}</p>}
      {saved && <p role="status" className="text-sm text-primary">{saved}</p>}
      <p className="text-[10px] text-muted-foreground">A photo is sent to Claude (Anthropic) only to read the number; it is not stored. Nothing is saved until you tap Save weight.</p>
    </div>
  );
}

export default function BabyGrowthChart({ babyName, birthDate, sex, events, onSaveWeight, onSetSex, onSetBirthDate }: Props) {
  const growthSex = normaliseSex(sex);
  const points = useMemo(() => (birthDate ? weightPoints(birthDate, events, localDate) : []), [birthDate, events]);
  const last = points[points.length - 1];
  const line = growthSex && last ? latestLine(growthSex, last.day, last.kg) : null;
  const label = line ?? (last ? `${kgLabel(last.kg)} at ${ageLabel(last.day)}` : null);

  return (
    <section className="space-y-3" aria-labelledby="gc-title">
      <div>
        <h4 id="gc-title" className="font-semibold text-sm">Weight for age</h4>
        <p className="text-[11px] text-muted-foreground">WHO Child Growth Standards, {growthSex === 'male' ? 'boys' : growthSex === 'female' ? 'girls' : 'girls and boys'}, birth to 2 years</p>
      </div>
      {!birthDate && <BirthDatePicker babyName={babyName} onSetBirthDate={onSetBirthDate} />}
      {birthDate && !growthSex && <SexPicker babyName={babyName} onSetSex={onSetSex} />}
      {birthDate && growthSex && (
        <>
          <div role="img" aria-label={`Weight-for-age chart with the 3rd, 15th, 50th, 85th and 97th percentile curves${line ? `. Latest: ${line}` : ''}`}>
            <Chart sex={growthSex} points={points} />
          </div>
          <div className="space-y-1">
            {line
              ? <p className="text-sm font-medium" data-testid="growth-latest">{line}</p>
              : <p className="text-sm text-muted-foreground">Add a weight to see where {babyName} is on the chart.</p>}
            <p className="text-xs text-muted-foreground">Babies often move between lines in the first weeks. Your midwife or paediatrician looks at the trend.</p>
          </div>
        </>
      )}
      {birthDate && !growthSex && label && <p className="text-sm" data-testid="growth-latest">{label}</p>}
      <AddWeight onSaveWeight={onSaveWeight} birthDate={birthDate} />
    </section>
  );
}
