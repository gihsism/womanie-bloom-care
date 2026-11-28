import { format, parseISO } from 'date-fns';
import { DATE_FMT } from '@/lib/dateFormat';
import {
  ageLabel, chartXScale, chartYAxis, curveRows, CURVES, latestLine, MEASURES, measurementRows, measurePoints, normaliseSex,
  percentileShort, UNIT, type GrowthEventData, type GrowthMeasure, type MeasureCell, type MeasurePoint,
} from '@/lib/babyGrowth';

// The WHO growth charts and the measurement table for the printed
// paediatrician summary (/dashboard/baby/summary/print). Plain SVG with a
// viewBox, not recharts: it scales to the paper width when printing (a
// ResponsiveContainer may not re-measure before the print snapshot) and
// keeps the print chunk small. Same picture as the Growth tab: WHO
// 3rd/15th/50th/85th/97th curves in greys (3rd/97th dashed), her baby's
// points in black. Loaded lazily by the print page, with the WHO tables.

export interface GrowthPrintEvent { id: string; occurred_at: string; data?: GrowthEventData | null }

const TITLE: Record<GrowthMeasure, string> = { weight: 'Weight for age', length: 'Length for age', head: 'Head circumference for age' };
const localDate = (iso: string) => format(parseISO(iso), 'yyyy-MM-dd');

const W = 640;
const H = 210;
const M = { top: 8, right: 34, bottom: 22, left: 44 };

function PrintChart({ sex, points, measure }: { sex: 'female' | 'male'; points: MeasurePoint[]; measure: GrowthMeasure }) {
  const last = points[points.length - 1];
  const x = chartXScale(last?.day ?? 0);
  const curves = curveRows(sex, x.end, x.end <= 98 ? 2 : 7, measure);
  const pad = UNIT[measure] === 'kg' ? 0.2 : 0.5;
  const y = chartYAxis(
    Math.min(curves[0].p3, ...points.map(p => p.value)) - pad,
    Math.max(curves[curves.length - 1].p97, ...points.map(p => p.value)) + pad,
  );
  const px = (d: number) => M.left + (d / x.end) * (W - M.left - M.right);
  const py = (v: number) => M.top + (1 - (v - y.min) / (y.max - y.min)) * (H - M.top - M.bottom);
  const lastRow = curves[curves.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" data-testid={`print-growth-${measure}`}
      aria-label={`${TITLE[measure]} chart with the 3rd, 15th, 50th, 85th and 97th percentile curves`}>
      {y.ticks.map(t => (
        <g key={`y${t}`}>
          <line x1={M.left} x2={W - M.right} y1={py(t)} y2={py(t)} stroke="#e5e7eb" strokeWidth={0.75} />
          <text x={M.left - 4} y={py(t) + 3} fontSize={9} textAnchor="end" fill="#6b7280">{`${t} ${UNIT[measure]}`}</text>
        </g>
      ))}
      {x.ticks.map(t => (
        <g key={`x${t}`}>
          <line x1={px(t)} x2={px(t)} y1={M.top} y2={H - M.bottom} stroke="#e5e7eb" strokeWidth={0.75} />
          <text x={px(t)} y={H - M.bottom + 13} fontSize={9} textAnchor="middle" fill="#6b7280">{x.label(t)}</text>
        </g>
      ))}
      {CURVES.map(c => {
        const key = `p${c.p}`;
        const d = curves.map((r, i) => `${i ? 'L' : 'M'}${px(r.day).toFixed(1)},${py(r[key]).toFixed(1)}`).join('');
        return (
          <g key={key}>
            <path d={d} fill="none" stroke={c.p === 50 ? '#6b7280' : '#9ca3af'} strokeWidth={c.p === 50 ? 1.4 : 0.9}
              strokeDasharray={c.p === 3 || c.p === 97 ? '4 3' : undefined} />
            <text x={px(lastRow.day) + 4} y={py(lastRow[key]) + 3} fontSize={9} fill="#6b7280">{c.p === 3 ? '3rd' : `${c.p}th`}</text>
          </g>
        );
      })}
      {points.length > 1 && (
        <path d={points.map((p, i) => `${i ? 'L' : 'M'}${px(p.day).toFixed(1)},${py(p.value).toFixed(1)}`).join('')}
          fill="none" stroke="#111827" strokeWidth={1.6} />
      )}
      {points.map(p => <circle key={`${p.on}-${p.day}-${p.value}`} cx={px(p.day)} cy={py(p.value)} r={3} fill="#111827" stroke="#fff" strokeWidth={1} />)}
    </svg>
  );
}

function Cell({ c, unit }: { c: MeasureCell | null; unit: 'kg' | 'cm' }) {
  if (!c) return <td className="py-1 pl-2 text-right">—</td>;
  return (
    <td className="py-1 pl-2 text-right tabular-nums">
      <span className="whitespace-nowrap">{unit === 'kg' ? `${c.value.toFixed(2)} kg` : `${c.value} cm`}</span>
      {c.percentile !== null && <span className="block text-xs text-gray-600 whitespace-nowrap">({percentileShort(c.percentile)})</span>}
    </td>
  );
}

/** "Growth" section of the printed summary: the WHO charts that have points, then every measurement with its percentile. */
export default function BabyGrowthPrint({ birthDate, sex, events }: { birthDate: string | null; sex: string | null; events: GrowthPrintEvent[] }) {
  const growthSex = normaliseSex(sex);
  const rows = measurementRows(birthDate, growthSex, events, localDate);
  if (rows.length === 0) return null;
  const charts = birthDate && growthSex
    ? MEASURES.map(m => ({ m, points: measurePoints(m, birthDate, events, localDate) })).filter(c => c.points.length > 0)
    : [];
  const H2 = 'text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1';
  return (
    <section className="mb-4" data-section="growth">
      <h2 className={H2}>Growth</h2>
      {charts.map(({ m, points }) => {
        const last = points[points.length - 1];
        const line = growthSex ? latestLine(growthSex, last.day, last.value, m) : null;
        return (
          <figure key={m} className="mb-3 break-inside-avoid">
            <figcaption className="text-sm font-medium">{TITLE[m]}
              <span className="font-normal text-xs text-gray-600"> · WHO Child Growth Standards, {growthSex === 'male' ? 'boys' : 'girls'}, birth to 2 years</span>
            </figcaption>
            <PrintChart sex={growthSex as 'female' | 'male'} points={points} measure={m} />
            {line && <p className="text-xs">Latest: {line}</p>}
          </figure>
        );
      })}
      {birthDate && !growthSex && <p className="text-xs text-gray-600 mb-2">The WHO charts need the baby’s sex (girl or boy); add it on the Growth tab to print them.</p>}
      {!birthDate && <p className="text-xs text-gray-600 mb-2">The WHO charts need the birth date; add it on the Growth tab to print them.</p>}
      <table className="w-full text-sm border-collapse break-inside-avoid" data-testid="print-growth-table">
        <thead>
          <tr className="border-b border-gray-300 text-xs text-gray-500">
            <th className="text-left py-1 font-medium">Date</th>
            <th className="text-left py-1 pl-2 font-medium">Age</th>
            <th className="text-right py-1 pl-2 font-medium">Weight</th>
            <th className="text-right py-1 pl-2 font-medium">Length</th>
            <th className="text-right py-1 pl-2 font-medium">Head</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-b border-gray-100">
              <td className="py-1 pr-2 whitespace-nowrap">{format(parseISO(r.on), DATE_FMT)}</td>
              <td className="py-1 pl-2">{r.day !== null && r.day >= 0 ? ageLabel(r.day) : '—'}</td>
              <Cell c={r.weight} unit="kg" />
              <Cell c={r.length} unit="cm" />
              <Cell c={r.head} unit="cm" />
            </tr>
          ))}
        </tbody>
      </table>
      {charts.length > 0 && <p className="text-xs text-gray-500 mt-1">In brackets: the WHO percentile for the age on that day.</p>}
    </section>
  );
}
