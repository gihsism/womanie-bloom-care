import { useConfirm } from '@/components/ConfirmDialog';
import { discardContractionConfirm, clearContractionsConfirm } from '@/lib/confirmCopy';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { Timer, Play, Square, RotateCcw, Phone, History, CloudOff } from 'lucide-react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { importLocalOnce } from '@/hooks/useLifeEvents';
import { useOfflineLifeEvents } from '@/hooks/useOfflineLifeEvents';
import { useWakeLock } from '@/hooks/useWakeLock';
import {
  detect511, formatSpan, rollingSummary, withIntervals, MINUTE, type TimedContraction,
} from '@/lib/contractions';

// Contraction timer for late pregnancy. Start/Stop each contraction; the
// card shows duration and the start-to-start interval, a rolling one-hour
// summary, and a calm banner once the 5-1-1 pattern (every 5 min, lasting
// 1 min, for 1 hour) holds. Sources and the exact rule: src/lib/contractions.ts
// (ACOG FAQ004 "How to Tell When Labor Begins"; NHS "Signs that labour has
// begun"). Non-diagnostic: it only prompts her to call, never says she is
// or isn't in labour.
//
// Finished contractions are saved to the account (life_events, kind
// 'contraction'); without signal they wait on the device and sync later.
// The contraction in progress stays on the device so Start/Stop are
// instant. The screen is kept on while she is timing (Wake Lock API).

interface ActiveContraction {
  id: string;
  startedAt: number;
}

const KEY = (uid: string) => `womanie_contractions_${uid}`;
const ACTIVE_KEY = (uid: string) => `womanie_contraction_active_${uid}`;
const MAX_HISTORY = 100;
// Keep the screen on while a contraction runs or one started this recently.
const KEEP_AWAKE_MS = 15 * MINUTE;

function readActive(key: string): ActiveContraction | null {
  try {
    const raw = localStorage.getItem(key);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v.startedAt === 'number' ? { id: String(v.id), startedAt: v.startedAt } : null;
  } catch {
    return null;
  }
}

const ContractionTimer = () => {
  const { user } = useAuth();
  const userId = user?.id;
  const [confirm, confirmDialog] = useConfirm();
  const { events, pending, addOrQueue, remove, removePending, error } = useOfflineLifeEvents('contraction', {
    limit: MAX_HISTORY,
    beforeLoad: (id) => importLocalOnce<{ startedAt: number; endedAt: number | null }, Record<string, never>>(id, KEY(id), 'contraction', c =>
      c.endedAt === null ? null : { occurred_at: new Date(c.startedAt).toISOString(), ended_at: new Date(c.endedAt).toISOString() }),
  });

  const saved: Array<TimedContraction & { pending: boolean }> = events
    .filter(e => e.ended_at !== null)
    .map(e => ({ id: e.id, startedAt: Date.parse(e.occurred_at), endedAt: Date.parse(e.ended_at as string), pending: false }));
  const queued = pending
    .filter(p => p.ended_at)
    .map(p => ({ id: p.localId, startedAt: Date.parse(p.occurred_at), endedAt: Date.parse(p.ended_at as string), pending: true }));
  const all = [...saved, ...queued].sort((a, b) => a.startedAt - b.startedAt);
  const pendingIds = new Set(queued.map(q => q.id));

  const [active, setActive] = useState<ActiveContraction | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!userId) return;
    setActive(readActive(ACTIVE_KEY(userId)));
  }, [userId]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const last = all.length ? all[all.length - 1] : null;
  useWakeLock(!!active || (last !== null && now - last.startedAt < KEEP_AWAKE_MS));

  const setActiveSaved = (c: ActiveContraction | null) => {
    setActive(c);
    if (!userId) return;
    try {
      if (c) localStorage.setItem(ACTIVE_KEY(userId), JSON.stringify(c));
      else localStorage.removeItem(ACTIVE_KEY(userId));
    } catch { /* private mode: in memory only */ }
  };

  const start = () => setActiveSaved({ id: crypto.randomUUID(), startedAt: Date.now() });

  const stop = async () => {
    if (!active) return;
    const endedAt = Date.now();
    const { startedAt } = active;
    setActiveSaved(null);
    // Never lost: saved to the account, or queued on the device.
    await addOrQueue({ occurred_at: new Date(startedAt).toISOString(), ended_at: new Date(endedAt).toISOString() });
  };

  const discardActive = async () => {
    if (!active) return;
    if (!(await confirm(discardContractionConfirm()))) return;
    setActiveSaved(null);
  };

  const removeOne = (id: string) => {
    if (pendingIds.has(id)) removePending(id);
    else void remove(id);
  };

  const reset = async () => {
    if (all.length === 0 && !active) return;
    if (!(await confirm(clearContractionsConfirm()))) return;
    setActiveSaved(null);
    for (const c of all) {
      if (c.pending) removePending(c.id);
      else await remove(c.id);
    }
  };

  const summary = rollingSummary(all, now);
  const pattern = detect511(all, now);
  const rows = withIntervals(all).reverse().slice(0, 15);

  return (
    <Card className="p-4 space-y-3">
    {confirmDialog}
      <div className="flex items-center justify-between">
        <h4 className="font-semibold flex items-center gap-2">
          <Timer className="h-4 w-4 text-primary" />
          Contraction timer
        </h4>
        <Badge variant="outline" className="text-[10px]">
          5-1-1 rule
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground -mt-1">
        Tap Start when a contraction begins and Stop when it ends. The usual rule is to call
        when they come every 5 minutes, last 1 minute, for 1 hour. If your midwife or hospital
        gave you a different rule, follow theirs.
      </p>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {pattern.status === 'met' && (
        <div role="status" className="flex items-start gap-2 p-3 rounded-lg border border-primary/30 bg-primary/5">
          <Phone className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
          <div className="text-xs text-foreground/85">
            <p className="font-medium">5-1-1 rule: time to call your midwife or hospital.</p>
            <p className="mt-0.5">
              For about {formatSpan(pattern.sustainedMs)} your contractions have come every 5 minutes
              or less and lasted a minute or more. Call them now; they will tell you when to come in.
            </p>
          </div>
        </div>
      )}
      {pattern.status === 'building' && (
        <p role="status" className="text-xs text-foreground/80 rounded-lg bg-muted/40 p-2.5">
          Your last {pattern.runCount} contractions fit the 5-1-1 pace ({formatSpan(pattern.sustainedMs)} so far).
          Keep timing; call when it has held for an hour, or sooner if your midwife told you to.
        </p>
      )}

      {active ? (
        <div className="rounded-xl bg-primary/10 border border-primary/30 p-4 text-center space-y-2">
          <div className="text-xs uppercase tracking-wide text-primary">Contraction in progress</div>
          <div className="text-5xl font-bold tabular-nums">{formatSpan(now - active.startedAt)}</div>
          {last && (
            <div className="text-xs text-muted-foreground">
              {formatSpan(active.startedAt - last.startedAt)} since the start of the last one
            </div>
          )}
          <div className="flex items-center justify-center gap-2 pt-1">
            <Button onClick={stop} className="gap-1 h-12 px-8 text-base">
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
            {last
              ? `Last one started ${formatDistanceToNowStrict(new Date(last.startedAt))} ago and lasted ${formatSpan(last.endedAt - last.startedAt)}`
              : 'No contractions timed yet'}
          </div>
          <Button onClick={start} className="w-full h-14 text-base gap-2">
            <Play className="h-5 w-5" />
            Start a contraction
          </Button>
        </div>
      )}

      {summary.count > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Last hour</div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="bg-muted/50 rounded-lg p-2">
              <div className="text-[10px] text-muted-foreground">Contractions</div>
              <div className="font-semibold">{summary.count}</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-2">
              <div className="text-[10px] text-muted-foreground">Every (avg)</div>
              <div className="font-semibold">{summary.avgIntervalMs !== null ? formatSpan(summary.avgIntervalMs) : '—'}</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-2">
              <div className="text-[10px] text-muted-foreground">Lasting (avg)</div>
              <div className="font-semibold">{summary.avgDurationMs !== null ? formatSpan(summary.avgDurationMs) : '—'}</div>
            </div>
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Whatever the timer shows, call your maternity unit straight away if your waters break,
        you bleed, the baby moves less than usual, or the pain is constant or severe.
      </p>

      {rows.length > 0 && (
        <div className="space-y-2 pt-2 border-t">
          <div className="flex items-center justify-between">
            <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <History className="h-3 w-3" />
              Recent ({all.length})
            </h5>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 text-muted-foreground" onClick={reset}>
              <RotateCcw className="h-3 w-3" />
              Clear history
            </Button>
          </div>
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 text-[10px] text-muted-foreground">
            <span>Started</span><span className="text-right">Lasted</span><span className="text-right">Every</span><span />
          </div>
          <ul className="space-y-0.5 max-h-48 overflow-y-auto">
            {rows.map(c => (
              <li key={c.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 items-center text-xs py-1">
                <span className="text-muted-foreground flex items-center gap-1">
                  {format(new Date(c.startedAt), 'HH:mm:ss')}
                  {pendingIds.has(c.id) && (
                    <CloudOff className="h-3 w-3" aria-label="Not synced yet" />
                  )}
                </span>
                <span className="font-medium tabular-nums text-right">{formatSpan(c.durationMs)}</span>
                <span className="tabular-nums text-right text-muted-foreground">
                  {c.intervalMs !== null && c.intervalMs < 2 * 60 * MINUTE ? formatSpan(c.intervalMs) : '—'}
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
              </li>
            ))}
          </ul>
          {queued.length > 0 && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <CloudOff className="h-3 w-3" />
              {queued.length} saved on this phone; they sync when you are back online.
            </p>
          )}
        </div>
      )}
    </Card>
  );
};

export default ContractionTimer;
