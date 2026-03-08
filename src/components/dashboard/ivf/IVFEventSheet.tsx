import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { Trash2, CheckCircle2, Circle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { IVFEvent } from './IVFCalendar';
import { EVENT_TYPE_CONFIG } from './IVFCalendar';

interface IVFEventSheetProps {
  open: boolean;
  onClose: () => void;
  date: Date | null;
  events: IVFEvent[];
  onAddEvent: (event: { title: string; event_type: string; event_time: string | null; description: string | null; remind_before_minutes: number | null }) => void;
  onToggleComplete: (eventId: string, completed: boolean) => void;
  onDeleteEvent: (eventId: string) => void;
}

const QUICK_ITEMS = [
  { title: 'Gonal-F', type: 'injection', icon: '💉', time: '20:00' },
  { title: 'Menopur', type: 'injection', icon: '💉', time: '20:00' },
  { title: 'Cetrotide', type: 'injection', icon: '💉', time: '08:00' },
  { title: 'Trigger Shot', type: 'injection', icon: '⏰', time: null },
  { title: 'Progesterone', type: 'medication', icon: '💊', time: '09:00' },
  { title: 'Vitamins', type: 'medication', icon: '💊', time: '09:00' },
  { title: 'Blood Work', type: 'test', icon: '🩸', time: null },
  { title: 'Ultrasound', type: 'appointment', icon: '🔬', time: null },
  { title: 'Doctor Visit', type: 'appointment', icon: '👩‍⚕️', time: null },
  { title: 'Egg Retrieval', type: 'procedure', icon: '🥚', time: null },
  { title: 'Transfer', type: 'transfer', icon: '🌱', time: null },
  { title: 'Beta Test', type: 'test', icon: '🩸', time: null },
];

const IVFEventSheet = ({ open, onClose, date, events, onAddEvent, onToggleComplete, onDeleteEvent }: IVFEventSheetProps) => {
  if (!date) return null;

  const dayEvents = events.filter(e => e.event_date === format(date, 'yyyy-MM-dd'));

  const handleQuickAdd = (item: typeof QUICK_ITEMS[0]) => {
    onAddEvent({
      title: item.title,
      event_type: item.type,
      event_time: item.time,
      description: null,
      remind_before_minutes: 30,
    });
  };

  return (
    <Sheet open={open} onOpenChange={() => onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh] overflow-y-auto">
        <SheetHeader className="pb-2">
          <SheetTitle className="text-left text-base">{format(date, 'EEE, MMM d')}</SheetTitle>
        </SheetHeader>

        {/* Existing events */}
        {dayEvents.length > 0 && (
          <div className="space-y-1.5 mb-4">
            {dayEvents.map(ev => (
              <div
                key={ev.id}
                className={cn(
                  "flex items-center gap-2.5 p-2.5 rounded-xl border",
                  ev.is_completed ? "bg-secondary/10 border-secondary/20 opacity-60" : "border-border"
                )}
              >
                <button onClick={() => onToggleComplete(ev.id, !ev.is_completed)} className="flex-shrink-0">
                  {ev.is_completed ? <CheckCircle2 className="h-5 w-5 text-secondary" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
                </button>
                <div className="flex-1 min-w-0">
                  <span className={cn("text-sm font-medium", ev.is_completed && "line-through")}>{ev.title}</span>
                  {ev.event_time && (
                    <span className="text-xs text-muted-foreground ml-2">{ev.event_time.slice(0, 5)}</span>
                  )}
                </div>
                <button onClick={() => onDeleteEvent(ev.id)} className="text-destructive/40 hover:text-destructive flex-shrink-0 p-1">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* One-tap add */}
        <p className="text-xs text-muted-foreground mb-2">Tap to add:</p>
        <div className="grid grid-cols-3 gap-2">
          {QUICK_ITEMS.map((item, i) => (
            <button
              key={i}
              onClick={() => handleQuickAdd(item)}
              className="flex flex-col items-center gap-1 p-3 rounded-xl border border-border hover:bg-primary/5 hover:border-primary/30 transition-all active:scale-95"
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-[11px] font-medium text-center leading-tight">{item.title}</span>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default IVFEventSheet;
