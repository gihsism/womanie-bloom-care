import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { differenceInDays, addDays, format, parseISO } from 'date-fns';
import {
  Syringe,
  Calendar,
  Heart,
  Activity,
  Sparkles,
  Baby,
  FlaskConical,
  Timer,
  CheckCircle2,
  Circle,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── IVF phases ───
const IVF_PHASES = [
  { key: 'prep', label: 'Preparation', duration: '2–4 weeks', icon: '💊', description: 'Birth control or estrogen priming to synchronize your cycle', tips: ['Take medications on time', 'Reduce caffeine intake', 'Start CoQ10 and prenatal vitamins'] },
  { key: 'stimulation', label: 'Ovarian Stimulation', duration: '8–14 days', icon: '💉', description: 'Hormone injections to stimulate multiple egg growth', tips: ['Keep injection times consistent', 'Stay hydrated — aim for 2L/day', 'Avoid intense exercise', 'Attend all monitoring appointments'] },
  { key: 'trigger', label: 'Trigger Shot', duration: '1 day', icon: '⏰', description: 'Precisely timed injection to mature eggs before retrieval', tips: ['Timing is critical — follow exact schedule', 'Set multiple alarms', 'Arrange transport for retrieval day'] },
  { key: 'retrieval', label: 'Egg Retrieval', duration: '1 day', icon: '🥚', description: 'Eggs collected under light sedation (15–20 min procedure)', tips: ['Fast from midnight before', 'Wear comfortable clothing', 'Rest for 1–2 days after', 'Mild cramping and bloating is normal'] },
  { key: 'fertilization', label: 'Fertilization & Culture', duration: '3–6 days', icon: '🔬', description: 'Eggs fertilized and embryos monitored in the lab', tips: ['The clinic will update you on embryo progress', 'Try to stay busy and distracted', 'Day 3 or Day 5 transfer will be decided'] },
  { key: 'transfer', label: 'Embryo Transfer', duration: '1 day', icon: '🌱', description: 'One or two embryos placed into the uterus', tips: ['Full bladder may be needed', 'Procedure is painless (no sedation)', 'Rest the day of transfer', 'Start progesterone support as directed'] },
  { key: 'tww', label: 'Two-Week Wait (TWW)', duration: '10–14 days', icon: '🤞', description: 'Waiting period before pregnancy test (beta HCG)', tips: ['Avoid home pregnancy tests before beta day', 'Continue all medications', 'Gentle walking is fine', 'Be kind to yourself — this is the hardest part'] },
  { key: 'beta', label: 'Beta HCG Test', duration: '1 day', icon: '🩸', description: 'Blood test to confirm pregnancy', tips: ['Results usually same day', 'If positive, repeat in 48h to confirm doubling', 'If negative, discuss next steps with your doctor'] },
];

interface IVFTrackerProps {
  ivfStartDate: Date | null;
  ivfPhase: string | null;
  onSetIVFStart: (date: Date, phase: string) => void;
  onUpdatePhase: (phase: string) => void;
}

const IVFTracker = ({ ivfStartDate, ivfPhase, onSetIVFStart, onUpdatePhase }: IVFTrackerProps) => {
  const [startDateInput, setStartDateInput] = useState('');
  const [selectedStartPhase, setSelectedStartPhase] = useState('prep');

  const currentPhaseData = useMemo(() => {
    if (!ivfPhase) return null;
    return IVF_PHASES.find(p => p.key === ivfPhase) || IVF_PHASES[0];
  }, [ivfPhase]);

  const currentPhaseIndex = IVF_PHASES.findIndex(p => p.key === ivfPhase);
  const daysInPhase = ivfStartDate ? differenceInDays(new Date(), ivfStartDate) : 0;

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
            Track your IVF journey phase by phase. Select your current phase and when it started.
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
              <Input
                type="date"
                value={startDateInput}
                onChange={(e) => setStartDateInput(e.target.value)}
              />
            </div>
          </div>

          <Button
            onClick={() => {
              if (startDateInput) {
                onSetIVFStart(parseISO(startDateInput), selectedStartPhase);
              }
            }}
            disabled={!startDateInput}
            className="w-full max-w-xs"
          >
            Start Tracking
          </Button>
        </Card>
      </div>
    );
  }

  if (!currentPhaseData) return null;

  return (
    <div className="space-y-4">
      {/* Current phase status */}
      <div className="bg-gradient-to-br from-primary/10 via-secondary/5 to-accent/10 rounded-2xl p-5">
        <div className="text-center mb-4">
          <div className="text-5xl mb-2">{currentPhaseData.icon}</div>
          <div className="text-2xl font-semibold text-foreground mb-1">
            {currentPhaseData.label}
          </div>
          <div className="text-sm text-muted-foreground">
            Day {daysInPhase + 1} • Duration: {currentPhaseData.duration}
          </div>
          <Badge variant="secondary" className="mt-2">
            Phase {currentPhaseIndex + 1} of {IVF_PHASES.length}
          </Badge>
        </div>

        <p className="text-sm text-center text-muted-foreground max-w-sm mx-auto">
          {currentPhaseData.description}
        </p>
      </div>

      {/* Phase timeline */}
      <Card className="p-4 space-y-3">
        <h4 className="font-semibold flex items-center gap-2">
          <Timer className="h-4 w-4 text-primary" />
          IVF Journey
        </h4>
        <div className="space-y-1">
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
      </Card>

      {/* Tips for current phase */}
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

      {/* Quick phase advance */}
      {currentPhaseIndex < IVF_PHASES.length - 1 && (
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={() => onUpdatePhase(IVF_PHASES[currentPhaseIndex + 1].key)}
        >
          Move to {IVF_PHASES[currentPhaseIndex + 1].label}
          <ArrowRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
};

export default IVFTracker;
