import { useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { Camera, Trash2 } from 'lucide-react';
import { DATE_FMT } from '@/lib/dateFormat';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ageLabel, chartXScale as xScale, chartYAxis as yAxis, curveRows, CURVES, latestLine, MEASURES, measurementRows, measurePoints, normaliseSex, parseCm,
  parseWeight, percentileShort, UNIT, valueLabel, type GrowthEventData, type GrowthMeasure, type GrowthSex, type MeasureCell, type MeasurePoint,
} from '@/lib/babyGrowth';

// WHO Child Growth Standards charts (birth-24 months): weight-, length- and
// head-circumference-for-age, picked with small tabs above the chart, and
// "Add a measurement" (date, weight typed or read from a photo of the
// scale and confirmed by her, optional length and head; one record).
// Loaded lazily from the Growth tab: recharts + the WHO tables stay out of
// the main bundle.
//
// Colours: WHO curves in muted greys (50th a little stronger, 3rd/97th
// dashed), her baby's points in the brand primary - one series stands out,
// the reference lines recede. Curve labels sit at the right end, as in
// the official charts.

export interface GrowthEventLike {
  id: string;
  occurred_at: string;
  data?: GrowthEventData | null;
}

/** One measurement record: any of weight, length and head (at least one). */
export interface MeasurementToSave {
  measuredOn: string;
  weightG: number | null;
  lengthCm: number | null;
  headCm: number | null;
  source: 'typed' | 'photo';
}

interface Props {
  babyName: string;
  birthDate: string | null;
  sex: string | null;
  events: GrowthEventLike[];
  onSaveMeasurement: (m: MeasurementToSave) => Promise<boolean>;
  onSetSex: (sex: GrowthSex) => Promise<boolean>;
  onSetBirthDate: (date: string) => Promise<boolean>;
  /** Remove a saved measurement (the list under the form). */
  onRemove?: (id: string) => unknown;
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

const TITLE: Record<GrowthMeasure, string> = { weight: 'Weight for age', length: 'Length for age', head: 'Head circumference for age' };
const TAB: Record<GrowthMeasure, string> = { weight: 'Weight', length: 'Length', head: 'Head' };
const NOUN: Record<GrowthMeasure, string> = { weight: 'weight', length: 'length', head: 'head circumference' };

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
      <p className="text-sm">The WHO growth charts are different for girls and boys. Is {babyName} a girl or a boy?</p>
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
      <p className="text-sm">Add {babyName}’s birth date to place the measurements on the chart.</p>
      <div className="flex items-end gap-2">
        <div className="flex-1"><Label htmlFor="gc-birth" className="text-xs">Birth date</Label><Input id="gc-birth" type="date" max={today()} value={date} onChange={e => setDate(e.target.value)} /></div>
        <Button size="sm" onClick={() => { void save(); }}>Save</Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function Chart({ sex, points, measure }: { sex: GrowthSex; points: MeasurePoint[]; measure: GrowthMeasure }) {
  const last = points[points.length - 1];
  const x = xScale(last?.day ?? 0);
  const curves = useMemo(() => curveRows(sex, x.end, x.end <= 98 ? 2 : 7, measure), [sex, x.end, measure]);
  const pad = UNIT[measure] === 'kg' ? 0.2 : 0.5;
  const y = yAxis(
    Math.min(curves[0].p3, ...points.map(p => p.value)) - pad,
    Math.max(curves[curves.length - 1].p97, ...points.map(p => p.value)) + pad,
  );
  const babyRows = points.map(p => ({ day: p.day, baby: p.value }));
  const lastIdx = curves.length - 1;

  return (
    <div className="h-64 w-full" data-testid="growth-chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart margin={{ top: 8, right: 34, bottom: 0, left: UNIT[measure] === 'kg' ? -12 : -2 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.6} />
          <XAxis type="number" dataKey="day" domain={[0, x.end]} ticks={x.ticks} tickFormatter={x.label}
            tick={axis} tickLine={false} axisLine={false} allowDuplicatedCategory={false} />
          <YAxis type="number" domain={[y.min, y.max]} ticks={y.ticks} tick={axis} tickLine={false} axisLine={false}
            width={UNIT[measure] === 'kg' ? 40 : 46} tickFormatter={(v: number) => `${v}`} unit={` ${UNIT[measure]}`} />
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

type Field = 'date' | 'weight' | 'length' | 'head';

function AddMeasurement({ onSaveMeasurement, birthDate }: { onSaveMeasurement: Props['onSaveMeasurement']; birthDate: string | null }) {
  const [date, setDate] = useState(today());
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState<'kg' | 'g'>('kg');
  const [length, setLength] = useState('');
  const [head, setHead] = useState('');
  const [source, setSource] = useState<'typed' | 'photo'>('typed');
  const [error, setError] = useState<{ field: Field; text: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = async () => {
    setSaved(null);
    const hasWeight = value.trim() !== '';
    if (!hasWeight && !length.trim() && !head.trim()) { setError({ field: 'weight', text: 'Enter a weight, length or head circumference.' }); return; }
    const w = hasWeight ? parseWeight(value, unit) : null;
    if (w && !w.ok) { setError({ field: 'weight', text: w.error }); return; }
    const l = parseCm(length, 'length');
    if (!l.ok) { setError({ field: 'length', text: l.error }); return; }
    const h = parseCm(head, 'head');
    if (!h.ok) { setError({ field: 'head', text: h.error }); return; }
    if (!date || date > today()) { setError({ field: 'date', text: 'Choose a date up to today.' }); return; }
    if (birthDate && date < birthDate) { setError({ field: 'date', text: 'Choose a date on or after the birth date.' }); return; }
    setError(null);
    const ok = await onSaveMeasurement({
      measuredOn: date,
      weightG: w && w.ok ? Math.round(w.kg * 1000) : null,
      lengthCm: l.cm,
      headCm: h.cm,
      source: hasWeight ? source : 'typed',
    });
    if (!ok) { setError({ field: 'weight', text: 'Could not save. Try again.' }); return; }
    setValue(''); setLength(''); setHead(''); setNote(null); setSource('typed'); setDate(today());
    setSaved('Measurement saved.');
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
      const body = (await resp.json().catch(() => ({}))) as { weight_kg?: number | null; confidence?: number; shown?: string; error?: string };
      if (!resp.ok) { setNote(body.error || 'The photo could not be read right now. Type the weight in instead.'); return; }
      if (typeof body.weight_kg !== 'number') {
        setNote('We couldn’t read a number on this photo. Try again with the display sharp and filling more of the picture, or type the weight in.');
        return;
      }
      setUnit('kg');
      setValue(String(body.weight_kg));
      setSource('photo');
      const unsure = (body.confidence ?? 0) < 0.6 ? ' We are not fully sure of every digit.' : '';
      const read = body.shown ? `${body.shown} (${body.weight_kg} kg)` : `${body.weight_kg} kg`;
      setNote(`Read from the photo: ${read}.${unsure} Check it matches the scale, correct it if needed, then tap Save measurement.`);
    } catch {
      setNote('The photo could not be read right now. Type the weight in instead.');
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const errFor = (f: Field) => (error?.field === f ? { 'aria-invalid': true as const, 'aria-describedby': 'am-error' } : {});

  return (
    <div className="space-y-2 border-t pt-3" data-testid="add-measurement">
      <p className="label-mono">Add a measurement</p>
      <div className="grid grid-cols-2 gap-2">
        <div><Label htmlFor="am-date" className="text-xs">Date</Label><Input id="am-date" type="date" max={today()} min={birthDate ?? undefined} value={date} {...errFor('date')} onChange={e => { setDate(e.target.value); setError(null); }} /></div>
        <div>
          <Label htmlFor="am-weight" className="text-xs">Weight ({unit})</Label>
          <Input id="am-weight" inputMode="decimal" value={value} placeholder={unit === 'kg' ? '4.6' : '4600'} {...errFor('weight')}
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
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={reading}>
          <Camera className="h-3.5 w-3.5 mr-1" />{reading ? 'Reading the scale…' : 'Photo of the scale'}
        </Button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" data-testid="scale-photo-input"
          aria-label="Photo of the scale" onChange={e => { void onPhoto(e.target.files?.[0]); }} />
      </div>
      {note && <p role="status" className="text-xs text-foreground bg-muted/50 rounded-md p-2" data-testid="scale-photo-note">{note}</p>}
      <div className="grid grid-cols-2 gap-2">
        <div><Label htmlFor="am-length" className="text-xs">Length (cm)</Label><Input id="am-length" inputMode="decimal" value={length} placeholder="54" {...errFor('length')} onChange={e => { setLength(e.target.value); setError(null); }} /></div>
        <div><Label htmlFor="am-head" className="text-xs">Head circumference (cm)</Label><Input id="am-head" inputMode="decimal" value={head} placeholder="37" {...errFor('head')} onChange={e => { setHead(e.target.value); setError(null); }} /></div>
      </div>
      {error && <p id="am-error" className="text-xs text-destructive">{error.text}</p>}
      <Button size="sm" onClick={() => { void save(); }} disabled={reading}>Save measurement</Button>
      {saved && <p role="status" className="text-sm text-primary">{saved}</p>}
      <p className="text-[10px] text-muted-foreground">Length and head circumference are optional. A photo is sent to Claude (Anthropic) only to read the number; it is not stored. Nothing is saved until you tap Save measurement.</p>
    </div>
  );
}

function Cell({ c, measure }: { c: MeasureCell | null; measure: GrowthMeasure }) {
  if (!c) return <td className="py-2 pl-2 text-right text-muted-foreground">—</td>;
  const v = measure === 'weight' ? `${c.value.toFixed(2)} kg` : `${c.value} cm`;
  return (
    <td className="py-2 pl-2 text-right tabular-nums whitespace-nowrap">
      {v}
      {c.percentile !== null && (
        <span className="block text-[11px] text-muted-foreground">{percentileShort(c.percentile)}<span className="sr-only"> percentile</span></span>
      )}
    </td>
  );
}

/** Her saved measurements, newest first, each value with its WHO percentile underneath. */
function MeasurementList({ rows, withPercentiles, onRemove }: {
  rows: ReturnType<typeof measurementRows>; withPercentiles: boolean; onRemove?: (id: string) => unknown;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="border-t pt-3 space-y-1" data-testid="growth-list">
      <p className="label-mono">Measurements</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] text-muted-foreground">
            <th className="text-left font-normal py-1">Date</th>
            <th className="text-right font-normal py-1 pl-2">Weight</th>
            <th className="text-right font-normal py-1 pl-2">Length</th>
            <th className="text-right font-normal py-1 pl-2">Head</th>
            {onRemove && <th className="w-8"><span className="sr-only">Remove</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-t align-top" data-testid="growth-row">
              <td className="py-2 pr-1">
                <span className="tabular-nums">{format(parseISO(r.on), DATE_FMT)}</span>
                {r.day !== null && r.day >= 0 && <span className="block text-[11px] text-muted-foreground">{ageLabel(r.day)}</span>}
              </td>
              <Cell c={r.weight} measure="weight" />
              <Cell c={r.length} measure="length" />
              <Cell c={r.head} measure="head" />
              {onRemove && (
                <td className="py-1.5 text-right">
                  <button type="button" onClick={() => { void onRemove(r.id); }} aria-label="Remove entry" className="p-2.5 -mr-2 text-muted-foreground/60 hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {withPercentiles && <p className="text-[11px] text-muted-foreground">Under each value: its WHO percentile for the age on that day.</p>}
    </div>
  );
}

function MeasureTabs({ measure, onChange }: { measure: GrowthMeasure; onChange: (m: GrowthMeasure) => void }) {
  return (
    <div role="tablist" aria-label="Chart" className="inline-flex rounded-md border p-0.5">
      {MEASURES.map(m => (
        <button key={m} type="button" role="tab" aria-selected={measure === m} onClick={() => onChange(m)}
          className={`text-xs px-3 py-1.5 rounded ${measure === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{TAB[m]}</button>
      ))}
    </div>
  );
}

export default function BabyGrowthChart({ babyName, birthDate, sex, events, onSaveMeasurement, onSetSex, onSetBirthDate, onRemove }: Props) {
  const [measure, setMeasure] = useState<GrowthMeasure>('weight');
  const growthSex = normaliseSex(sex);
  const points = useMemo(() => (birthDate ? measurePoints(measure, birthDate, events, localDate) : []), [measure, birthDate, events]);
  const last = points[points.length - 1];
  const line = growthSex && last ? latestLine(growthSex, last.day, last.value, measure) : null;
  const label = line ?? (last ? `${valueLabel(measure, last.value)} at ${ageLabel(last.day)}` : null);
  const rows = useMemo(() => measurementRows(birthDate, growthSex, events, localDate), [birthDate, growthSex, events]);

  return (
    <section className="space-y-3" aria-labelledby="gc-title">
      <div>
        <h4 id="gc-title" className="font-semibold text-sm">{TITLE[measure]}</h4>
        <p className="text-[11px] text-muted-foreground">WHO Child Growth Standards, {growthSex === 'male' ? 'boys' : growthSex === 'female' ? 'girls' : 'girls and boys'}, birth to 2 years</p>
      </div>
      {!birthDate && <BirthDatePicker babyName={babyName} onSetBirthDate={onSetBirthDate} />}
      {birthDate && !growthSex && <SexPicker babyName={babyName} onSetSex={onSetSex} />}
      {birthDate && growthSex && (
        <>
          <MeasureTabs measure={measure} onChange={setMeasure} />
          <div role="img" aria-label={`${TITLE[measure]} chart with the 3rd, 15th, 50th, 85th and 97th percentile curves${line ? `. Latest: ${line}` : ''}`}>
            <Chart sex={growthSex} points={points} measure={measure} />
          </div>
          <div className="space-y-1">
            {line
              ? <p className="text-sm font-medium" data-testid="growth-latest">{line}</p>
              : <p className="text-sm text-muted-foreground">Add a {NOUN[measure]} to see where {babyName} is on the chart.</p>}
            <p className="text-xs text-muted-foreground">Babies often move between lines in the first weeks. Your midwife or paediatrician looks at the trend.</p>
          </div>
        </>
      )}
      {birthDate && !growthSex && label && <p className="text-sm" data-testid="growth-latest">{label}</p>}
      <AddMeasurement onSaveMeasurement={onSaveMeasurement} birthDate={birthDate} />
      <MeasurementList rows={rows} withPercentiles={!!(birthDate && growthSex)} onRemove={onRemove} />
    </section>
  );
}
