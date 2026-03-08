import { useEffect, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, Syringe, Clock, CheckCircle2 } from 'lucide-react';
import { format, parseISO, differenceInMinutes, isToday } from 'date-fns';
import { cn } from '@/lib/utils';
import type { IVFEvent } from './IVFCalendar';
import { EVENT_TYPE_CONFIG } from './IVFCalendar';

interface IVFRemindersProps {
  events: IVFEvent[];
  onMarkComplete: (eventId: string) => void;
}

const IVFReminders = ({ events, onMarkComplete }: IVFRemindersProps) => {
  const [activeReminder, setActiveReminder] = useState<IVFEvent | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const checkReminders = useCallback(() => {
    const now = new Date();
    const todayEvents = events.filter(e => isToday(parseISO(e.event_date)) && !e.is_completed && e.event_time);

    for (const ev of todayEvents) {
      if (dismissedIds.has(ev.id)) continue;

      const eventDateTime = new Date(`${ev.event_date}T${ev.event_time}`);
      const minutesUntil = differenceInMinutes(eventDateTime, now);
      const remindAt = ev.remind_before_minutes ?? 30;

      if (minutesUntil <= remindAt && minutesUntil >= -5) {
        setActiveReminder(ev);
        return;
      }
    }
  }, [events, dismissedIds]);

  useEffect(() => {
    checkReminders();
    const interval = setInterval(checkReminders, 60000); // check every minute
    return () => clearInterval(interval);
  }, [checkReminders]);

  const handleDismiss = () => {
    if (activeReminder) {
      setDismissedIds(prev => new Set([...prev, activeReminder.id]));
    }
    setActiveReminder(null);
  };

  const handleComplete = () => {
    if (activeReminder) {
      onMarkComplete(activeReminder.id);
      setDismissedIds(prev => new Set([...prev, activeReminder.id]));
    }
    setActiveReminder(null);
  };

  if (!activeReminder) return null;

  const config = EVENT_TYPE_CONFIG[activeReminder.event_type] || EVENT_TYPE_CONFIG.injection;
  const Icon = config.icon;

  return (
    <Dialog open={!!activeReminder} onOpenChange={() => handleDismiss()}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
            <Bell className="h-8 w-8 text-primary" />
          </div>
          <DialogTitle className="text-lg">Treatment Reminder</DialogTitle>
          <DialogDescription>Time for your scheduled treatment</DialogDescription>
        </DialogHeader>

        <div className="p-4 rounded-xl bg-muted/50 space-y-3">
          <div className="flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", config.color)}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="font-semibold">{activeReminder.title}</div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {activeReminder.event_time?.slice(0, 5)}
                <Badge variant="outline" className="text-xs">{config.label}</Badge>
              </div>
            </div>
          </div>
          {activeReminder.description && (
            <p className="text-sm text-muted-foreground">{activeReminder.description}</p>
          )}
        </div>

        <div className="flex gap-2 mt-2">
          <Button onClick={handleComplete} className="flex-1 gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Done
          </Button>
          <Button variant="outline" onClick={handleDismiss} className="flex-1">
            Snooze
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default IVFReminders;
