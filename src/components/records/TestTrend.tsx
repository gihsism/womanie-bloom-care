import { Badge } from '@/components/ui/badge';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
  ReferenceArea,
} from 'recharts';

// One test's history, shown inside that test's row on Records → Results.
// It replaces three separate page sections ("Results Breakdown", "How
// your results are changing", "Test Trends Over Time"): the change
// sentence, the chart with the healthy range and the predicted next
// value now sit with the test they describe.

export interface TrendPoint {
  date: string;
  value: number;
  refLow: number | null;
  refHigh: number | null;
}

export interface TrendInfo {
  data: TrendPoint[];
  unit: string;
  latestStatus: string | null;
}

export interface TrendSummary {
  trend: 'improving' | 'worsening' | 'stable';
  detail: string;
}

interface TestTrendProps {
  info: TrendInfo;
  summary?: TrendSummary;
}

export default function TestTrend({ info, summary }: TestTrendProps) {
  const hasRefRange = info.data.some(d => d.refLow !== null && d.refHigh !== null);
  const refLow = info.data.find(d => d.refLow !== null)?.refLow ?? undefined;
  const refHigh = info.data.find(d => d.refHigh !== null)?.refHigh ?? undefined;
  const latestVal = info.data[info.data.length - 1].value;
  const firstVal = info.data[0].value;
  const changePct = firstVal > 0 ? Math.round(((latestVal - firstVal) / firstVal) * 100) : 0;

  let predictedNext: number | null = null;
  if (info.data.length >= 3) {
    const vals = info.data.map(d => d.value);
    const avgChange = (vals[vals.length - 1] - vals[0]) / (vals.length - 1);
    predictedNext = Math.round((vals[vals.length - 1] + avgChange) * 100) / 100;
  }

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="flex items-start gap-2 mb-1">
        <p className="text-[11px] text-muted-foreground flex-1">
          {info.data.length} readings • {changePct > 0 ? '+' : ''}{changePct}% change
          {summary?.detail ? <> · {summary.detail}</> : null}
        </p>
        {summary && (
          <Badge variant="outline" className={`text-[10px] flex-shrink-0 ${
            summary.trend === 'worsening' ? 'text-destructive border-destructive/20' : 'text-muted-foreground border-border'
          }`}>
            {summary.trend === 'improving' ? 'Getting better' : summary.trend === 'worsening' ? 'Getting worse' : 'Stable'}
          </Badge>
        )}
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <ComposedChart data={[
          ...info.data,
          ...(predictedNext !== null ? [{ date: 'Next?', value: predictedNext, refLow: refLow ?? null, refHigh: refHigh ?? null }] : [])
        ]} margin={{ left: 0, right: 5, top: 5, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 9 }} />
          <YAxis tick={{ fontSize: 9 }} domain={['auto', 'auto']} />
          {hasRefRange && refLow !== undefined && refHigh !== undefined && (
            <ReferenceArea y1={refLow} y2={refHigh} fill="hsl(var(--muted-foreground))" fillOpacity={0.08} label={{ value: "Healthy", position: "insideTopLeft", fontSize: 8, fill: "hsl(var(--muted-foreground))" }} />
          )}
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload;
              const isPredicted = d.date === 'Next?';
              return (
                <div className="bg-background border border-border rounded-xl px-3 py-2 shadow-lg text-xs">
                  <p className={isPredicted ? 'text-primary font-medium' : ''}>
                    {isPredicted ? 'Predicted' : d.date}: <span className="font-medium">{d.value}{info.unit ? ` ${info.unit}` : ''}</span>
                  </p>
                  {d.refLow !== null && <p className="text-muted-foreground">Healthy range: {d.refLow}–{d.refHigh}</p>}
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={(props: { cx?: number; cy?: number; payload?: { date?: string } }) => {
              const { cx, cy, payload } = props;
              if (payload?.date === 'Next?') {
                return <circle key="predicted" cx={cx} cy={cy} r={4} fill="hsl(var(--primary))" stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="4 2" opacity={0.4} />;
              }
              return <circle key={payload?.date} cx={cx} cy={cy} r={3} fill="hsl(var(--primary))" />;
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-muted-foreground mt-1">Shaded area = healthy range. Faded dot = predicted next value.</p>
      {predictedNext !== null && (
        <p className="text-[10px] text-muted-foreground mt-1">
          We predict your next result could be around <span className="font-medium whitespace-nowrap">{predictedNext}{info.unit ? ` ${info.unit}` : ''}</span>{' '}
          {hasRefRange && refLow !== undefined && refHigh !== undefined && (
            <span className={predictedNext >= refLow && predictedNext <= refHigh ? 'text-muted-foreground' : 'text-destructive'}>
              ({predictedNext >= refLow && predictedNext <= refHigh ? 'in the healthy range' : 'outside healthy range'})
            </span>
          )}
        </p>
      )}
    </div>
  );
}
