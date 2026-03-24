import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';

interface LabResult {
  id: string;
  title: string;
  value: string | null;
  unit: string | null;
  reference_range: string | null;
  status: string | null;
  data_type: string;
}

interface ResultsRangeChartProps {
  medicalData: LabResult[];
}

interface ChartItem {
  title: string;
  value: number;
  low: number;
  high: number;
  unit: string;
  percent: number; // 0-100 where value falls in range (50 = middle)
  status: string | null;
}

const statusColor = (status: string | null) => {
  switch (status) {
    case 'normal': case 'expected': return 'bg-green-500';
    case 'abnormal': return 'bg-amber-500';
    case 'critical': return 'bg-red-500';
    default: return 'bg-primary';
  }
};

const statusBg = (status: string | null) => {
  switch (status) {
    case 'normal': case 'expected': return 'bg-green-100 dark:bg-green-900/20';
    case 'abnormal': return 'bg-amber-100 dark:bg-amber-900/20';
    case 'critical': return 'bg-red-100 dark:bg-red-900/20';
    default: return 'bg-muted';
  }
};

export default function ResultsRangeChart({ medicalData }: ResultsRangeChartProps) {
  const items = useMemo(() => {
    const labs = medicalData.filter(d =>
      d.data_type === 'lab_result' && d.value && d.reference_range && !isNaN(parseFloat(d.value))
    );

    const results: ChartItem[] = [];
    const seen = new Set<string>();

    labs.forEach(lab => {
      if (seen.has(lab.title)) return;
      seen.add(lab.title);

      const val = parseFloat(lab.value!);
      const match = lab.reference_range!.match(/([\d.]+)\s*[-–]\s*([\d.]+)/);
      if (!match) return;

      const low = parseFloat(match[1]);
      const high = parseFloat(match[2]);
      const range = high - low;
      if (range <= 0) return;

      // Calculate position: extend range by 30% on each side for visualization
      const extLow = low - range * 0.3;
      const extHigh = high + range * 0.3;
      const extRange = extHigh - extLow;
      const percent = Math.max(0, Math.min(100, ((val - extLow) / extRange) * 100));

      results.push({
        title: lab.title,
        value: val,
        low,
        high,
        unit: lab.unit || '',
        percent,
        status: lab.status,
      });
    });

    // Sort: abnormal/critical first, then by name
    return results.sort((a, b) => {
      const order: Record<string, number> = { critical: 0, abnormal: 1, expected: 2, normal: 3 };
      const aOrder = order[a.status || 'normal'] ?? 3;
      const bOrder = order[b.status || 'normal'] ?? 3;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.title.localeCompare(b.title);
    });
  }, [medicalData]);

  if (items.length === 0) return null;

  // Calculate where the "healthy zone" is in the bar (30% to 70% of the extended range)
  const healthyStart = 23; // ~30% / 130% normalized
  const healthyEnd = 77;   // ~100% / 130% normalized

  return (
    <div>
      <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />
        Your Results vs Healthy Ranges
      </h3>
      <Card>
        <CardContent className="p-4 space-y-3">
          {items.map(item => (
            <div key={item.title} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium truncate flex-1">{item.title}</span>
                <span className={`text-xs font-mono font-bold ml-2 ${
                  item.status === 'critical' ? 'text-red-600' :
                  item.status === 'abnormal' ? 'text-amber-600' :
                  'text-green-600'
                }`}>
                  {item.value} {item.unit}
                </span>
              </div>
              <div className="relative h-5 rounded-full bg-muted overflow-hidden">
                {/* Healthy zone */}
                <div
                  className="absolute top-0 bottom-0 bg-green-200/50 dark:bg-green-900/20"
                  style={{ left: `${healthyStart}%`, width: `${healthyEnd - healthyStart}%` }}
                />
                {/* Value marker */}
                <div
                  className={`absolute top-0.5 bottom-0.5 w-2.5 rounded-full ${statusColor(item.status)} shadow-sm`}
                  style={{ left: `calc(${item.percent}% - 5px)` }}
                />
                {/* Range labels */}
                <span className="absolute left-1 top-0.5 text-[8px] text-muted-foreground">{item.low}</span>
                <span className="absolute right-1 top-0.5 text-[8px] text-muted-foreground">{item.high}</span>
              </div>
            </div>
          ))}
          <p className="text-[9px] text-muted-foreground pt-1">
            Green zone = healthy range. Dot shows where your value falls.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
