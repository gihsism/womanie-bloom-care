import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { differenceInDays, format, parseISO } from 'date-fns';
import { Baby, Hand, Trash2, RotateCcw, AlertCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

// "Count to 10" fetal kick counter — the most common third-trimester
// self-monitoring practice. ACOG: count distinct fetal movements
// (kick, roll, flutter — not hiccups). 10 movements in ≤2 hours is
// reassuring; longer than 2 hours warrants contacting the OB.
//
// Surfaced for pregnancy mode from week 28 onward (ACOG entry point
// for kick counts, though earlier counts can be done — we just
// don't push them).
//
// Patient hits "Felt a kick" each time she notices movement. The
// component tracks the running tally and timer for the current
// session; on the 10th tap it stamps the result, persists it, and
// celebrates / warns based on elapsed time.

interface FetalKickCounterProps {
  dueDate: Date | null;
}

interface KickSession {
  startedAt: string; // ISO
  endedAt: string; // ISO
  count: number;
  durationMin: number;
}

const STORAGE_KEY = (userId: string) => `womanie_kick_sessions_${userId}`;
const TARGET_KICKS = 10;
const GUIDANCE_MINUTES = 120;

export default function FetalKickCounter({ dueDate }: FetalKickCounterProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [sessions, setSessions] = useState<KickSession[]>([]);
  const [activeStart, setActiveStart] = useState<Date | null>(null);
  const [activeCount, setActiveCount] = useState(0);
  // Re-tick every minute so the elapsed display stays accurate.
  const [, setTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user) return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY(user.id));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setSessions(parsed.filter(s => s?.startedAt && typeof s?.count === 'number'));
        }
      }
    } catch { /* ignore */ }
  }, [user]);

  // Start/stop the elapsed-time ticker when a session is active.
  useEffect(() => {
    if (activeStart && tickRef.current === null) {
      tickRef.current = setInterval(() => setTick(t => t + 1), 60_000);
    }
    if (!activeStart && tickRef.current !== null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    return () => {
      if (tickRef.current !== null) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [activeStart]);

  const persist = (next: KickSession[]) => {
    if (!user) return;
    try { window.localStorage.setItem(STORAGE_KEY(user.id), JSON.stringify(next)); } catch { /* ignore */ }
    setSessions(next);
  };

  // Gestational week from due date.
  const gestWeek = useMemo(() => {
    if (!dueDate) return null;
    const start = new Date(dueDate);
    start.setDate(start.getDate() - 280);
    const days = differenceInDays(new Date(), start);
    if (days < 0 || days > 320) return null;
    return Math.floor(days / 7);
  }, [dueDate]);

  const elapsedMin = activeStart
    ? Math.floor((Date.now() - activeStart.getTime()) / 60_000)
    : 0;

  const handleStart = () => {
    setActiveStart(new Date());
    setActiveCount(0);
  };

  const handleTap = () => {
    if (!activeStart) {
      // First tap starts the session.
      const now = new Date();
      setActiveStart(now);
      setActiveCount(1);
      return;
    }
    const nextCount = activeCount + 1;
    setActiveCount(nextCount);
    if (nextCount >= TARGET_KICKS) {
      // Session complete.
      const end = new Date();
      const durationMin = Math.max(1, Math.floor((end.getTime() - activeStart.getTime()) / 60_000));
      const session: KickSession = {
        startedAt: activeStart.toISOString(),
        endedAt: end.toISOString(),
        count: nextCount,
        durationMin,
      };
      const next = [session, ...sessions].slice(0, 60);
      persist(next);
      setActiveStart(null);
      setActiveCount(0);
      if (durationMin <= GUIDANCE_MINUTES) {
        toast({
          title: `10 kicks in ${durationMin} min — reassuring`,
          description: 'Saved. Aim for 10 movements within 2 hours, once daily, ideally at the same time.',
        });
      } else {
        toast({
          variant: 'destructive',
          title: `10 kicks took ${durationMin} min — over the 2-hour mark`,
          description: 'ACOG suggests contacting your OB if it took longer than 2 hours. Better safe than sorry.',
        });
      }
    }
  };

  const handleAbandon = () => {
    setActiveStart(null);
    setActiveCount(0);
  };

  const handleDelete = (idx: number) => {
    persist(sessions.filter((_, i) => i !== idx));
  };

  if (!dueDate) return null;
  if (gestWeek === null) return null;
  // Pre-28-week — kick counting isn't recommended yet (movements
  // too inconsistent). Hide the card so it doesn't add noise.
  if (gestWeek < 28) return null;

  const lastSession = sessions[0] ?? null;

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
          <Baby className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Kick count</p>
          <p className="text-[11px] text-muted-foreground">
            ACOG: 10 distinct movements within 2 hours, once daily
          </p>
        </div>
        {activeStart && (
          <Button size="sm" variant="ghost" onClick={handleAbandon} className="text-[11px]">
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Reset
          </Button>
        )}
      </div>

      {/* Counter — big tap target */}
      <div className="flex items-center justify-center gap-4 py-3">
        <div className="text-center">
          <div className="text-5xl font-bold tabular-nums">
            {activeCount}<span className="text-2xl text-muted-foreground">/{TARGET_KICKS}</span>
          </div>
          {activeStart && (
            <p className="text-[11px] text-muted-foreground mt-1">
              {elapsedMin} min elapsed
              {elapsedMin > GUIDANCE_MINUTES && (
                <span className="ml-1 text-red-600 font-medium">· past 2 hours</span>
              )}
            </p>
          )}
        </div>
        <Button
          size="lg"
          onClick={handleTap}
          className="h-20 w-32 text-base"
        >
          <Hand className="h-5 w-5 mr-2" />
          {activeStart ? 'Felt a kick' : 'Start'}
        </Button>
      </div>

      {!activeStart && lastSession && (
        <div className="rounded-lg border p-3 mb-2 bg-muted/20">
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-[11px] text-muted-foreground">Last session</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${
              lastSession.durationMin <= GUIDANCE_MINUTES
                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
                : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200'
            }`}>
              {lastSession.durationMin <= GUIDANCE_MINUTES ? 'reassuring' : 'over 2 hours'}
            </span>
          </div>
          <p className="text-sm">
            <span className="font-medium">10 kicks in {lastSession.durationMin} min</span>{' '}
            <span className="text-muted-foreground text-xs">
              · {format(parseISO(lastSession.startedAt), 'MMM d, h:mm a')}
            </span>
          </p>
        </div>
      )}

      {/* Decreased-movement red flag */}
      {activeStart && elapsedMin > GUIDANCE_MINUTES && (
        <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/20 p-3 mb-2 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
          <div className="text-xs">
            <p className="font-medium text-red-800 dark:text-red-200">Movement seems slow today</p>
            <p className="text-red-700 dark:text-red-300 mt-0.5">
              You've been counting for over 2 hours without reaching 10. ACOG recommends contacting your OB to be checked. Better to call and be reassured.
            </p>
          </div>
        </div>
      )}

      {sessions.length > 0 && !activeStart && (
        <details>
          <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground">
            History ({sessions.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {sessions.slice(0, 14).map((s, i) => {
              const ok = s.durationMin <= GUIDANCE_MINUTES;
              return (
                <li key={s.startedAt} className="flex items-center gap-2 text-[11px]">
                  <span className="text-muted-foreground w-28">
                    {format(parseISO(s.startedAt), 'MMM d, h:mm a')}
                  </span>
                  <span className={ok ? 'text-foreground' : 'text-red-700 font-medium'}>
                    {s.count} in {s.durationMin}m
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDelete(i)}
                    className="ml-auto text-muted-foreground hover:text-destructive"
                    aria-label="Remove session"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
        Reference: ACOG Practice Bulletin on antepartum fetal surveillance. Hiccups don't count.
        If you can't feel any movement after a meal + 1 hour of focused counting, call your OB.
      </p>
    </Card>
  );
}
