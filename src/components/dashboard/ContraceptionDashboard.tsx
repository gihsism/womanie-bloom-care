import { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { format, differenceInDays, parseISO, subDays } from 'date-fns';
import { onHealthDataChange, emitHealthDataChange } from '@/lib/data-events';
import {
  Pill,
  Clock,
  CheckCircle2,
  Bell,
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

interface SignalRow {
  signal_date: string;
  notes: string | null;
}

// Pill state encoded inside the existing daily_health_signals.notes column.
// Same surface DailyLogging.tsx already writes ("Pill: on-time" / "Pill: late" / "Pill: missed"),
// kept consistent so the two surfaces never disagree.
type PillStatus = 'on-time' | 'late' | 'missed';

function parsePillStatus(notes: string | null): PillStatus | null {
  if (!notes) return null;
  const match = notes.match(/Pill:\s*(on-time|late|missed)/i);
  if (!match) return null;
  return match[1].toLowerCase() as PillStatus;
}

function setPillInNotes(notes: string | null, status: PillStatus | null): string | null {
  // Strip any existing "Pill: ..." segment, then append the new one if non-null.
  const stripped = (notes || '')
    .split('.')
    .map((s) => s.trim())
    .filter((s) => s && !/^Pill:\s*(on-time|late|missed)$/i.test(s))
    .join('. ');
  if (!status) return stripped || null;
  return stripped ? `${stripped}. Pill: ${status}` : `Pill: ${status}`;
}

const lsKey = (userId: string, key: string) => `contraception:${userId}:${key}`;

function readLS<T>(userId: string, key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(lsKey(userId, key));
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLS(userId: string, key: string, value: unknown) {
  try {
    localStorage.setItem(lsKey(userId, key), JSON.stringify(value));
  } catch {
    // Quota / private mode — silently ignore.
  }
}

export default function ContraceptionDashboard({ onNavigateToDoctorChat }: ContraceptionDashboardProps) {
  const { user } = useAuth();
  const userId = user?.id;
  const { toast } = useToast();

  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [trackedSideEffects, setTrackedSideEffects] = useState<Set<string>>(new Set());
  const [showMethodPicker, setShowMethodPicker] = useState(false);
  const [reminderTime, setReminderTime] = useState('21:00');
  const [packStartDate, setPackStartDate] = useState<string | null>(null);

  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [isLoadingSignals, setIsLoadingSignals] = useState(true);

  // ─── Persisted preferences via localStorage ───
  useEffect(() => {
    if (!userId) return;
    setSelectedMethod(readLS<string | null>(userId, 'method', 'pill'));
    setTrackedSideEffects(new Set(readLS<string[]>(userId, 'sideEffects', [])));
    setReminderTime(readLS<string>(userId, 'reminderTime', '21:00'));
    setPackStartDate(readLS<string | null>(userId, 'packStartDate', null));
  }, [userId]);

  useEffect(() => {
    if (!userId || selectedMethod === null) return;
    writeLS(userId, 'method', selectedMethod);
  }, [userId, selectedMethod]);

  useEffect(() => {
    if (!userId) return;
    writeLS(userId, 'sideEffects', Array.from(trackedSideEffects));
  }, [userId, trackedSideEffects]);

  useEffect(() => {
    if (!userId) return;
    writeLS(userId, 'reminderTime', reminderTime);
  }, [userId, reminderTime]);

  useEffect(() => {
    if (!userId) return;
    writeLS(userId, 'packStartDate', packStartDate);
  }, [userId, packStartDate]);

  // ─── Recent pill-take history from the database ───
  const loadSignals = async () => {
    if (!userId) return;
    setIsLoadingSignals(true);
    try {
      const { data } = await db
        .from('daily_health_signals')
        .select('signal_date, notes')
        .eq('user_id', userId)
        .gte('signal_date', format(subDays(new Date(), 60), 'yyyy-MM-dd'))
        .order('signal_date', { ascending: false });
      setSignals(((data as SignalRow[]) || []));
    } catch (e) {
      console.error('ContraceptionDashboard load error', e);
      setSignals([]);
    } finally {
      setIsLoadingSignals(false);
    }
  };

  useEffect(() => {
    loadSignals();
    return onHealthDataChange(() => loadSignals());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const currentMethod = CONTRACEPTION_METHODS.find((m) => m.id === selectedMethod);
  const isPillBased = ['pill', 'patch', 'ring'].includes(selectedMethod || '');

  // Compute "today logged" + streak from real DB rows.
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayStatus = useMemo(() => {
    const row = signals.find((s) => s.signal_date === today);
    return parsePillStatus(row?.notes ?? null);
  }, [signals, today]);
  const pillsTakenToday = todayStatus !== null && todayStatus !== 'missed';

  const pillStreak = useMemo(() => {
    // Walk back from today, count consecutive days with on-time or late (missed breaks streak).
    const map = new Map<string, PillStatus>();
    signals.forEach((s) => {
      const status = parsePillStatus(s.notes);
      if (status) map.set(s.signal_date, status);
    });
    let streak = 0;
    let cursor = new Date();
    while (true) {
      const key = format(cursor, 'yyyy-MM-dd');
      const status = map.get(key);
      if (!status || status === 'missed') break;
      streak++;
      cursor = subDays(cursor, 1);
      if (streak > 365) break; // sanity cap
    }
    return streak;
  }, [signals]);

  // Pack day from packStartDate; default to "not started" until user marks it.
  const packDay = useMemo(() => {
    if (!packStartDate) return null;
    try {
      const days = differenceInDays(new Date(), parseISO(packStartDate)) + 1;
      // Cycle through 28-day packs.
      return ((days - 1) % 28) + 1;
    } catch {
      return null;
    }
  }, [packStartDate]);

  const handleTakePill = async (status: PillStatus = 'on-time') => {
    if (!userId) return;
    try {
      // Read existing today row to preserve other note segments + structured fields.
      const { data: existing } = await db
        .from('daily_health_signals')
        .select('notes')
        .eq('user_id', userId)
        .eq('signal_date', today)
        .maybeSingle();

      const newNotes = setPillInNotes((existing?.notes ?? null) as string | null, status);
      await db
        .from('daily_health_signals')
        .upsert(
          {
            user_id: userId,
            signal_date: today,
            notes: newNotes,
          },
          { onConflict: 'user_id,signal_date' }
        );

      // First pill of a pack? Stamp the pack start.
      if (!packStartDate) setPackStartDate(today);

      emitHealthDataChange();
      toast({
        title: status === 'missed' ? 'Logged as missed' : '✅ Logged!',
        description: `${currentMethod?.label || 'Contraception'} marked ${status} for today.`,
      });
    } catch (e) {
      console.error('handleTakePill error', e);
      toast({ title: 'Error', description: 'Failed to log. Please try again.', variant: 'destructive' });
    }
  };

  const toggleSideEffect = (id: string) => {
    setTrackedSideEffects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleStartNewPack = () => {
    setPackStartDate(today);
    toast({ title: 'New pack started', description: 'Pack day reset to 1.' });
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
            {CONTRACEPTION_METHODS.map((method) => (
              <button
                key={method.id}
                onClick={() => { setSelectedMethod(method.id); setShowMethodPicker(false); }}
                className={cn(
                  'flex items-center gap-2 p-3 rounded-xl border text-left transition-all',
                  selectedMethod === method.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'
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
              {todayStatus === 'on-time' && '✓ Taken on time'}
              {todayStatus === 'late' && '⏰ Taken late'}
              {todayStatus === 'missed' && '⚠ Missed'}
              {!todayStatus && 'Not logged'}
            </Badge>
          </div>

          {!pillsTakenToday ? (
            <div className="space-y-2">
              <Button onClick={() => handleTakePill('on-time')} className="w-full gap-2 h-12 text-base">
                <Pill className="h-5 w-5" />
                Mark as Taken
              </Button>
              <div className="flex gap-2">
                <Button onClick={() => handleTakePill('late')} variant="outline" size="sm" className="flex-1 text-xs">
                  Took it late
                </Button>
                <Button onClick={() => handleTakePill('missed')} variant="outline" size="sm" className="flex-1 text-xs">
                  Missed today
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-3 bg-secondary/10 rounded-xl">
              <CheckCircle2 className="h-8 w-8 text-secondary mx-auto mb-1" />
              <p className="text-sm font-medium">All done for today!</p>
              <p className="text-xs text-muted-foreground">Great job staying consistent 💪</p>
              <Button
                variant="ghost"
                size="sm"
                className="text-[11px] h-6 mt-1"
                onClick={() => handleTakePill('missed')}
              >
                Actually, mark as missed
              </Button>
            </div>
          )}

          {/* Streak & Pack Progress */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="p-3 rounded-xl bg-muted/50 text-center">
              {isLoadingSignals ? (
                <p className="text-2xl font-bold text-muted-foreground">—</p>
              ) : (
                <p className="text-2xl font-bold text-primary">{pillStreak}</p>
              )}
              <p className="text-xs text-muted-foreground">Day streak 🔥</p>
            </div>
            <div className="p-3 rounded-xl bg-muted/50">
              {packDay !== null ? (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium">Pack Day</p>
                    <p className="text-xs font-bold">{packDay}/28</p>
                  </div>
                  <Progress value={(packDay / 28) * 100} className="h-2" />
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[10px] text-muted-foreground">
                      {packDay <= 21 ? `${21 - packDay + 1} active left` : `${28 - packDay + 1} placebo left`}
                    </p>
                    {packDay === 1 || packDay === 28 ? (
                      <button
                        onClick={handleStartNewPack}
                        className="text-[10px] text-primary underline"
                      >
                        New pack
                      </button>
                    ) : null}
                  </div>
                </>
              ) : (
                <button
                  onClick={handleStartNewPack}
                  className="w-full h-full flex flex-col items-center justify-center text-xs text-muted-foreground hover:text-foreground"
                >
                  <span className="font-medium">Start a pack</span>
                  <span className="text-[10px]">Mark today as day 1</span>
                </button>
              )}
            </div>
          </div>

          {/* 30-day adherence calendar — gives a glanceable history that
              the streak number alone hides. Built from the same
              signals[] we already loaded; today's column is highlighted. */}
          {(() => {
            const days: { date: string; status: PillStatus | null; isToday: boolean }[] = [];
            const todayKey = today;
            for (let i = 29; i >= 0; i--) {
              const d = format(subDays(new Date(), i), 'yyyy-MM-dd');
              const row = signals.find(s => s.signal_date === d);
              const status = parsePillStatus(row?.notes ?? null);
              days.push({ date: d, status, isToday: d === todayKey });
            }
            const onTime = days.filter(d => d.status === 'on-time').length;
            const late = days.filter(d => d.status === 'late').length;
            const missed = days.filter(d => d.status === 'missed').length;
            const unlogged = 30 - onTime - late - missed;
            const dotFor = (status: PillStatus | null): string => {
              if (status === 'on-time') return 'bg-green-500';
              if (status === 'late') return 'bg-amber-500';
              if (status === 'missed') return 'bg-destructive';
              return 'bg-muted-foreground/20';
            };
            return (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">Last 30 days</span>
                  <span className="text-muted-foreground">
                    <span className="text-green-600 font-medium">{onTime}</span>
                    {' on-time · '}
                    <span className="text-amber-600 font-medium">{late}</span>
                    {' late · '}
                    <span className="text-destructive font-medium">{missed}</span>
                    {' missed'}
                  </span>
                </div>
                <div className="grid grid-cols-10 sm:grid-cols-15 gap-1">
                  {days.map((d) => (
                    <div
                      key={d.date}
                      className={`aspect-square rounded-sm ${dotFor(d.status)} ${d.isToday ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''}`}
                      title={`${d.date}${d.status ? ` · ${d.status}` : ' · not logged'}`}
                    />
                  ))}
                </div>
                {unlogged > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    {unlogged} {unlogged === 1 ? 'day' : 'days'} not logged. Tap "Mark as Taken"
                    each day to keep the streak meaningful.
                  </p>
                )}
              </div>
            );
          })()}
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
      {isPillBased && packDay !== null && (
        <Card className="p-4 border-primary/20 bg-primary/5">
          <div className="flex items-center gap-3">
            <RefreshCcw className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-medium">Refill Reminder</p>
              <p className="text-xs text-muted-foreground">
                {packDay <= 21 ? `${21 - packDay + 7} days until refill needed` : 'Time to get your refill!'}
              </p>
            </div>
            <Button variant="outline" size="sm" className="text-xs h-7">
              <Bell className="h-3 w-3 mr-1" />
              {reminderTime}
            </Button>
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
          {SIDE_EFFECTS.map((effect) => {
            const isActive = trackedSideEffects.has(effect.id);
            return (
              <button
                key={effect.id}
                onClick={() => toggleSideEffect(effect.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border',
                  isActive ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted/50'
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
            Tracking {trackedSideEffects.size} side effect{trackedSideEffects.size === 1 ? '' : 's'}. If severe, talk to your doctor.
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
      <Card
        className="p-4 bg-gradient-to-r from-primary/10 to-secondary/10 border-primary/20 cursor-pointer"
        onClick={onNavigateToDoctorChat}
      >
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
