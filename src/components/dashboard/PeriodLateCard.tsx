import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CalendarClock } from 'lucide-react';
import { periodLateHelp, periodLateHiddenKey } from '@/lib/periodLate';

// Home: the "period late?" note under Today (lib/periodLate.ts has the
// rule and the wording). "Hide" keeps it away until the next logged
// period (stored per device against the current period's start).

export default function PeriodLateCard({
  userId, mode, periodDaysUntil, lastPeriodStart, onLog,
}: {
  userId: string;
  mode: string | null | undefined;
  periodDaysUntil: number | null | undefined;
  lastPeriodStart: Date | null | undefined;
  onLog: () => void;
}) {
  const startKey = lastPeriodStart && !Number.isNaN(lastPeriodStart.getTime())
    ? `${lastPeriodStart.getFullYear()}-${lastPeriodStart.getMonth() + 1}-${lastPeriodStart.getDate()}`
    : '';
  const [hiddenFor, setHiddenFor] = useState<string | null>(() => {
    try { return localStorage.getItem(periodLateHiddenKey(userId)); } catch { return null; }
  });
  const help = periodLateHelp(mode, periodDaysUntil);
  if (!help || (startKey && hiddenFor === startKey)) return null;

  const hide = () => {
    try { localStorage.setItem(periodLateHiddenKey(userId), startKey); } catch { /* storage blocked */ }
    setHiddenFor(startKey);
  };

  return (
    <Card className="p-4 mb-5" data-testid="period-late-card">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-xl bg-secondary/10 flex items-center justify-center flex-shrink-0">
          <CalendarClock className="h-4 w-4 text-secondary" aria-hidden="true" />
        </div>
        <p className="font-display text-base font-medium leading-snug">{help.title}</p>
      </div>
      <div className="space-y-2 text-[13px] leading-snug text-muted-foreground">
        {help.lines.map(l => <p key={l}>{l}</p>)}
      </div>
      <div className="flex items-center gap-2 mt-3">
        <Button type="button" size="sm" variant="outline" onClick={onLog}>It started: log it</Button>
        <Button type="button" size="sm" variant="ghost" className="text-muted-foreground" onClick={hide}>Hide</Button>
      </div>
    </Card>
  );
}
