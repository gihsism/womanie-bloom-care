import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { format, differenceInDays, addDays, isToday, parseISO } from 'date-fns';
import {
  Pill,
  Clock,
  CheckCircle2,
  Circle,
  Bell,
  Calendar,
  Shield,
  AlertTriangle,
  ChevronRight,
  RefreshCcw,
  Heart,
  Info,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const CONTRACEPTION_METHODS = [
  { id: 'pill', label: 'Birth Control Pill', emoji: '💊', effectiveness: '91-99%', schedule: 'Daily', description: 'Take at the same time every day for best protection.' },
  { id: 'patch', label: 'Patch', emoji: '🩹', effectiveness: '91-99%', schedule: 'Weekly', description: 'Change weekly for 3 weeks, then 1 week off.' },
  { id: 'ring', label: 'Vaginal Ring', emoji: '⭕', effectiveness: '91-99%', schedule: 'Monthly', description: 'Insert for 3 weeks, remove for 1 week.' },
  { id: 'injection', label: 'Injection (Depo)', emoji: '💉', effectiveness: '94-99%', schedule: 'Every 3 months', description: 'Get a shot every 12-13 weeks.' },
  { id: 'implant', label: 'Implant', emoji: '📍', effectiveness: '99%+', schedule: 'Every 3-5 years', description: 'Small rod under skin, lasts 3-5 years.' },
  { id: 'iud-hormonal', label: 'Hormonal IUD', emoji: '🔷', effectiveness: '99%+', schedule: 'Every 3-8 years', description: 'T-shaped device, lasts 3-8 years depending on brand.' },
  { id: 'iud-copper', label: 'Copper IUD', emoji: '🔶', effectiveness: '99%+', schedule: 'Every 10-12 years', description: 'Non-hormonal, lasts up to 12 years.' },
];

const SIDE_EFFECTS = [
  { id: 'headache', label: 'Headache', emoji: '🤕' },
  { id: 'nausea', label: 'Nausea', emoji: '🤢' },
  { id: 'mood-changes', label: 'Mood Changes', emoji: '🎭' },
  { id: 'spotting', label: 'Spotting', emoji: '🩸' },
  { id: 'breast-tenderness', label: 'Breast Tenderness', emoji: '😣' },
  { id: 'weight-change', label: 'Weight Change', emoji: '⚖️' },
  { id: 'low-libido', label: 'Low Libido', emoji: '💔' },
  { id: 'acne', label: 'Acne', emoji: '😔' },
];

interface ContraceptionDashboardProps {
  onNavigateToDoctorChat?: () => void;
}

export default function ContraceptionDashboard({ onNavigateToDoctorChat }: ContraceptionDashboardProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [pillsTakenToday, setPillsTakenToday] = useState(false);
  const [pillStreak, setPillStreak] = useState(0);
  const [packDay, setPackDay] = useState(1);
  const [trackedSideEffects, setTrackedSideEffects] = useState<Set<string>>(new Set());
  const [showMethodPicker, setShowMethodPicker] = useState(false);
  const [reminderTime, setReminderTime] = useState('21:00');

  // For demo purposes, set a default method
  useEffect(() => {
    if (!selectedMethod) setSelectedMethod('pill');
  }, []);

  const currentMethod = CONTRACEPTION_METHODS.find(m => m.id === selectedMethod);
  const isPillBased = ['pill', 'patch', 'ring'].includes(selectedMethod || '');

  const handleTakePill = () => {
    setPillsTakenToday(true);
    setPillStreak(s => s + 1);
    setPackDay(d => d >= 28 ? 1 : d + 1);
    toast({ title: '✅ Logged!', description: `${currentMethod?.label || 'Contraception'} taken for today.` });
  };

  const toggleSideEffect = (id: string) => {
    setTrackedSideEffects(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-5">
      {/* Current Method Card */}
      <Card className="p-5 bg-gradient-to-br from-primary/5 via-secondary/5 to-accent/5">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0 text-3xl">
            {currentMethod?.emoji || '💊'}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-bold">{currentMethod?.label || 'Select Method'}</h2>
              <Badge variant="secondary" className="text-[10px]">{currentMethod?.effectiveness}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-2">{currentMethod?.description}</p>
            <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setShowMethodPicker(!showMethodPicker)}>
              {showMethodPicker ? 'Close' : 'Change Method'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Method Picker */}
      {showMethodPicker && (
        <Card className="p-4">
          <h4 className="text-sm font-semibold mb-3">Select Your Method</h4>
          <div className="grid grid-cols-2 gap-2">
            {CONTRACEPTION_METHODS.map(method => (
              <button
                key={method.id}
                onClick={() => { setSelectedMethod(method.id); setShowMethodPicker(false); }}
                className={cn(
                  "flex items-center gap-2 p-3 rounded-xl border text-left transition-all",
                  selectedMethod === method.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"
                )}
              >
                <span className="text-xl">{method.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{method.label}</p>
                  <p className="text-[10px] text-muted-foreground">{method.effectiveness}</p>
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Daily Tracking (for pill/patch/ring) */}
      {isPillBased && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Daily Tracking
            </h3>
            <Badge variant={pillsTakenToday ? 'default' : 'outline'} className="text-xs">
              {pillsTakenToday ? '✓ Taken' : 'Not taken'}
            </Badge>
          </div>

          {!pillsTakenToday ? (
            <Button onClick={handleTakePill} className="w-full gap-2 h-12 text-base">
              <Pill className="h-5 w-5" />
              Mark as Taken
            </Button>
          ) : (
            <div className="text-center py-3 bg-secondary/10 rounded-xl">
              <CheckCircle2 className="h-8 w-8 text-secondary mx-auto mb-1" />
              <p className="text-sm font-medium">All done for today!</p>
              <p className="text-xs text-muted-foreground">Great job staying consistent 💪</p>
            </div>
          )}

          {/* Streak & Pack Progress */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="p-3 rounded-xl bg-muted/50 text-center">
              <p className="text-2xl font-bold text-primary">{pillStreak}</p>
              <p className="text-xs text-muted-foreground">Day streak 🔥</p>
            </div>
            <div className="p-3 rounded-xl bg-muted/50">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium">Pack Day</p>
                <p className="text-xs font-bold">{packDay}/28</p>
              </div>
              <Progress value={(packDay / 28) * 100} className="h-2" />
              <p className="text-[10px] text-muted-foreground mt-1">
                {packDay <= 21 ? `${21 - packDay} active pills left` : `${28 - packDay} placebo days left`}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Long-term method info */}
      {!isPillBased && currentMethod && (
        <Card className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <Shield className="h-5 w-5 text-primary" />
            <div>
              <h3 className="font-semibold">{currentMethod.label}</h3>
              <p className="text-xs text-muted-foreground">{currentMethod.schedule}</p>
            </div>
          </div>
          <div className="bg-secondary/10 rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-secondary">{currentMethod.effectiveness}</p>
            <p className="text-sm text-muted-foreground">Effectiveness rate</p>
          </div>
          <p className="text-xs text-muted-foreground mt-3 text-center">
            {currentMethod.description}
          </p>
        </Card>
      )}

      {/* Refill Reminder */}
      {isPillBased && (
        <Card className="p-4 border-primary/20 bg-primary/5">
          <div className="flex items-center gap-3">
            <RefreshCcw className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-medium">Refill Reminder</p>
              <p className="text-xs text-muted-foreground">
                {packDay <= 21 ? `${21 - packDay + 7} days until refill needed` : 'Time to get your refill!'}
              </p>
            </div>
            <Button variant="outline" size="sm" className="text-xs h-7">Set Reminder</Button>
          </div>
        </Card>
      )}

      {/* Side Effects Tracking */}
      <Card className="p-4">
        <h4 className="font-semibold flex items-center gap-2 mb-3">
          <Heart className="h-4 w-4 text-primary" />
          Track Side Effects
        </h4>
        <p className="text-xs text-muted-foreground mb-3">Tap any side effects you're experiencing to track them.</p>
        <div className="flex flex-wrap gap-2">
          {SIDE_EFFECTS.map(effect => {
            const isActive = trackedSideEffects.has(effect.id);
            return (
              <button
                key={effect.id}
                onClick={() => toggleSideEffect(effect.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
                  isActive ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted/50"
                )}
              >
                <span>{effect.emoji}</span>
                {effect.label}
              </button>
            );
          })}
        </div>
        {trackedSideEffects.size > 0 && (
          <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
            <Info className="h-3 w-3" />
            Tracking {trackedSideEffects.size} side effect(s). If severe, talk to your doctor.
          </p>
        )}
      </Card>

      {/* Important Info */}
      <Card className="p-4">
        <h4 className="font-semibold flex items-center gap-2 mb-3">
          <AlertTriangle className="h-4 w-4 text-primary" />
          Important Reminders
        </h4>
        <div className="space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <span className="text-primary">•</span>
            <span>Contraception does <strong>not</strong> protect against STIs. Use condoms for STI protection.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-primary">•</span>
            <span>If you miss a pill, take it as soon as you remember. Check your pill pack instructions.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-primary">•</span>
            <span>Vomiting or diarrhea within 2 hours of taking a pill may reduce effectiveness.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-primary">•</span>
            <span>Some medications (antibiotics, St. John's Wort) can interfere with hormonal contraception.</span>
          </div>
        </div>
      </Card>

      {/* Doctor Chat CTA */}
      <Card className="p-4 bg-gradient-to-r from-primary/10 to-secondary/10 border-primary/20">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-2xl bg-primary/20 flex items-center justify-center flex-shrink-0">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold">Questions about contraception?</h3>
            <p className="text-xs text-muted-foreground">Ask our AI Doctor Chat for guidance.</p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </div>
      </Card>
    </div>
  );
}
