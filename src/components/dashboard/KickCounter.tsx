import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Activity, RotateCcw, AlertCircle, History } from 'lucide-react';
import { format, formatDistanceToNowStrict } from 'date-fns';

// Kick counter for late pregnancy. Standard methodology (ACOG):
// from ~28 weeks on, count fetal movements daily. 10 distinct
// movements in 2 hours or less is reassuring; substantially fewer
// is a reason to call your provider for monitoring.
//
// We deliberately keep this client-only (localStorage scoped by
// user.id). Kick counting is a personal logging activity — there's
// no clinical benefit to syncing it server-side until the patient
// shares the session with a doctor.

interface KickSession {
  id: string;
  startedAt: number;  // epoch ms
  endedAt: number | null;
  count: number;
  // Each "tap" timestamp, so we can show inter-kick timing and the
  // session can be paused/resumed without losing the cadence.
  taps: number[];
}

const TARGET_KICKS = 10;
const REASSURING_MS = 2 * 60 * 60 * 1000; // 2 hours
const SESSION_STORAGE_KEY = (userId: string) => `womanie_kick_session_${userId}`;
const HISTORY_STORAGE_KEY = (userId: string) => `womanie_kick_history_${userId}`;
const HISTORY_LIMIT = 14;

function uid(): string {
  return crypto.randomUUID();
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota / private mode — accept the in-memory state.
  }
}

const formatDuration = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remMin = minutes % 60;
    return `${hours}h ${remMin}m`;
  }
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
};

const KickCounter = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [current, setCurrent] = useState<KickSession | null>(null);
  const [history, setHistory] = useState<KickSession[]>([]);
  const [now, setNow] = useState(Date.now());
  const tickRef = useRef<number | null>(null);

  // Load any in-progress session + history when the user changes.
  useEffect(() => {
    if (!user) return;
    const c = readJson<KickSession | null>(SESSION_STORAGE_KEY(user.id), null);
    const h = readJson<KickSession[]>(HISTORY_STORAGE_KEY(user.id), []);
    setCurrent(c);
    setHistory(h);
  }, [user?.id]);

  // Re-tick once a second only when there's an active session, so the
  // "elapsed" display stays accurate without spinning when idle.
  useEffect(() => {
    if (!current || current.endedAt !== null) {
      if (tickRef.current) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }
    tickRef.current = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [current]);

  const persistCurrent = (next: KickSession | null) => {
    if (!user) return;
    setCurrent(next);
    if (next) writeJson(SESSION_STORAGE_KEY(user.id), next);
    else localStorage.removeItem(SESSION_STORAGE_KEY(user.id));
  };

  const persistHistory = (next: KickSession[]) => {
    if (!user) return;
    setHistory(next);
    writeJson(HISTORY_STORAGE_KEY(user.id), next);
  };

  const start = () => {
    const session: KickSession = {
      id: uid(),
      startedAt: Date.now(),
      endedAt: null,
      count: 0,
      taps: [],
    };
    persistCurrent(session);
  };

  const tap = () => {
    if (!current || current.endedAt !== null) return;
    const t = Date.now();
    const next: KickSession = {
      ...current,
      taps: [...current.taps, t],
      count: current.count + 1,
    };
    // Auto-complete at 10 movements — that's the reassurance threshold.
    if (next.count >= TARGET_KICKS) {
      const completed: KickSession = { ...next, endedAt: t };
      const newHistory = [completed, ...history].slice(0, HISTORY_LIMIT);
      persistCurrent(null);
      persistHistory(newHistory);
      const duration = t - completed.startedAt;
      const reassuring = duration <= REASSURING_MS;
      toast({
        title: reassuring
          ? `10 movements in ${formatDuration(duration)} ✓`
          : `10 movements in ${formatDuration(duration)}`,
        description: reassuring
          ? 'Within the typical 2-hour reassurance window. Your baby is moving well.'
          : 'Slower than the typical 2-hour reassurance window. If movement feels reduced, call your provider.',
      });
      return;
    }
    persistCurrent(next);
  };

  const stop = () => {
    if (!current) return;
    const t = Date.now();
    const completed: KickSession = { ...current, endedAt: t };
    const newHistory = [completed, ...history].slice(0, HISTORY_LIMIT);
    persistCurrent(null);
    persistHistory(newHistory);
    if (completed.count > 0) {
      toast({
        title: 'Session saved',
        description: `${completed.count} movement${completed.count === 1 ? '' : 's'} in ${formatDuration(t - completed.startedAt)}.`,
      });
    }
  };

  const reset = () => {
    if (!current) return;
    if (current.count > 0 && !window.confirm('Discard this kick-count session?')) return;
    persistCurrent(null);
  };

  const elapsedMs = current ? now - current.startedAt : 0;
  const reassuring = current ? elapsedMs <= REASSURING_MS : true;

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          Daily kick count
        </h4>
        <Badge variant="outline" className="text-[10px]">
          {TARGET_KICKS} movements in 2h is typical
        </Badge>
      </div>

      {!current ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            From around week 28, tracking fetal movement is a useful check on your baby's
            wellbeing. Pick a quiet moment, lie down, and tap each distinct movement.
          </p>
          <Button onClick={start} className="w-full h-12 text-base">
            Start a session
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-center">
            <div className="text-6xl font-bold text-primary">{current.count}</div>
            <div className="text-xs text-muted-foreground mt-1">
              of {TARGET_KICKS} movements
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              Started {formatDistanceToNowStrict(new Date(current.startedAt))} ago
              {' · '}
              <span className={reassuring ? '' : 'text-amber-600 font-medium'}>
                {formatDuration(elapsedMs)} elapsed
              </span>
            </div>
          </div>

          <Button
            onClick={tap}
            className="w-full h-20 text-lg gap-2"
            size="lg"
          >
            <Activity className="h-5 w-5" />
            Tap each movement
          </Button>

          {!reassuring && current.count < TARGET_KICKS && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-800 dark:text-amber-200">
                Fewer than {TARGET_KICKS} movements in 2 hours. If movement feels reduced
                compared to your baby's usual pattern, call your provider — they may want
                to monitor.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" size="sm" onClick={stop} className="flex-1">
              Stop and save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={reset}
              className="gap-1 text-muted-foreground hover:text-destructive"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="pt-3 border-t space-y-2">
          <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <History className="h-3 w-3" />
            Recent sessions
          </h5>
          <ul className="space-y-1.5">
            {history.slice(0, 5).map(s => {
              const dur = s.endedAt ? s.endedAt - s.startedAt : 0;
              const reachedTarget = s.count >= TARGET_KICKS;
              const onTime = reachedTarget && dur <= REASSURING_MS;
              return (
                <li key={s.id} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {format(new Date(s.startedAt), 'MMM d, HH:mm')}
                  </span>
                  <span className="font-medium flex items-center gap-1.5">
                    {s.count}/{TARGET_KICKS} in {formatDuration(dur)}
                    {onTime && (
                      <span className="text-[10px] text-green-600 dark:text-green-400">✓</span>
                    )}
                    {reachedTarget && !onTime && (
                      <span className="text-[10px] text-amber-600">!</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
};

export default KickCounter;
