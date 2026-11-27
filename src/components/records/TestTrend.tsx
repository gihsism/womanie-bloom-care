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
  LabelList,
} from 'recharts';
import {
  CHART, ChartSlip, chartActiveDot, chartBand, chartCursor, chartGrid, chartLine, chartRefLabel, chartXAxis, chartYAxis, directLabel,
} from '@/components/charts/chartTheme';

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
          <CartesianGrid {...chartGrid} />
          {hasRefRange && refLow !== undefined && refHigh !== undefined && (
            <ReferenceArea y1={refLow} y2={refHigh} {...chartBand} label={chartRefLabel('HEALTHY', 'insideTopLeft')} />
          )}
          <XAxis dataKey="date" {...chartXAxis} />
          <YAxis {...chartYAxis} width={36} domain={['auto', 'auto']} />
          <Tooltip
            cursor={chartCursor}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload;
              const isPredicted = d.date === 'Next?';
              return (
                <ChartSlip label={isPredicted ? 'Predicted' : d.date}>
                  <p className={isPredicted ? 'text-primary' : ''}>
                    <span className="font-medium">{d.value}{info.unit ? ` ${info.unit}` : ''}</span>
                  </p>
                  {d.refLow !== null && <p className="text-muted-foreground">Healthy range: {d.refLow}–{d.refHigh}</p>}
                </ChartSlip>
              );
            }}
          />
          <Line
            {...chartLine}
            dataKey="value"
            stroke={CHART.accent}
            activeDot={chartActiveDot()}
            dot={(props: { cx?: number; cy?: number; payload?: { date?: string } }) => {
              const { cx, cy, payload } = props;
              if (payload?.date === 'Next?') {
                return <circle key="predicted" cx={cx} cy={cy} r={4} fill={CHART.paper} stroke={CHART.accent} strokeWidth={1.5} strokeDasharray="2 2" />;
              }
              return <circle key={payload?.date} cx={cx} cy={cy} r={4} fill={CHART.accent} stroke={CHART.paper} strokeWidth={1.5} />;
            }}
          >
            <LabelList dataKey="value" content={directLabel(info.data.length - 1, v => `${v}${info.unit ? ` ${info.unit}` : ''}`)} />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-muted-foreground mt-1">Shaded band = healthy range. Open dot = predicted next value.</p>
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
