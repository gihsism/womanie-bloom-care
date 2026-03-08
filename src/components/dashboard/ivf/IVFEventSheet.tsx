import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { format } from 'date-fns';
import { Plus, Trash2, CheckCircle2, Circle, Clock, Syringe, Pill, Stethoscope, FlaskConical, Baby } from 'lucide-react';
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

const REMINDER_OPTIONS = [
  { value: 0, label: 'At time of event' },
  { value: 15, label: '15 min before' },
  { value: 30, label: '30 min before' },
  { value: 60, label: '1 hour before' },
  { value: 120, label: '2 hours before' },
];

const IVFEventSheet = ({ open, onClose, date, events, onAddEvent, onToggleComplete, onDeleteEvent }: IVFEventSheetProps) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState('injection');
  const [eventTime, setEventTime] = useState('');
  const [description, setDescription] = useState('');
  const [remindMinutes, setRemindMinutes] = useState<number>(30);

  const handleAdd = () => {
    if (!title.trim()) return;
    onAddEvent({
      title: title.trim(),
      event_type: eventType,
      event_time: eventTime || null,
      description: description || null,
      remind_before_minutes: remindMinutes,
    });
    setTitle('');
    setEventType('injection');
    setEventTime('');
    setDescription('');
    setRemindMinutes(30);
    setShowAddForm(false);
  };

  if (!date) return null;

  const dayEvents = events.filter(e => e.event_date === format(date, 'yyyy-MM-dd'));

  return (
    <Sheet open={open} onOpenChange={() => onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-left">
            {format(date, 'EEEE, MMMM d')}
          </SheetTitle>
        </SheetHeader>

        {/* Existing events */}
        <div className="space-y-2 mb-4">
          {dayEvents.length === 0 && !showAddForm && (
            <p className="text-sm text-muted-foreground text-center py-4">No treatments scheduled for this day</p>
          )}
          {dayEvents.map(ev => {
            const config = EVENT_TYPE_CONFIG[ev.event_type] || EVENT_TYPE_CONFIG.injection;
            const Icon = config.icon;
            return (
              <div
                key={ev.id}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl border transition-all",
                  ev.is_completed ? "bg-secondary/10 border-secondary/20 opacity-70" : "bg-card border-border"
                )}
              >
                <button onClick={() => onToggleComplete(ev.id, !ev.is_completed)} className="flex-shrink-0">
                  {ev.is_completed ? (
                    <CheckCircle2 className="h-5 w-5 text-secondary" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground" />
                  )}
                </button>
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", config.color)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={cn("text-sm font-medium", ev.is_completed && "line-through")}>{ev.title}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {ev.event_time && <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{ev.event_time.slice(0, 5)}</span>}
                    <Badge variant="outline" className="text-[10px] px-1 py-0">{config.label}</Badge>
                  </div>
                  {ev.description && <p className="text-xs text-muted-foreground mt-1">{ev.description}</p>}
                </div>
                <button onClick={() => onDeleteEvent(ev.id)} className="text-destructive/50 hover:text-destructive flex-shrink-0">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Add event form */}
        {showAddForm ? (
          <div className="space-y-3 p-4 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5">
            <h5 className="text-sm font-semibold">Add Treatment</h5>
            <Input placeholder="e.g. Gonal-F injection" value={title} onChange={e => setTitle(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(EVENT_TYPE_CONFIG).map(([key, c]) => (
                    <SelectItem key={key} value={key}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="time" value={eventTime} onChange={e => setEventTime(e.target.value)} />
            </div>
            <Input placeholder="Notes (optional)" value={description} onChange={e => setDescription(e.target.value)} />
            <Select value={String(remindMinutes)} onValueChange={v => setRemindMinutes(Number(v))}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Reminder" />
              </SelectTrigger>
              <SelectContent>
                {REMINDER_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button onClick={handleAdd} disabled={!title.trim()} className="flex-1">Add</Button>
              <Button variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" className="w-full gap-2" onClick={() => setShowAddForm(true)}>
            <Plus className="h-4 w-4" />
            Add Treatment
          </Button>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default IVFEventSheet;
