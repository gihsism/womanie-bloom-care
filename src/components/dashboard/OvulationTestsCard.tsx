import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/integrations/db/client';
import { onHealthDataChange, emitHealthDataChange } from '@/lib/data-events';
import { learnLuteal, parseBbtC, METHOD_TEXT, type SignalLike } from '@/lib/ovulation';
import {
  fertileWindow, windowHeadline, cycleChartPoints, parseOpk, setOpkInNotes, setBbtInNotes,
  parseTypedBbt, parseYmd, ymd, type OpkResult, type FertileWindow,
} from '@/lib/ttc';
import { cn } from '@/lib/utils';
import { TestTube2, Thermometer } from 'lucide-react';

// TTC stage: today's ovulation test (negative / positive / peak, one tap),
// today's temperature, and the cycle's temperature chart with the tests
// laid over it. The fertile window moves when a positive test is logged
// and closes when the temperature rise confirms ovulation (lib/ttc.ts).
// Both values live in daily_health_signals.notes, the same segments the
// daily log writes, so the two surfaces never disagree.

interface Props {
  lastPeriodStart?: Date;
  cycleLength: number;
}

interface Row { signal_date: string; notes: string | null; discharge: string | null }

const OPK_CHOICES: { id: OpkResult; label: string }[] = [
  { id: 'negative', label: 'Negative' },
  { id: 'positive', label: 'Positive' },
  { id: 'peak', label: 'Peak' },
];

const short = (d: Date) => format(d, 'd MMM');

export default function OvulationTestsCard({ lastPeriodStart, cycleLength }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [starts, setStarts] = useState<string[]>([]);
  const [bbtInput, setBbtInput] = useState('');
  const [saving, setSaving] = useState(false);
  const today = ymd(new Date());

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [sig, per] = await Promise.all([
        db.from('daily_health_signals').select('signal_date, notes, discharge')
          .eq('user_id', user.id).gte('signal_date', format(subDays(new Date(), 200), 'yyyy-MM-dd')),
        db.from('period_tracking').select('period_start_date').eq('user_id', user.id),
      ]);
      setRows(((sig.data as Row[]) ?? []).map(r => ({ ...r, signal_date: String(r.signal_date).slice(0, 10) })));
      setStarts(((per.data as Array<{ period_start_date: string }>) ?? []).map(r => String(r.period_start_date).slice(0, 10)));
    } catch {
      setRows([]);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => onHealthDataChange(load), [load]);

  const signals = useMemo(() => {
    const m: Record<string, SignalLike> = {};
    for (const r of rows) m[r.signal_date] = { notes: r.notes, discharge: r.discharge };
    return m;
  }, [rows]);

  const todayRow = rows.find(r => r.signal_date === today);
  const todayOpk = parseOpk(todayRow?.notes);
  const todayBbt = parseBbtC(todayRow?.notes);
  useEffect(() => { setBbtInput(todayBbt != null ? String(Math.round(todayBbt * 100) / 100) : ''); }, [todayBbt]);

  // The current cycle: the latest period start on record (or the profile's).
  const cycleStart = useMemo(() => {
    const latest = [...starts].sort().pop();
    if (latest) return parseYmd(latest);
    return lastPeriodStart ? new Date(lastPeriodStart.getFullYear(), lastPeriodStart.getMonth(), lastPeriodStart.getDate()) : null;
  }, [starts, lastPeriodStart]);

  const fw = useMemo<FertileWindow | null>(() => {
    if (!cycleStart) return null;
    const luteal = learnLuteal(starts, signals).lutealLength;
    return fertileWindow({ cycleStart, cycleLength, lutealLength: luteal, signals });
  }, [cycleStart, cycleLength, starts, signals]);

  const saveNotes = async (change: (notes: string | null) => string | null, done: string) => {
    if (!user) return;
    setSaving(true);
    try {
      const { data: existing } = await db.from('daily_health_signals').select('notes')
        .eq('user_id', user.id).eq('signal_date', today).maybeSingle();
      const notes = change((existing?.notes ?? null) as string | null);
      await db.from('daily_health_signals').upsert(
        { user_id: user.id, signal_date: today, notes },
        { onConflict: 'user_id,signal_date' },
      );
      emitHealthDataChange();
      toast({ title: done });
    } catch {
      toast({ title: 'Could not save', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const logOpk = (r: OpkResult) =>
    saveNotes(n => setOpkInNotes(n, todayOpk === r ? null : r), todayOpk === r ? 'Test result cleared' : `Ovulation test: ${r}`);

  const logBbt = () => {
    const c = parseTypedBbt(bbtInput);
    if (c == null) {
      toast({ title: 'Check the temperature', description: 'Enter it in °C, for example 36.55.', variant: 'destructive' });
      return;
    }
    saveNotes(n => setBbtInNotes(n, c), `Temperature ${c}°C saved`);
  };

  if (!cycleStart || !fw) {
    return (
      <Card className="p-4">
        <p className="text-sm font-semibold">Ovulation tests</p>
        <p className="text-xs text-muted-foreground mt-1">Log your last period to see your fertile window and test chart.</p>
      </Card>
    );
  }

  const chart = cycleChartPoints(cycleStart, signals);

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
          <TestTube2 className="h-4 w-4 text-primary" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-semibold">Ovulation tests</p>
          <p className="text-[11px] text-muted-foreground">Fertile window {short(fw.start)} – {short(fw.end)}</p>
        </div>
      </div>

      <p className="text-sm mb-3" data-testid="window-headline">{windowHeadline(fw)}</p>

      {/* Predicted vs what her body showed. */}
      <dl className="grid grid-cols-2 gap-2 mb-4 text-xs">
        <div className="rounded-lg border p-2.5">
          <dt className="text-muted-foreground">Predicted ovulation</dt>
          <dd className="font-medium mt-0.5">{short(fw.predicted)}</dd>
          <dd className="text-[10px] text-muted-foreground">from your cycle length</dd>
        </div>
        <div className="rounded-lg border p-2.5">
          <dt className="text-muted-foreground">{fw.source === 'confirmed' ? 'Confirmed ovulation' : fw.source === 'opk' ? 'Expected from your test' : 'Confirmed ovulation'}</dt>
          <dd className="font-medium mt-0.5">{fw.source === 'predicted' ? 'Not yet' : short(fw.ovulation)}</dd>
          <dd className="text-[10px] text-muted-foreground">
            {fw.source === 'confirmed' && fw.confirmed ? METHOD_TEXT[fw.confirmed.method]
              : fw.source === 'opk' ? 'the day after your first positive test'
              : 'a temperature rise confirms it'}
            {fw.source !== 'predicted' && fw.shiftDays !== 0
              ? ` · ${Math.abs(fw.shiftDays)} ${Math.abs(fw.shiftDays) === 1 ? 'day' : 'days'} ${fw.shiftDays > 0 ? 'later' : 'earlier'} than predicted`
              : ''}
          </dd>
        </div>
      </dl>

      {/* Today's test: one tap. */}
      <fieldset className="mb-3">
        <legend className="text-xs font-medium mb-1.5">Today's ovulation test</legend>
        <div className="grid grid-cols-3 gap-2">
          {OPK_CHOICES.map(c => (
            <Button
              key={c.id}
              type="button"
              variant={todayOpk === c.id ? 'default' : 'outline'}
              size="sm"
              aria-pressed={todayOpk === c.id}
              disabled={saving}
              onClick={() => logOpk(c.id)}
            >
              {c.label}
            </Button>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">Peak = the strongest reading on a digital test. Tap again to clear.</p>
      </fieldset>

      <div className="flex items-end gap-2 mb-4">
        <label className="flex-1 text-xs font-medium">
          <span className="flex items-center gap-1.5 mb-1"><Thermometer className="h-3.5 w-3.5" aria-hidden="true" />Waking temperature (°C)</span>
          <Input inputMode="decimal" placeholder="36.50" value={bbtInput} onChange={e => setBbtInput(e.target.value)} className="h-9" />
        </label>
        <Button type="button" size="sm" variant="outline" className="h-9" disabled={saving || !bbtInput} onClick={logBbt}>Save</Button>
      </div>

      <BbtChart chart={chart} fw={fw} cycleStart={cycleStart} cycleLength={cycleLength} />

      <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
        A positive test means ovulation is likely in the next 12 to 36 hours. A temperature rise that stays up for 3 days
        shows ovulation has happened. Neither is a form of contraception.
      </p>
    </Card>
  );
}

// ─── Temperature chart with the tests laid over it ───────────────────

function BbtChart({ chart, fw, cycleStart, cycleLength }: {
  chart: ReturnType<typeof cycleChartPoints>;
  fw: FertileWindow;
  cycleStart: Date;
  cycleLength: number;
}) {
  const W = 320, H = 170, L = 34, R = 8, T = 16, B = 40; // plot box; OPK strip lives in B
  const dayOf = (d: Date) => Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - cycleStart.getTime()) / 86_400_000) + 1;
  const maxDay = Math.max(chart.days, cycleLength, dayOf(fw.end) + 2);
  const temps = chart.temps.map(t => t.c);
  const lo = temps.length ? Math.min(...temps) - 0.1 : 36.0;
  const hi = temps.length ? Math.max(...temps) + 0.1 : 37.0;
  const span = Math.max(0.4, hi - lo);
  const x = (day: number) => L + ((day - 1) / Math.max(1, maxDay - 1)) * (W - L - R);
  const y = (c: number) => T + (1 - (c - lo) / span) * (H - T - B);
  const stripY = H - B + 14;

  const ticks = [1, 7, 14, 21, 28, 35].filter(d => d <= maxDay);
  const predDay = dayOf(fw.predicted);
  const ovDay = fw.source === 'predicted' ? null : dayOf(fw.ovulation);
  const line = chart.temps.map(t => `${x(t.day)},${y(t.c)}`).join(' ');
  const fmt = (c: number) => c.toFixed(2);
  const [hover, setHover] = useState<string | null>(null);

  return (
    <figure>
      <figcaption className="text-xs font-medium mb-1">This cycle: temperature and tests</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
        aria-label={`Temperature chart, ${chart.temps.length} readings, ${chart.opks.length} ovulation tests this cycle`}>
        {/* Fertile window band */}
        <rect x={x(dayOf(fw.start))} y={T} width={Math.max(2, x(dayOf(fw.end)) - x(dayOf(fw.start)))} height={H - T - B}
          fill="hsl(var(--primary))" opacity={0.1} rx={4} />
        {/* Recessive grid: low / high temperature */}
        {[lo + 0.05, hi - 0.05].map(c => (
          <g key={c}>
            <line x1={L} x2={W - R} y1={y(c)} y2={y(c)} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.2} />
            <text x={L - 4} y={y(c) + 3} textAnchor="end" fontSize={9} fill="hsl(var(--muted-foreground))">{fmt(c)}</text>
          </g>
        ))}
        {/* Predicted ovulation (dashed) and expected / confirmed (solid) */}
        <line x1={x(predDay)} x2={x(predDay)} y1={T - 4} y2={H - B} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" strokeWidth={1.5} />
        <text x={x(predDay)} y={T - 6} textAnchor="middle" fontSize={9} fill="hsl(var(--muted-foreground))">predicted</text>
        {ovDay != null && ovDay !== predDay && (
          <>
            <line x1={x(ovDay)} x2={x(ovDay)} y1={T - 4} y2={H - B} stroke="hsl(var(--primary))" strokeWidth={2} />
            <text x={x(ovDay)} y={T - 6} textAnchor="middle" fontSize={9} fill="hsl(var(--foreground))">
              {fw.source === 'confirmed' ? 'confirmed' : 'from test'}
            </text>
          </>
        )}
        {/* Temperatures */}
        {chart.temps.length > 1 && (
          <polyline points={line} fill="none" stroke="hsl(var(--foreground))" strokeOpacity={0.75} strokeWidth={2} strokeLinejoin="round" />
        )}
        {chart.temps.map(t => (
          <g key={t.date} onMouseEnter={() => setHover(`Day ${t.day} (${format(parseYmd(t.date), 'd MMM')}): ${fmt(t.c)}°C`)} onMouseLeave={() => setHover(null)}>
            <circle cx={x(t.day)} cy={y(t.c)} r={9} fill="transparent" />
            <circle cx={x(t.day)} cy={y(t.c)} r={3.5} fill="hsl(var(--foreground))" stroke="hsl(var(--card))" strokeWidth={2} />
            <title>{`Day ${t.day}: ${fmt(t.c)}°C`}</title>
          </g>
        ))}
        {/* Ovulation tests strip */}
        <text x={L - 4} y={stripY + 3} textAnchor="end" fontSize={9} fill="hsl(var(--muted-foreground))">test</text>
        {chart.opks.map(o => (
          <g key={o.date} onMouseEnter={() => setHover(`Day ${o.day} (${format(parseYmd(o.date), 'd MMM')}): test ${o.result}`)} onMouseLeave={() => setHover(null)}>
            <circle cx={x(o.day)} cy={stripY} r={9} fill="transparent" />
            <circle cx={x(o.day)} cy={stripY} r={o.result === 'peak' ? 5.5 : 4}
              fill={o.result === 'negative' ? 'hsl(var(--card))' : 'hsl(var(--primary))'}
              stroke={o.result === 'negative' ? 'hsl(var(--muted-foreground))' : 'hsl(var(--card))'} strokeWidth={o.result === 'negative' ? 1.5 : 2} />
            <title>{`Day ${o.day}: test ${o.result}`}</title>
          </g>
        ))}
        {/* Cycle-day axis */}
        {ticks.map(d => (
          <text key={d} x={x(d)} y={H - 4} textAnchor="middle" fontSize={9} fill="hsl(var(--muted-foreground))">{d === 1 ? 'day 1' : d}</text>
        ))}
      </svg>
      <p className="text-[11px] text-muted-foreground min-h-[1rem]" aria-live="polite">{hover ?? ' '}</p>

      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground mt-1">
        <li className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-primary/10 border border-primary/20" />fertile window</li>
        <li className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-foreground/75" />temperature</li>
        <li className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full border border-muted-foreground" />negative test</li>
        <li className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-primary" />positive / peak (larger)</li>
        <li className="flex items-center gap-1"><span className="inline-block w-3 border-t border-dashed border-muted-foreground" />predicted</li>
      </ul>

      {chart.temps.length + chart.opks.length > 0 ? (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground">Show as a table</summary>
          <table className="w-full mt-1">
            <thead><tr className="text-muted-foreground text-left"><th className="font-medium">Day</th><th className="font-medium">Date</th><th className="font-medium">Temp.</th><th className="font-medium">Test</th></tr></thead>
            <tbody>
              {[...new Set([...chart.temps.map(t => t.date), ...chart.opks.map(o => o.date)])].sort().map(date => {
                const t = chart.temps.find(p => p.date === date);
                const o = chart.opks.find(p => p.date === date);
                const day = t?.day ?? o?.day;
                return (
                  <tr key={date} className="border-t border-border/50">
                    <td>{day}</td><td>{format(parseYmd(date), 'd MMM')}</td><td>{t ? `${fmt(t.c)}°C` : '—'}</td><td className={cn(o && o.result !== 'negative' && 'font-medium')}>{o?.result ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </details>
      ) : (
        <p className="text-[11px] text-muted-foreground mt-2">No temperatures or tests this cycle yet. Log them above or in the daily log.</p>
      )}
    </figure>
  );
}
