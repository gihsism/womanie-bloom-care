import { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  buildTrends,
  hasAnyTrend,
  isHighBp,
  type BpTrend,
  type SymptomTrend,
  type Trend,
  type TrendsPayload,
} from '@/lib/patientTrends';

// Trends tab of the doctor's patient chart: small charts for what the
// patient already logs (cycle and period length, weight, blood pressure,
// basal temperature, symptom frequency). Only charts with data are shown,
// each with a one-line summary. Every chart has a "Show values" list so
// nothing depends on reading the line or its colour.
//
// Data: /api/doctors/patient-trends (approved connection required, every
// read logged for the patient). Fetched the first time the tab opens; the
// parent keeps the answer so switching tabs does not re-fetch.

const INK = 'hsl(var(--primary))';
const MUTED = 'hsl(var(--muted-foreground))';
const TICK = { fontSize: 10, fill: MUTED };

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; data: TrendsPayload };

interface PatientTrendsProps {
  patientId: string;
  cached: TrendsPayload | null;
  onLoaded: (data: TrendsPayload) => void;
}

export default function PatientTrends({ patientId, cached, onLoaded }: PatientTrendsProps) {
  const [state, setState] = useState<LoadState>(cached ? { kind: 'ready', data: cached } : { kind: 'loading' });

  useEffect(() => {
    if (cached) return;
    let alive = true;
    (async () => {
      try {
        const resp = await fetch(`/api/doctors/patient-trends?id=${encodeURIComponent(patientId)}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = (await resp.json()) as TrendsPayload;
        if (!alive) return;
        setState({ kind: 'ready', data });
        onLoaded(data);
      } catch (err) {
        console.error('Error loading trends:', err);
        if (alive) setState({ kind: 'error' });
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  if (state.kind === 'loading') {
    return (
      <div className="space-y-3" role="status" aria-busy="true" aria-label="Loading trends">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }
  if (state.kind === 'error') {
    return <p className="text-sm text-muted-foreground py-6 text-center">Trends could not be loaded. Please try again later.</p>;
  }

  const t = buildTrends(state.data);
  if (!hasAnyTrend(t)) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No trends yet. Charts appear here once she has logged at least a few periods, weights, blood-pressure
          readings, temperatures or symptoms in Womanie.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {t.cycle && <LineTrendCard title="Cycle length" trend={t.cycle} valueLabel="Cycle starting" refBand={[24, 38]} />}
      {t.period && <LineTrendCard title="Period length" trend={t.period} valueLabel="Period starting" />}
      {t.weight && <LineTrendCard title="Weight" trend={t.weight} valueLabel="Date" decimals={1} />}
      {t.bp && <BloodPressureCard trend={t.bp} />}
      {t.bbt && <LineTrendCard title="Basal temperature" trend={t.bbt} valueLabel="Date" decimals={2} />}
      {t.symptoms && <SymptomCard trend={t.symptoms} />}
      <p className="text-[11px] text-muted-foreground px-1">
        From what the patient logged herself in Womanie. Gaps in logging can make a cycle look longer.
      </p>
    </div>
  );
}

function TrendCard({ title, summary, children }: { title: string; summary: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-1 pt-4 px-4">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        <p className="text-sm text-foreground/80">{summary}</p>
      </CardHeader>
      <CardContent className="px-2 sm:px-4 pb-4">{children}</CardContent>
    </Card>
  );
}

function ValuesList({ headers, rows }: { headers: string[]; rows: Array<Array<string>> }) {
  return (
    <details className="mt-1 px-2 text-xs">
      <summary className="cursor-pointer text-muted-foreground py-1 min-h-[32px] flex items-center">Show values</summary>
      <table className="w-full mt-1 tabular-nums">
        <thead>
          <tr className="text-left text-muted-foreground">
            {headers.map(h => <th key={h} scope="col" className="font-medium py-0.5 pr-2">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border/50">
              {r.map((c, j) => <td key={j} className="py-0.5 pr-2">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function LineTrendCard({ title, trend, valueLabel, decimals = 0, refBand }: {
  title: string;
  trend: Trend;
  valueLabel: string;
  decimals?: number;
  refBand?: [number, number];
}) {
  const fmt = (v: number) => v.toFixed(decimals);
  return (
    <TrendCard title={title} summary={trend.summary}>
      <div role="img" aria-label={`${title} chart. ${trend.summary}`}>
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={trend.points} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
            <YAxis tick={TICK} tickLine={false} axisLine={false} width={44} domain={['auto', 'auto']} />
            {refBand && (
              <>
                <ReferenceLine y={refBand[0]} stroke={MUTED} strokeDasharray="4 4" label={{ value: `${refBand[0]}`, position: 'right', fontSize: 9, fill: MUTED }} />
                <ReferenceLine y={refBand[1]} stroke={MUTED} strokeDasharray="4 4" label={{ value: `${refBand[1]}`, position: 'right', fontSize: 9, fill: MUTED }} />
              </>
            )}
            <Tooltip
              cursor={{ stroke: MUTED, strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as Trend['points'][number];
                return (
                  <div className="bg-background border border-border rounded-lg px-2.5 py-1.5 shadow text-xs">
                    <p className="text-muted-foreground">{valueLabel} {d.label}</p>
                    <p className="font-medium">{fmt(d.value)} {trend.unit}</p>
                  </div>
                );
              }}
            />
            <Line type="monotone" dataKey="value" stroke={INK} strokeWidth={2} dot={{ r: 4, fill: INK, strokeWidth: 0 }} activeDot={{ r: 6 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {refBand && <p className="text-[11px] text-muted-foreground px-2">Dashed lines: typical range {refBand[0]}–{refBand[1]} {trend.unit}.</p>}
      <ValuesList
        headers={[valueLabel, `${title} (${trend.unit})`]}
        rows={[...trend.points].reverse().map(p => [p.label, fmt(p.value)])}
      />
    </TrendCard>
  );
}

function BloodPressureCard({ trend }: { trend: BpTrend }) {
  return (
    <TrendCard title="Blood pressure" summary={trend.summary}>
      <div role="img" aria-label={`Blood pressure chart. ${trend.summary}`}>
        <ResponsiveContainer width="100%" height={170}>
          <LineChart data={trend.points} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
            <YAxis tick={TICK} tickLine={false} axisLine={false} width={44} domain={[40, 'auto']} />
            <ReferenceLine y={140} stroke={MUTED} strokeDasharray="4 4" label={{ value: '140', position: 'right', fontSize: 9, fill: MUTED }} />
            <ReferenceLine y={90} stroke={MUTED} strokeDasharray="4 4" label={{ value: '90', position: 'right', fontSize: 9, fill: MUTED }} />
            <Tooltip
              cursor={{ stroke: MUTED, strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as BpTrend['points'][number];
                return (
                  <div className="bg-background border border-border rounded-lg px-2.5 py-1.5 shadow text-xs">
                    <p className="text-muted-foreground">{d.label}</p>
                    <p className="font-medium">{d.systolic}/{d.diastolic} mmHg{isHighBp(d.systolic, d.diastolic) ? ' (high)' : ''}</p>
                  </div>
                );
              }}
            />
            {/* Two series told apart by line style and the legend, not colour alone. */}
            <Legend verticalAlign="top" align="left" height={22} iconType="plainline" wrapperStyle={{ fontSize: 11, paddingLeft: 12 }} />
            <Line name="Systolic (top)" type="monotone" dataKey="systolic" stroke={INK} strokeWidth={2} dot={{ r: 4, fill: INK, strokeWidth: 0 }} isAnimationActive={false} />
            <Line name="Diastolic (bottom)" type="monotone" dataKey="diastolic" stroke={MUTED} strokeWidth={2} strokeDasharray="5 3" dot={{ r: 4, fill: MUTED, strokeWidth: 0 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-muted-foreground px-2">Dashed lines: 140 / 90 mmHg.</p>
      <ValuesList
        headers={['Date', 'mmHg', '']}
        rows={[...trend.points].reverse().map(p => [p.label, `${p.systolic}/${p.diastolic}`, isHighBp(p.systolic, p.diastolic) ? 'High' : ''])}
      />
    </TrendCard>
  );
}

function SymptomCard({ trend }: { trend: SymptomTrend }) {
  const max = Math.max(...trend.counts.map(c => c.days));
  return (
    <TrendCard title="Symptoms, last 90 days" summary={trend.summary}>
      <ul className="space-y-1.5 px-2 pt-1" aria-label="Days each symptom was logged">
        {trend.counts.map(c => (
          <li key={c.name} className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-2 text-xs">
            <span className="truncate" title={c.name}>{c.name}</span>
            <span className="h-2 rounded-full bg-muted overflow-hidden" aria-hidden="true">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(6, (c.days / max) * 100)}%` }} />
            </span>
            <span className="tabular-nums text-muted-foreground whitespace-nowrap">{c.days} day{c.days === 1 ? '' : 's'}</span>
          </li>
        ))}
      </ul>
    </TrendCard>
  );
}
