import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, startOfWeek, endOfWeek, addMonths, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight, Syringe, Pill, Stethoscope, Baby, FlaskConical, Clock, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface IVFEvent {
  id: string;
  user_id: string;
  event_date: string;
  event_time: string | null;
  event_type: string;
  title: string;
  description: string | null;
  is_completed: boolean;
  remind_before_minutes: number | null;
  created_at: string;
  updated_at: string;
}

interface IVFCalendarProps {
  events: IVFEvent[];
  currentPhase: string | null;
  onSelectDate: (date: Date) => void;
  selectedDate: Date | null;
}

const EVENT_TYPE_CONFIG: Record<string, { icon: typeof Syringe; color: string; label: string }> = {
  injection: { icon: Syringe, color: 'bg-primary text-primary-foreground', label: 'Injection' },
  medication: { icon: Pill, color: 'bg-secondary text-secondary-foreground', label: 'Medication' },
  appointment: { icon: Stethoscope, color: 'bg-accent text-accent-foreground', label: 'Appointment' },
  procedure: { icon: FlaskConical, color: 'bg-destructive text-destructive-foreground', label: 'Procedure' },
  transfer: { icon: Baby, color: 'bg-primary text-primary-foreground', label: 'Transfer' },
  test: { icon: Clock, color: 'bg-muted-foreground text-background', label: 'Test' },
};

const IVFCalendar = ({ events, currentPhase, onSelectDate, selectedDate }: IVFCalendarProps) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const eventsByDate = useMemo(() => {
    const map: Record<string, IVFEvent[]> = {};
    events.forEach(ev => {
      const key = ev.event_date;
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    });
    return map;
  }, [events]);

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentMonth]);

  const weeks = useMemo(() => {
    const w: Date[][] = [];
    for (let i = 0; i < calendarDays.length; i += 7) w.push(calendarDays.slice(i, i + 7));
    return w;
  }, [calendarDays]);

  const today = new Date();
  const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm">Treatment Calendar</h4>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth(m => subMonths(m, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[100px] text-center">
            {format(currentMonth, 'MMMM yyyy')}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth(m => addMonths(m, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1">
        {weekDays.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-medium text-muted-foreground py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="space-y-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map(date => {
              const dateKey = format(date, 'yyyy-MM-dd');
              const dayEvents = eventsByDate[dateKey] || [];
              const isToday = isSameDay(date, today);
              const inMonth = isSameMonth(date, currentMonth);
              const isSelected = selectedDate && isSameDay(date, selectedDate);
              const hasEvents = dayEvents.length > 0;
              const allCompleted = hasEvents && dayEvents.every(e => e.is_completed);
              const hasUpcoming = hasEvents && dayEvents.some(e => !e.is_completed);

              return (
                <button
                  key={date.toISOString()}
                  onClick={() => onSelectDate(date)}
                  className={cn(
                    "relative aspect-square flex flex-col items-center justify-center rounded-lg transition-all text-xs",
                    "hover:scale-105 active:scale-95",
                    inMonth ? 'opacity-100' : 'opacity-25',
                    isToday && !isSelected && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
                    isSelected && 'ring-2 ring-foreground ring-offset-1 ring-offset-background bg-muted',
                    hasUpcoming && !isSelected && 'bg-primary/10',
                    allCompleted && !isSelected && 'bg-secondary/10'
                  )}
                >
                  <span className="font-semibold">{format(date, 'd')}</span>
                  {hasEvents && (
                    <div className="absolute -bottom-0.5 flex gap-0.5">
                      {dayEvents.slice(0, 3).map((ev, i) => {
                        const config = EVENT_TYPE_CONFIG[ev.event_type] || EVENT_TYPE_CONFIG.injection;
                        return (
                          <div
                            key={i}
                            className={cn(
                              "w-1.5 h-1.5 rounded-full",
                              ev.is_completed ? 'bg-secondary' : 'bg-primary'
                            )}
                          />
                        );
                      })}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 pt-2 border-t">
        {Object.entries(EVENT_TYPE_CONFIG).slice(0, 4).map(([key, config]) => {
          const Icon = config.icon;
          return (
            <div key={key} className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Icon className="h-3 w-3" />
              <span>{config.label}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

export default IVFCalendar;
export { EVENT_TYPE_CONFIG };
