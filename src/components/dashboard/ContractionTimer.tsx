import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { Timer, Play, Square, RotateCcw, AlertTriangle, History } from 'lucide-react';
import { format, formatDistanceToNowStrict } from 'date-fns';

// Contraction timer for late pregnancy. Standard advice when labor
// starts: time the frequency (start-to-start) and duration. The
// "5-1-1 rule" (every 5 min, lasting 1 min, for 1 hour) is the
// classic threshold for heading to the hospital, though clinics vary.
//
// We deliberately keep this on-device only. Contraction timing is a
// real-time tool, not a longitudinal record, and there's no clinical
// benefit to syncing it server-side.

interface Contraction {
  id: string;
  startedAt: number;
  endedAt: number | null;
}

const KEY = (uid: string) => `womanie_contractions_${uid}`;
const MAX_HISTORY = 50;

function uid() {
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
    // Quota / private mode — accept in-memory.
  }
}

function fmtMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  }
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

const ContractionTimer = () => {
  const { user } = useAuth();
  const userId = user?.id;
  const [history, setHistory] = useState<Contraction[]>([]);
  const [active, setActive] = useState<Contraction | null>(null);
  const [now, setNow] = useState(Date.now());
  const tickRef = useRef<number | null>(null);

  // Load history + any in-progress contraction.
  useEffect(() => {
    if (!userId) return;
    const all = readJson<Contraction[]>(KEY(userId), []);
    const inProgress = all.find(c => c.endedAt === null) ?? null;
    setActive(inProgress);
    setHistory(all.filter(c => c.endedAt !== null));
  }, [userId]);

  // Tick once a second while there's an active contraction or while
  // we're inside a "recent" window so the time-since-last counter
  // stays accurate.
  useEffect(() => {
    tickRef.current = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, []);

  const persist = (allHistory: Contraction[], current: Contraction | null) => {
    setHistory(allHistory);
    setActive(current);
    if (!userId) return;
    const merged = current ? [...allHistory, current] : allHistory;
    writeJson(KEY(userId), merged.slice(-MAX_HISTORY));
  };

  const start = () => {
    const c: Contraction = { id: uid(), startedAt: Date.now(), endedAt: null };
    persist(history, c);
  };

  const stop = () => {
    if (!active) return;
    const ended: Contraction = { ...active, endedAt: Date.now() };
    persist([...history, ended].slice(-MAX_HISTORY), null);
  };

  const discardActive = () => {
    if (!active) return;
    if (!window.confirm('Discard this contraction?')) return;
    persist(history, null);
  };

  const removeOne = (id: string) => {
    persist(history.filter(c => c.id !== id), active);
  };

  const reset = () => {
    if (history.length === 0 && !active) return;
    if (!window.confirm('Clear all contraction history?')) return;
    persist([], null);
  };

  // Sliding-window stats: last hour's average frequency (start-to-start)
  // and duration. These are the numbers the user is actually trying
  // to track against the 5-1-1 threshold.
  const lastHourEnd = active ? active.startedAt : now;
  const oneHourAgo = lastHourEnd - 60 * 60 * 1000;
  const lastHour = history.filter(c => c.startedAt >= oneHourAgo);
  const intervals: number[] = [];
  for (let i = 1; i < lastHour.length; i++) {
    intervals.push(lastHour[i].startedAt - lastHour[i - 1].startedAt);
  }
  const durations = lastHour
    .filter(c => c.endedAt !== null)
    .map(c => (c.endedAt as number) - c.startedAt);

  const avgFrequencyMs = intervals.length > 0
    ? intervals.reduce((s, v) => s + v, 0) / intervals.length
    : null;
  const avgDurationMs = durations.length > 0
    ? durations.reduce((s, v) => s + v, 0) / durations.length
    : null;

  // 5-1-1: frequency ≤ 5 minutes, duration ≥ 1 minute, sustained for ≥ 1 hour.
  // We can't perfectly check "sustained for 1 hour" without a longer
  // window — we approximate: at least 6 contractions in the last hour
  // (which is 1 every ~10 min, the minimum for the rule to even be
  // meaningful) and meeting both other thresholds.
  const meeting511 = avgFrequencyMs !== null && avgFrequencyMs <= 5 * 60 * 1000
    && avgDurationMs !== null && avgDurationMs >= 60 * 1000
    && lastHour.length >= 6;

  const lastEnded = history.length > 0
    ? history.reduce((a, b) =>
        (a.endedAt ?? a.startedAt) > (b.endedAt ?? b.startedAt) ? a : b
      )
    : null;
  const sinceLastMs = lastEnded
    ? now - (lastEnded.endedAt ?? lastEnded.startedAt)
    : null;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold flex items-center gap-2">
          <Timer className="h-4 w-4 text-primary" />
          Contraction timer
        </h4>
        <Badge variant="outline" className="text-[10px]">
          5-1-1 rule for heading in
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground -mt-1">
        Tap Start when a contraction begins, Stop when it ends. The 5-1-1 rule —
        every 5 minutes, lasting 1 minute, for 1 hour — is the typical "head to the
        hospital" threshold. Your provider may use a different rule; follow theirs.
      </p>

      {/* Active contraction big surface */}
      {active ? (
        <div className="rounded-xl bg-primary/10 border border-primary/30 p-4 text-center space-y-2">
          <div className="text-xs uppercase tracking-wide text-primary">In progress</div>
          <div className="text-5xl font-bold tabular-nums">{fmtMs(now - active.startedAt)}</div>
          <div className="flex items-center justify-center gap-2 pt-1">
            <Button onClick={stop} className="gap-1">
              <Square className="h-4 w-4" />
              Stop
            </Button>
            <Button onClick={discardActive} variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
              Discard
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-muted/30 p-4 text-center space-y-3">
          <div className="text-xs text-muted-foreground">
            {lastEnded
              ? `Last contraction ended ${formatDistanceToNowStrict(new Date(lastEnded.endedAt ?? lastEnded.startedAt))} ago`
              : 'No contractions logged yet'}
            {sinceLastMs !== null && sinceLastMs >= 0 && lastEnded && (
              <span> · current gap {fmtMs(sinceLastMs)}</span>
            )}
          </div>
          <Button onClick={start} className="w-full h-14 text-base gap-2">
            <Play className="h-5 w-5" />
            Start a contraction
          </Button>
        </div>
      )}

      {/* Last-hour stats */}
      {lastHour.length > 0 && (
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="bg-muted/50 rounded-lg p-2">
            <div className="text-[10px] text-muted-foreground">Last hour</div>
            <div className="font-semibold">{lastHour.length}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2">
            <div className="text-[10px] text-muted-foreground">Avg frequency</div>
            <div className="font-semibold">{avgFrequencyMs ? fmtMs(avgFrequencyMs) : '—'}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2">
            <div className="text-[10px] text-muted-foreground">Avg duration</div>
            <div className="font-semibold">{avgDurationMs ? fmtMs(avgDurationMs) : '—'}</div>
          </div>
        </div>
      )}

      {meeting511 && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-destructive" />
          <div className="text-xs text-destructive">
            <p className="font-medium">Meeting the 5-1-1 pattern.</p>
            <p className="mt-0.5">
              Contractions every ≤5 min, lasting ≥1 min. Many providers consider this the
              signal to head in — call yours now to confirm.
            </p>
          </div>
        </div>
      )}

      {/* Recent contractions list */}
      {history.length > 0 && (
        <div className="space-y-2 pt-2 border-t">
          <div className="flex items-center justify-between">
            <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <History className="h-3 w-3" />
              Recent ({history.length})
            </h5>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 text-muted-foreground" onClick={reset}>
              <RotateCcw className="h-3 w-3" />
              Clear history
            </Button>
          </div>
          <ul className="space-y-0.5 max-h-40 overflow-y-auto">
            {[...history].reverse().slice(0, 12).map((c, i, arr) => {
              const dur = c.endedAt !== null ? c.endedAt - c.startedAt : null;
              // Compute the gap from the *previous* contraction in
              // wall-clock order (history is sorted desc here).
              const prevInTime = arr[i + 1];
              const gap = prevInTime ? c.startedAt - (prevInTime.endedAt ?? prevInTime.startedAt) : null;
              return (
                <li key={c.id} className="flex items-center justify-between gap-2 text-xs py-1">
                  <span className="text-muted-foreground">
                    {format(new Date(c.startedAt), 'HH:mm:ss')}
                  </span>
                  <span className="flex items-center gap-3 flex-shrink-0">
                    {gap !== null && (
                      <span className="text-[10px] text-muted-foreground">+{fmtMs(gap)}</span>
                    )}
                    <span className="font-medium tabular-nums">
                      {dur !== null ? fmtMs(dur) : '—'}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeOne(c.id)}
                      className="text-muted-foreground/60 hover:text-destructive"
                      aria-label="Remove this contraction"
                      title="Remove"
                    >
                      ×
                    </button>
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

export default ContractionTimer;
