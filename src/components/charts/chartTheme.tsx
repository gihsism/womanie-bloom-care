import type { ReactNode } from 'react';
import type { LabelProps } from 'recharts';

// One chart hand for the whole app, drawn like the Home body-map plates:
// paper ground, no grid (or one faint hairline per y-tick), ink axis labels
// in DM Mono, her values as a 2px raspberry line with dots of at least 8px,
// reference ranges as a pale porcelain-stone band, tooltips as a paper slip.
// Every recharts chart spreads these props instead of inventing its own,
// so the next chart looks the same without anyone copying class strings.

const MONO = '"DM Mono", ui-monospace, Menlo, monospace';

export const CHART = {
  /** Ink: axis labels, markers, the "other" series. */
  ink: 'hsl(var(--foreground))',
  /** Raspberry: her own values, the one accent. */
  accent: 'hsl(var(--primary))',
  /** Secondary ink for quiet labels (AA on paper). */
  muted: 'hsl(var(--muted-foreground))',
  /** Porcelain stone: reference / healthy range band. */
  stone: 'hsl(var(--stone))',
  /** Paper: dot halos, bar separators. */
  paper: 'hsl(var(--card))',
  /** Out-of-range ink (burnt orange, never pink). */
  alert: 'hsl(var(--destructive))',
  font: MONO,
} as const;

/** Axis tick text: small DM Mono in ink. */
export const chartTick = {
  fontSize: 10,
  fontFamily: MONO,
  letterSpacing: '0.04em',
  fill: CHART.ink,
  fillOpacity: 0.78,
};

/** X axis: one hairline ink baseline, no tick marks. */
export const chartXAxis = {
  tick: chartTick,
  tickLine: false,
  axisLine: { stroke: CHART.ink, strokeOpacity: 0.35, strokeWidth: 1 },
  tickMargin: 6,
  minTickGap: 12,
} as const;

/** Y axis: labels only; the faint grid rules carry the scale. */
export const chartYAxis = {
  tick: chartTick,
  tickLine: false,
  axisLine: false,
  tickMargin: 2,
} as const;

/** Faint solid horizontal hairlines only (replaces recharts' dashed 3-3 grid). */
export const chartGrid = {
  vertical: false,
  stroke: CHART.ink,
  strokeOpacity: 0.08,
  strokeWidth: 1,
} as const;

/** A data line: 2px, round caps and joins, no entry animation. */
export const chartLine = {
  type: 'monotone',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  isAnimationActive: false,
} as const;

/** Dot: 8px, with a paper halo so it reads on top of the line and the band. */
export const chartDot = (color: string = CHART.accent) => ({ r: 4, fill: color, stroke: CHART.paper, strokeWidth: 1.5 });
export const chartActiveDot = (color: string = CHART.accent) => ({ r: 6, fill: color, stroke: CHART.paper, strokeWidth: 2 });

/** Reference / healthy range: pale stone band, no outline. */
// ifOverflow 'hidden' clips a range wider than the data (e.g. ferritin 15-150
// against readings of 18-42) to the plot instead of dropping the band.
export const chartBand = { fill: CHART.stone, fillOpacity: 0.45, stroke: 'none', ifOverflow: 'hidden' } as const;

/** A single threshold or marker line: solid ink hairline. */
export const chartRefLine = { stroke: CHART.ink, strokeOpacity: 0.45, strokeWidth: 1 } as const;

/** Small mono label for a band or marker line. */
export const chartRefLabel = (value: string | number, position: LabelProps['position'] = 'insideTopRight') => ({
  value,
  position,
  fontSize: 9,
  fontFamily: MONO,
  letterSpacing: '0.06em',
  fill: CHART.muted,
  // Paper halo so the label stays legible where it crosses a line or a bar.
  stroke: CHART.paper,
  strokeWidth: 3,
  paintOrder: 'stroke',
});

/** Hover cursor: a thin ink rule on line charts, a faint wash on bar charts. */
export const chartCursor = { stroke: CHART.ink, strokeOpacity: 0.3, strokeWidth: 1 } as const;
export const chartBarCursor = { fill: CHART.ink, fillOpacity: 0.05 } as const;

/** Bars: square shoulders with the smallest hint of a radius. */
export const chartBarRadius: [number, number, number, number] = [1, 1, 0, 0];

/** Legend in mono small caps, line glyphs (series told apart by line style, not colour alone). */
export const chartLegend = {
  iconType: 'plainline',
  wrapperStyle: {
    fontSize: 10,
    fontFamily: MONO,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: CHART.ink,
  },
} as const;

/** Paper-slip tooltip for recharts' default <Tooltip> renderer. */
export const chartTooltip = {
  contentStyle: {
    background: CHART.paper,
    border: '1px solid hsl(var(--foreground) / 0.25)',
    borderRadius: 2,
    boxShadow: 'none',
    padding: '6px 10px',
    fontSize: 12,
    color: CHART.ink,
  },
  labelStyle: {
    fontFamily: MONO,
    fontSize: 10,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: CHART.muted,
    marginBottom: 2,
  },
  itemStyle: { color: CHART.ink, padding: 0 },
  separator: ' ',
} as const;

/** Same slip, for charts that render their own tooltip content. */
export const chartSlipClass = 'rounded-sm border border-foreground/25 bg-card px-2.5 py-1.5 text-xs text-foreground';

export function ChartSlip({ label, children }: { label?: ReactNode; children?: ReactNode }) {
  return (
    <div className={chartSlipClass}>
      {label != null && <p className="label-mono !text-[10px] mb-0.5">{label}</p>}
      {children}
    </div>
  );
}

/**
 * Direct label for a line: pass as <LabelList content={...} /> to write the
 * value next to one point (usually the latest) instead of relying on a legend
 * or the tooltip.
 */
export function directLabel(atIndex: number, format: (v: number) => string, color: string = CHART.accent) {
  return function DirectLabel(props: { x?: number | string; y?: number | string; value?: number | string; index?: number }) {
    if (props.index !== atIndex || props.x == null || props.y == null || props.value == null) return null;
    const x = Number(props.x);
    const y = Number(props.y);
    return (
      <text x={x - 8} y={y - 10} textAnchor="end" fontFamily={MONO} fontSize={10} letterSpacing="0.04em" fill={color}>
        {format(Number(props.value))}
      </text>
    );
  };
}
