import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { Plus, Trash2, CheckCircle2, Circle, Clock, Bell } from 'lucide-react';
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

const QUICK_TEMPLATES = [
  { title: 'Gonal-F Injection', event_type: 'injection', icon: '💉' },
  { title: 'Menopur Injection', event_type: 'injection', icon: '💉' },
  { title: 'Cetrotide Injection', event_type: 'injection', icon: '💉' },
  { title: 'Trigger Shot (Ovidrel)', event_type: 'injection', icon: '⏰' },
  { title: 'Progesterone', event_type: 'medication', icon: '💊' },
  { title: 'Prenatal Vitamins', event_type: 'medication', icon: '💊' },
  { title: 'Estrogen Patch', event_type: 'medication', icon: '💊' },
  { title: 'Blood Work', event_type: 'test', icon: '🩸' },
  { title: 'Ultrasound', event_type: 'appointment', icon: '🔬' },
  { title: 'Doctor Visit', event_type: 'appointment', icon: '👩‍⚕️' },
  { title: 'Egg Retrieval', event_type: 'procedure', icon: '🥚' },
  { title: 'Embryo Transfer', event_type: 'transfer', icon: '🌱' },
];

const REMINDER_OPTIONS = [
  { value: 0, label: 'At time' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
];

const IVFEventSheet = ({ open, onClose, date, events, onAddEvent, onToggleComplete, onDeleteEvent }: IVFEventSheetProps) => {
  const [mode, setMode] = useState<'list' | 'quick' | 'custom'>('list');
  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState('injection');
  const [eventTime, setEventTime] = useState('');
  const [description, setDescription] = useState('');
  const [remindMinutes, setRemindMinutes] = useState<number>(30);

  const resetForm = () => {
    setTitle('');
    setEventType('injection');
    setEventTime('');
    setDescription('');
    setRemindMinutes(30);
    setMode('list');
  };

  const handleAdd = () => {
    if (!title.trim()) return;
    onAddEvent({
      title: title.trim(),
      event_type: eventType,
      event_time: eventTime || null,
      description: description || null,
      remind_before_minutes: remindMinutes,
    });
    resetForm();
  };

  const handleQuickAdd = (template: typeof QUICK_TEMPLATES[0]) => {
    setTitle(template.title);
    setEventType(template.event_type);
    setMode('custom');
  };

  if (!date) return null;

  const dayEvents = events.filter(e => e.event_date === format(date, 'yyyy-MM-dd'));

  return (
    <Sheet open={open} onOpenChange={() => { onClose(); resetForm(); }}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
        <SheetHeader className="pb-3">
          <SheetTitle className="text-left">{format(date, 'EEEE, MMMM d')}</SheetTitle>
        </SheetHeader>

        {/* Existing events */}
        {dayEvents.length > 0 && (
          <div className="space-y-2 mb-4">
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
                    {ev.is_completed ? <CheckCircle2 className="h-5 w-5 text-secondary" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
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
        )}

        {dayEvents.length === 0 && mode === 'list' && (
          <p className="text-sm text-muted-foreground text-center py-3">No treatments scheduled</p>
        )}

        {/* Mode: list (default) — show quick-add buttons */}
        {mode === 'list' && (
          <div className="space-y-3">
            <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quick Add</h5>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_TEMPLATES.map((t, i) => (
                <button
                  key={i}
                  onClick={() => handleQuickAdd(t)}
                  className="flex items-center gap-2 p-2.5 rounded-xl border border-border bg-card hover:bg-muted/50 transition-all text-left active:scale-95"
                >
                  <span className="text-base">{t.icon}</span>
                  <span className="text-xs font-medium truncate">{t.title}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] text-muted-foreground">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <Button variant="outline" className="w-full gap-2 text-sm" onClick={() => setMode('custom')}>
              <Plus className="h-4 w-4" />
              Custom Treatment
            </Button>
          </div>
        )}

        {/* Mode: custom — full form */}
        {mode === 'custom' && (
          <div className="space-y-3 p-4 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5">
            <div className="flex items-center justify-between">
              <h5 className="text-sm font-semibold">
                {title ? `Add "${title}"` : 'New Treatment'}
              </h5>
              <button onClick={resetForm} className="text-xs text-muted-foreground hover:text-foreground">← Back</button>
            </div>

            <Input
              placeholder="Treatment name"
              value={title}
              onChange={e => setTitle(e.target.value)}
              autoFocus
            />

            {/* Type as visual chips */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Type</label>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(EVENT_TYPE_CONFIG).map(([key, c]) => {
                  const Icon = c.icon;
                  return (
                    <button
                      key={key}
                      onClick={() => setEventType(key)}
                      className={cn(
                        "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border",
                        eventType === key
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card hover:bg-muted/50 text-muted-foreground"
                      )}
                    >
                      <Icon className="h-3 w-3" />
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Time (optional)</label>
              <Input type="time" value={eventTime} onChange={e => setEventTime(e.target.value)} />
            </div>

            {/* Reminder as chips */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                <Bell className="h-3 w-3" /> Remind me
              </label>
              <div className="flex flex-wrap gap-1.5">
                {REMINDER_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setRemindMinutes(opt.value)}
                    className={cn(
                      "px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border",
                      remindMinutes === opt.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card hover:bg-muted/50 text-muted-foreground"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <Input placeholder="Notes (optional)" value={description} onChange={e => setDescription(e.target.value)} />

            <div className="flex gap-2 pt-1">
              <Button onClick={handleAdd} disabled={!title.trim()} className="flex-1 gap-2">
                <Plus className="h-4 w-4" />
                Add Treatment
              </Button>
              <Button variant="outline" onClick={resetForm}>Cancel</Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default IVFEventSheet;
