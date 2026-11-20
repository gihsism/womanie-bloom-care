import { useMemo } from 'react';
import { format } from 'date-fns';
import { Card } from '@/components/ui/card';
import type { LutealModel, ProgesteroneLab, SignalLike } from '@/lib/ovulation';
import { describeOvulation, listCompletedCycles, lutealSummary, NOT_DETECTED_TEXT } from '@/lib/ovulationHistory';

// "Last 6 cycles" — when she ovulated in each completed cycle, how we
// know, and the luteal phase it gives. Sits under the cycle calendar in
// the menstrual-cycle and conception modes.

interface OvulationHistoryCardProps {
  periodStarts: string[];
  signals: Record<string, SignalLike>;
  progesterone?: ProgesteroneLab | null;
  model: Pick<LutealModel, 'lutealLength' | 'source' | 'cycles'>;
}

const OvulationHistoryCard = ({ periodStarts, signals, progesterone, model }: OvulationHistoryCardProps) => {
  const cycles = useMemo(
    () => listCompletedCycles(periodStarts, signals, progesterone),
    [periodStarts, signals, progesterone],
  );
  if (cycles.length === 0) return null;

  return (
    <Card className="p-4">
      <p className="label-mono">Last {cycles.length === 1 ? 'cycle' : `${cycles.length} cycles`}</p>
      <h3 className="font-display text-xl mt-1">Ovulation history</h3>
      <p className="text-sm text-muted-foreground mt-1">{lutealSummary(model)}</p>

      <ul className="mt-3 divide-y divide-border border-t border-border">
        {cycles.map(c => (
          <li key={c.start.toISOString()} className="py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-display text-base" style={{ fontWeight: 450 }}>
                {format(c.start, 'd MMM yyyy')}
              </span>
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                <span className="font-display text-foreground" style={{ fontWeight: 450 }}>{c.length}</span> days
              </span>
            </div>
            {c.ovulation ? (
              <div className="mt-1.5 grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-sm">
                <span className="label-mono leading-5">Ovulation</span>
                <span className="min-w-0">
                  Day <span className="font-display" style={{ fontWeight: 450 }}>{c.ovulationDay}</span>
                  <span className="text-muted-foreground"> · {format(c.ovulation.date, 'd MMM')}</span>
                  <span className="block text-xs text-muted-foreground">{describeOvulation(c.ovulation)}</span>
                </span>
                <span className="label-mono leading-5">Luteal</span>
                <span>
                  <span className="font-display" style={{ fontWeight: 450 }}>{c.luteal}</span> days
                </span>
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">{NOT_DETECTED_TEXT}</p>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        Estimates from what you logged — not a medical test.
      </p>
    </Card>
  );
};

export default OvulationHistoryCard;
