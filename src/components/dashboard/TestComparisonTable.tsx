import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';

interface LabResult {
  id: string;
  title: string;
  value: string | null;
  unit: string | null;
  reference_range: string | null;
  status: string | null;
  date_recorded: string | null;
  data_type: string;
}

interface TestComparisonTableProps {
  medicalData: LabResult[];
}

interface ComparisonRow {
  title: string;
  unit: string;
  readings: {
    date: string;
    value: number;
    status: string | null;
  }[];
  refRange: string | null;
  trend: 'improving' | 'worsening' | 'stable';
  changePercent: number;
  latestInRange: boolean;
}

const statusDot = (status: string | null) => {
  switch (status) {
    case 'normal': case 'expected': return 'bg-green-500';
    case 'abnormal': return 'bg-amber-500';
    case 'critical': return 'bg-red-500';
    default: return 'bg-muted-foreground';
  }
};

export default function TestComparisonTable({ medicalData }: TestComparisonTableProps) {
  const comparisons = useMemo(() => {
    const labs = medicalData.filter(
      d => d.data_type === 'lab_result' && d.value && !isNaN(parseFloat(d.value)) && d.date_recorded
    );

    // Group by title
    const byTitle: Record<string, LabResult[]> = {};
    labs.forEach(l => {
      const key = l.title;
      if (!byTitle[key]) byTitle[key] = [];
      byTitle[key].push(l);
    });

    // Only keep tests with 2+ readings
    const rows: ComparisonRow[] = [];
    Object.entries(byTitle).forEach(([title, items]) => {
      if (items.length < 2) return;

      const sorted = [...items].sort(
        (a, b) => new Date(a.date_recorded!).getTime() - new Date(b.date_recorded!).getTime()
      );

      const readings = sorted.map(l => ({
        date: format(new Date(l.date_recorded!), 'MMM d, yy'),
        value: parseFloat(l.value!),
        status: l.status,
      }));

      const first = readings[0].value;
      const last = readings[readings.length - 1].value;
      const changePercent = first > 0 ? Math.round(((last - first) / first) * 100) : 0;

      // Determine if latest is in range
      let latestInRange = true;
      const refRange = sorted[sorted.length - 1].reference_range;
      if (refRange) {
        const match = refRange.match(/([\d.]+)\s*[-–]\s*([\d.]+)/);
        if (match) {
          const low = parseFloat(match[1]);
          const high = parseFloat(match[2]);
          latestInRange = last >= low && last <= high;
        }
      }

      const latestStatus = sorted[sorted.length - 1].status;
      const firstStatus = sorted[0].status;
      let trend: 'improving' | 'worsening' | 'stable' = 'stable';
      if (Math.abs(changePercent) <= 5) trend = 'stable';
      else if ((firstStatus === 'abnormal' || firstStatus === 'critical') && (latestStatus === 'normal' || latestStatus === 'expected')) trend = 'improving';
      else if ((firstStatus === 'normal' || firstStatus === 'expected') && (latestStatus === 'abnormal' || latestStatus === 'critical')) trend = 'worsening';
      else if (latestInRange) trend = changePercent > 0 ? 'stable' : 'stable';
      else trend = 'worsening';

      rows.push({
        title,
        unit: sorted[0].unit || '',
        readings,
        refRange,
        trend,
        changePercent,
        latestInRange,
      });
    });

    // Sort: worsening first, then improving, then stable
    return rows.sort((a, b) => {
      const order = { worsening: 0, improving: 1, stable: 2 };
      return order[a.trend] - order[b.trend];
    });
  }, [medicalData]);

  if (comparisons.length === 0) return null;

  return (
    <div>
      <h3 className="text-sm font-bold mb-1 flex items-center gap-2">
        <ArrowRight className="h-4 w-4 text-primary" aria-hidden="true" />
        Test Comparison Over Time
      </h3>
      <p className="text-xs text-muted-foreground mb-3">
        Side-by-side comparison of tests taken at different times
      </p>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Test</th>
                  {comparisons.length > 0 && comparisons[0].readings.map((r, i) => (
                    <th key={i} className="text-center p-3 text-[10px] font-medium text-muted-foreground whitespace-nowrap">
                      {r.date}
                    </th>
                  ))}
                  <th className="text-center p-3 text-xs font-semibold text-muted-foreground">Change</th>
                </tr>
              </thead>
              <tbody>
                {comparisons.map(row => {
                  // Normalize column count to max readings
                  const maxReadings = Math.max(...comparisons.map(c => c.readings.length));

                  return (
                    <tr key={row.title} className="border-b border-border/50 last:border-0">
                      <td className="p-3">
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <span className="text-xs font-medium">{row.title}</span>
                          {row.unit && <span className="text-[9px] text-muted-foreground">({row.unit})</span>}
                        </div>
                        {row.refRange && (
                          <p className="text-[9px] text-muted-foreground mt-0.5">Range: {row.refRange}</p>
                        )}
                      </td>
                      {row.readings.map((reading, i) => (
                        <td key={i} className="text-center p-3">
                          <div className="flex items-center justify-center gap-1">
                            <div className={`w-1.5 h-1.5 rounded-full ${statusDot(reading.status)}`} />
                            <span className={`text-sm font-mono font-bold ${
                              reading.status === 'critical' ? 'text-red-600' :
                              reading.status === 'abnormal' ? 'text-amber-600' :
                              'text-foreground'
                            }`}>
                              {reading.value}
                            </span>
                          </div>
                        </td>
                      ))}
                      {/* Pad empty columns if this test has fewer readings */}
                      {Array.from({ length: maxReadings - row.readings.length }).map((_, i) => (
                        <td key={`empty-${i}`} className="text-center p-3">
                          <span className="text-muted-foreground">—</span>
                        </td>
                      ))}
                      <td className="text-center p-3">
                        <div className="flex items-center justify-center gap-1">
                          {row.trend === 'improving' ? (
                            <TrendingUp className="h-3.5 w-3.5 text-green-600" />
                          ) : row.trend === 'worsening' ? (
                            <TrendingDown className="h-3.5 w-3.5 text-amber-600" />
                          ) : (
                            <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          <span className={`text-xs font-semibold ${
                            row.trend === 'improving' ? 'text-green-600' :
                            row.trend === 'worsening' ? 'text-amber-600' :
                            'text-muted-foreground'
                          }`}>
                            {row.changePercent > 0 ? '+' : ''}{row.changePercent}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
