import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { emitHealthDataChange, onHealthDataChange } from '@/lib/data-events';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { differenceInDays, format, parseISO } from 'date-fns';
import { FlaskConical, Timer, CheckCircle2, ArrowRight, Sparkles, Heart } from '@/components/icons';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import IVFCalendar from './ivf/IVFCalendar';
import IVFEventSheet from './ivf/IVFEventSheet';
import IVFReminders from './ivf/IVFReminders';
import BetaHcgTracker from './BetaHcgTracker';
import IVFMedicationAdherence from './IVFMedicationAdherence';
import type { IVFEvent } from './ivf/IVFCalendar';
import IVFJourneyCard from './ivf/IVFJourneyCard';
import TriggerShotTimer from './ivf/TriggerShotTimer';
import TwoWeekWaitCard from './ivf/TwoWeekWaitCard';
import { deviceTz } from './ivf/ivfFormat';
import { useIvfPlan } from '@/hooks/useIvfPlan';
import { ivfStatus } from '@/lib/ivfJourney';

// ─── IVF phases ───
import { IVF_PHASES } from './ivfPhases';

interface IVFTrackerProps {
  ivfStartDate: Date | null;
  ivfPhase: string | null;
  onSetIVFStart: (date: Date, phase: string) => void;
  onUpdatePhase: (phase: string) => void;
  /** Home shows the IVF timeline hero (phase, day, tip), so skip the
   *  second status card and fold the phase list into "Change phase". */
  withHero?: boolean;
}

const IVFTracker = ({ ivfStartDate, ivfPhase, onSetIVFStart, onUpdatePhase, withHero = false }: IVFTrackerProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [startDateInput, setStartDateInput] = useState('');
  const [selectedStartPhase, setSelectedStartPhase] = useState('prep');
  const [events, setEvents] = useState<IVFEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // IVF journey: her clinic's dates (ivf_plans). The phase follows the
  // latest date reached; a phase she picks by hand stays until the next
  // date is reached.
  const ivf = useIvfPlan();
  const tz = useMemo(() => deviceTz(), []);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const status = useMemo(() => ivfStatus(ivf.plan, now, tz), [ivf.plan, now, tz]);
  const lastSynced = useRef<string | null>(null);
  useEffect(() => {
    if (!ivf.loaded || !status.phase || !status.phaseStart) return;
    const key = `${status.phase}|${status.phaseStart}`;
    if (lastSynced.current === key) return;
    lastSynced.current = key;
    const current = ivfStartDate ? format(ivfStartDate, 'yyyy-MM-dd') : null;
    if (status.phase === ivfPhase && status.phaseStart === current) return;
    const [y, m, d] = status.phaseStart.split('-').map(Number);
    onSetIVFStart(new Date(y, m - 1, d), status.phase);
    // Only when the derived phase changes; a hand-picked phase is not undone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ivf.loaded, status.phase, status.phaseStart]);

  const journey = (
    <IVFJourneyCard
      plan={ivf.plan} tz={tz} now={now} fallbackPhase={ivfPhase}
      serverOk={ivf.serverOk} saveState={ivf.saveState} onSave={ivf.save}
    />
  );
  const triggerWindow = ivf.plan.triggerAt
    ? now.getTime() < Date.parse(ivf.plan.triggerAt) + 48 * 3_600_000
    : ivfPhase === 'stimulation' || ivfPhase === 'trigger' || status.phase === 'stimulation';
  const showTww = status.phase === 'tww' || ivfPhase === 'tww' || (status.phase === 'transfer');

  // Load events
  const loadEvents = useCallback(async () => {
    if (!user) return;
    const { data } = await db
      .from('ivf_events')
      .select('*')
      .eq('user_id', user.id)
      .order('event_date', { ascending: true });
    if (data) setEvents(data as IVFEvent[]);
  }, [user]);

  useEffect(() => { loadEvents(); }, [loadEvents]);
  useEffect(() => onHealthDataChange(loadEvents), [loadEvents]);

  const handleSelectDate = (date: Date) => {
    setSelectedDate(date);
    setSheetOpen(true);
  };

  const handleAddEvent = async (ev: { title: string; event_type: string; event_time: string | null; description: string | null; remind_before_minutes: number | null }) => {
    if (!user || !selectedDate) return;
    const { error } = await db.from('ivf_events').insert({
      user_id: user.id,
      event_date: format(selectedDate, 'yyyy-MM-dd'),
      ...ev,
    });
    if (error) {
      toast({ title: 'Error', description: 'Failed to add event', variant: 'destructive' });
    } else {
      toast({ title: 'Treatment added', description: ev.title });
      emitHealthDataChange();
      loadEvents();
    }
  };

  const handleToggleComplete = async (eventId: string, completed: boolean) => {
    const { error } = await db.from('ivf_events').update({ is_completed: completed }).eq('id', eventId);
    if (!error) {
      emitHealthDataChange();
      loadEvents();
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    const { error } = await db.from('ivf_events').delete().eq('id', eventId);
    if (!error) {
      emitHealthDataChange();
      loadEvents();
    }
  };

  const handleMarkCompleteFromReminder = async (eventId: string) => {
    await handleToggleComplete(eventId, true);
    toast({ title: '✅ Treatment completed!', description: 'Great job staying on track.' });
  };

  const currentPhaseData = useMemo(() => {
    if (!ivfPhase) return null;
    return IVF_PHASES.find(p => p.key === ivfPhase) || IVF_PHASES[0];
  }, [ivfPhase]);

  const currentPhaseIndex = IVF_PHASES.findIndex(p => p.key === ivfPhase);
  const daysInPhase = ivfStartDate ? differenceInDays(new Date(), ivfStartDate) : 0;

  // Today's upcoming events count
  const todayEvents = useMemo(() => {
    const todayKey = format(new Date(), 'yyyy-MM-dd');
    return events.filter(e => e.event_date === todayKey && !e.is_completed);
  }, [events]);

  // ─── Setup screen ───
  if (!ivfStartDate || !ivfPhase) {
    return (
      <div className="space-y-4">
        <Card className="p-6 text-center space-y-4 border-dashed border-2 border-primary/30 bg-primary/5">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <FlaskConical className="h-7 w-7 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">Set up IVF Tracking</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Enter your clinic dates to see each phase, what is next, and reminders.
          </p>
          <div className="space-y-3 max-w-xs mx-auto text-left">
            <div className="space-y-2">
              <label className="text-sm font-medium">Current Phase</label>
              <div className="grid grid-cols-2 gap-2">
                {IVF_PHASES.slice(0, 6).map((phase) => (
                  <button
                    key={phase.key}
                    onClick={() => setSelectedStartPhase(phase.key)}
                    className={cn(
                      "text-left p-2.5 rounded-xl border-2 transition-all text-sm",
                      selectedStartPhase === phase.key
                        ? "border-primary bg-primary/10"
                        : "border-transparent bg-muted/50 hover:bg-muted"
                    )}
                  >
                    <span className="mr-1.5">{phase.icon}</span>
                    {phase.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Phase start date</label>
              <Input type="date" value={startDateInput} onChange={(e) => setStartDateInput(e.target.value)} />
            </div>
          </div>
          <Button
            onClick={() => { if (startDateInput) onSetIVFStart(parseISO(startDateInput), selectedStartPhase); }}
            disabled={!startDateInput}
            className="w-full max-w-xs"
          >
            Start Tracking
          </Button>
        </Card>
        <p className="text-xs text-center text-muted-foreground">Or add the dates from your clinic's plan and the phase follows them.</p>
        {journey}
      </div>
    );
  }

  if (!currentPhaseData) return null;

  return (
    <div className="space-y-4">
      {/* Reminders popup */}
      <IVFReminders events={events} onMarkComplete={handleMarkCompleteFromReminder} />

      {/* Today's treatments banner */}
      {todayEvents.length > 0 && (
        <Card className="p-3 bg-primary/5 border-primary/20">
          <div className="flex items-center gap-2 text-sm">
            <span className="animate-pulse">💉</span>
            <span className="font-medium">
              {todayEvents.length} treatment{todayEvents.length > 1 ? 's' : ''} remaining today
            </span>
            <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={() => { setSelectedDate(new Date()); setSheetOpen(true); }}>
              View
            </Button>
          </div>
        </Card>
      )}

      {/* IVF timeline from her clinic's dates, the trigger timer and the
          two-week wait. */}
      {journey}
      {triggerWindow && <TriggerShotTimer plan={ivf.plan} tz={tz} serverOk={ivf.serverOk} onSave={ivf.save} />}
      {showTww && <TwoWeekWaitCard plan={ivf.plan} tz={tz} now={now} />}

      {/* Current phase status */}
      {!withHero && <div className="bg-gradient-to-br from-primary/10 via-secondary/5 to-accent/10 rounded-2xl p-5">
        <div className="text-center mb-4">
          <div className="text-5xl mb-2">{currentPhaseData.icon}</div>
          <div className="text-2xl font-semibold text-foreground mb-1">{currentPhaseData.label}</div>
          <div className="text-sm text-muted-foreground">Tracking day {daysInPhase + 1} • Typical: {currentPhaseData.duration}</div>
          <Badge variant="secondary" className="mt-2">Phase {currentPhaseIndex + 1} of {IVF_PHASES.length}</Badge>
        </div>
        <p className="text-sm text-center text-muted-foreground max-w-sm mx-auto">{currentPhaseData.description}</p>
      </div>}

      {/* Treatment Calendar */}
      <IVFCalendar events={events} onSelectDate={handleSelectDate} selectedDate={selectedDate} />

      {/* Event sheet */}
      <IVFEventSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        date={selectedDate}
        events={events}
        onAddEvent={handleAddEvent}
        onToggleComplete={handleToggleComplete}
        onDeleteEvent={handleDeleteEvent}
      />

      {/* Phase timeline */}
      <Card className="p-4 space-y-3">
        <details open={!withHero} className="group">
        <summary className="font-semibold flex items-center gap-2 cursor-pointer list-none">
          <Timer className="h-4 w-4 text-primary" />
          {withHero ? 'Change phase' : 'IVF phases'}
          {withHero && <span className="ml-auto text-xs font-normal text-muted-foreground">{currentPhaseData.label}</span>}
        </summary>
        <div className="space-y-1 mt-3">
          {IVF_PHASES.map((phase, i) => {
            const isActive = phase.key === ivfPhase;
            const isPast = i < currentPhaseIndex;
            const isFuture = i > currentPhaseIndex;
            return (
              <button
                key={phase.key}
                onClick={() => onUpdatePhase(phase.key)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all",
                  isActive && "bg-primary/10 border border-primary/30",
                  isPast && "opacity-60",
                  isFuture && "opacity-40 hover:opacity-70",
                  !isActive && "hover:bg-muted/50"
                )}
              >
                <div className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs",
                  isPast && "bg-primary text-primary-foreground",
                  isActive && "bg-primary text-primary-foreground ring-2 ring-primary/30",
                  isFuture && "bg-muted text-muted-foreground"
                )}>
                  {isPast ? <CheckCircle2 className="h-4 w-4" /> : <span>{i + 1}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium flex items-center gap-1.5">
                    <span>{phase.icon}</span>
                    <span className="truncate">{phase.label}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{phase.duration}</div>
                </div>
                {isActive && <Badge variant="default" className="text-xs flex-shrink-0">Current</Badge>}
              </button>
            );
          })}
        </div>
        </details>
      </Card>

      {/* Tips */}
      <Card className="p-4 space-y-3">
        <h4 className="font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Tips for {currentPhaseData.label}
        </h4>
        <div className="space-y-2">
          {currentPhaseData.tips.map((tip, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <Heart className="h-3.5 w-3.5 text-secondary mt-0.5 flex-shrink-0" />
              <span>{tip}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Medication adherence — reads back the per-day "Medication"
          entries from the daily-log form. Self-hides when nothing has
          been logged yet, so users in the prep phase don't see an
          empty tile for medications they haven't started. */}
      <IVFMedicationAdherence />

      {/* Beta hCG tracker — surfaces during the two-week wait and beta
          phases when post-transfer hCG monitoring is the main thing
          on the patient's mind. Stays visible outside those phases too
          so users can log retrospectively. */}
      <BetaHcgTracker ivfPhase={ivfPhase} />

      {/* Quick advance */}
      {currentPhaseIndex < IVF_PHASES.length - 1 && (
        <Button variant="outline" className="w-full gap-2" onClick={() => onUpdatePhase(IVF_PHASES[currentPhaseIndex + 1].key)}>
          Move to {IVF_PHASES[currentPhaseIndex + 1].label}
          <ArrowRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
};

export default IVFTracker;
