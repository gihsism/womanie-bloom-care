import { cn } from '@/lib/utils';

interface CalendarLegendProps {
  selectedMode: string;
}

const CalendarLegend = ({ selectedMode }: CalendarLegendProps) => {
  if (['pregnancy', 'menopause', 'post-menopause'].includes(selectedMode)) {
    return null;
  }

  const legendItems = [
    { label: 'Period', bgClass: 'bg-primary' },
    { label: 'Predicted', bgClass: 'bg-primary/15 border-2 border-dashed border-primary/40' },
    { label: 'Fertile', bgClass: 'bg-accent' },
    { label: 'Ovulation', bgClass: 'bg-secondary' },
    { label: 'PMS', bgClass: 'bg-amber-100 dark:bg-amber-900/30' },
  ];

  const signalItems = [
    { label: 'Symptoms', bgClass: 'bg-destructive' },
    { label: 'Intimacy', bgClass: 'bg-primary/70' },
    { label: 'Mood', bgClass: 'bg-secondary/70' },
  ];

  return (
    <div className="space-y-2 pt-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {legendItems.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className={cn("w-3 h-3 rounded-full", item.bgClass)} />
            <span className="text-xs text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {signalItems.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className={cn("w-2 h-2 rounded-full", item.bgClass)} />
            <span className="text-xs text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CalendarLegend;
