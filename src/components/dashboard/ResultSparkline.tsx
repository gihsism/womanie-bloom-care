// Tiny inline sparkline for a single test across the user's history.
//
// Used inside per-doc ResultCards on Medical History so a user seeing
// e.g. "Ferritin: 42 μg/L" can tell at a glance whether that's
// trending up or down from prior readings — without opening the
// trends card.

interface Point {
  value: number;
  date: string; // ISO
  status: string | null;
}

interface Props {
  points: Point[];
  width?: number;
  height?: number;
}

const STATUS_COLOR: Record<string, string> = {
  critical: '#dc2626', // red-600
  abnormal: '#d97706', // amber-600
  normal: '#16a34a', // green-600
  expected: '#16a34a',
};

function statusStroke(s: string | null): string {
  return (s && STATUS_COLOR[s]) || '#6b7280'; // muted
}

export default function ResultSparkline({ points, width = 96, height = 28 }: Props) {
  if (points.length < 2) return null;

  // Sort by date ascending so time reads left-to-right.
  const sorted = [...points].sort(
    (a, b) => Date.parse(a.date) - Date.parse(b.date)
  );
  const values = sorted.map(p => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const padding = 3;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  const xStep = sorted.length > 1 ? innerW / (sorted.length - 1) : 0;
  const toX = (i: number) => padding + i * xStep;
  const toY = (v: number) => padding + innerH - ((v - min) / range) * innerH;

  const pathD = sorted
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(p.value).toFixed(1)}`)
    .join(' ');

  const latest = sorted[sorted.length - 1];
  const strokeColor = statusStroke(latest.status);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className="inline-block"
    >
      <path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.6}
      />
      {sorted.map((p, i) => (
        <circle
          key={i}
          cx={toX(i)}
          cy={toY(p.value)}
          r={i === sorted.length - 1 ? 2.5 : 1.5}
          fill={statusStroke(p.status)}
          opacity={i === sorted.length - 1 ? 1 : 0.6}
        />
      ))}
    </svg>
  );
}
