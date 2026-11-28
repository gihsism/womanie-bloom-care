import { useConfirm } from '@/components/ConfirmDialog';
import { discardKickSessionConfirm } from '@/lib/confirmCopy';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Activity, RotateCcw, AlertCircle, History, Undo2, CloudOff, Phone } from 'lucide-react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { attentionBanner, healthTone } from '@/lib/medical-utils';
import { importLocalOnce } from '@/hooks/useLifeEvents';
import { useOfflineLifeEvents } from '@/hooks/useOfflineLifeEvents';
import {
  finishSession, kickConcern, startSession, tapKick, timeToTarget, undoTap, usualTimeToTarget,
  TARGET_KICKS, type KickConcern, type KickSession,
} from '@/lib/kickSession';
import { formatSpan } from '@/lib/contractions';

// Kick counter for late pregnancy (week 28+): count to 10 movements and
// see how long it took, with her own history to learn her baby's pattern.
// Guidance (details in src/lib/kickSession.ts): NHS "Your baby's
// movements" and RCOG Green-top Guideline 57 say there is no "normal"
// number; if movements slow down, stop or change, contact the maternity
// unit straight away, day or night. Never "wait and see", and the app
// never reassures her that her baby is fine.
//
// Finished sessions are saved to the account (life_events, kind
// 'kick_session', data = { count, taps }); without signal they wait on the
// device and sync later. The session in progress stays on the device.

interface KickData { count: number; taps: number[] }

const SESSION_STORAGE_KEY = (userId: string) => `womanie_kick_session_${userId}`;
const HISTORY_STORAGE_KEY = (userId: string) => `womanie_kick_history_${userId}`;
// Storage key of the retired FetalKickCounter.
const OLD_FETAL_KEY = (userId: string) => `womanie_kick_sessions_${userId}`;
const HISTORY_LIMIT = 30;

const CONTACT_NOW = 'Contact your midwife or maternity unit straight away, day or night. Do not wait until tomorrow.';

const concernText: Record<Exclude<KickConcern, 'none'>, string> = {
  over_reference: `It has taken more than 2 hours to feel ${TARGET_KICKS} movements. ${CONTACT_NOW}`,
  slower_than_usual: `That took much longer than usual for your baby. If movements feel slower or different, ${CONTACT_NOW.charAt(0).toLowerCase()}${CONTACT_NOW.slice(1)}`,
  stopped_short: `Fewer than ${TARGET_KICKS} movements were counted. If your baby is moving less than usual, ${CONTACT_NOW.charAt(0).toLowerCase()}${CONTACT_NOW.slice(1)}`,
};

function readSession(key: string): KickSession | null {
  try {
    const raw = localStorage.getItem(key);
    const v = raw ? JSON.parse(raw) : null;
    if (!v || typeof v.startedAt !== 'number') return null;
    return { id: String(v.id), startedAt: v.startedAt, endedAt: null, count: Number(v.count) || 0, taps: Array.isArray(v.taps) ? v.taps : [] };
  } catch {
    return null;
  }
}

const KickCounter = () => {
  const { user } = useAuth();
  const userId = user?.id;
  const { toast } = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const [current, setCurrent] = useState<KickSession | null>(null);
  const [lastDone, setLastDone] = useState<KickSession | null>(null);
  const { events, pending, addOrQueue, error } = useOfflineLifeEvents<KickData>('kick_session', {
    limit: HISTORY_LIMIT,
    beforeLoad: async (id) => {
      await importLocalOnce<KickSession, KickData>(id, HISTORY_STORAGE_KEY(id), 'kick_session', k =>
        k.endedAt === null ? null : {
          occurred_at: new Date(k.startedAt).toISOString(),
          ended_at: new Date(k.endedAt).toISOString(),
          data: { count: k.count, taps: k.taps ?? [] },
        });
      await importLocalOnce<{ startedAt: string; endedAt: string; count: number }, KickData>(id, OLD_FETAL_KEY(id), 'kick_session', k => ({
        occurred_at: k.startedAt,
        ended_at: k.endedAt,
        data: { count: k.count, taps: [] },
      }));
    },
  });

  const toSession = (id: string, occurred: string, ended: string | null, data: KickData | undefined): KickSession => ({
    id,
    startedAt: Date.parse(occurred),
    endedAt: ended ? Date.parse(ended) : null,
    count: Number(data?.count ?? 0),
    taps: Array.isArray(data?.taps) ? data.taps : [],
  });
  const pendingIds = new Set(pending.map(p => p.localId));
  // Newest first.
  const history: KickSession[] = [
    ...events.map(e => toSession(e.id, e.occurred_at, e.ended_at, e.data)),
    ...pending.map(p => toSession(p.localId, p.occurred_at, p.ended_at, p.data)),
  ].sort((a, b) => b.startedAt - a.startedAt);
  const usual = usualTimeToTarget(history);

  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!userId) return;
    setCurrent(readSession(SESSION_STORAGE_KEY(userId)));
  }, [userId]);

  useEffect(() => {
    if (!current) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [current]);

  const persistCurrent = (next: KickSession | null) => {
    setCurrent(next);
    if (!userId) return;
    try {
      if (next) localStorage.setItem(SESSION_STORAGE_KEY(userId), JSON.stringify(next));
      else localStorage.removeItem(SESSION_STORAGE_KEY(userId));
    } catch { /* private mode: in memory only */ }
  };

  const saveCompleted = async (s: KickSession) => {
    await addOrQueue({
      occurred_at: new Date(s.startedAt).toISOString(),
      ended_at: new Date(s.endedAt ?? Date.now()).toISOString(),
      data: { count: s.count, taps: s.taps },
    });
  };

  const start = () => {
    setLastDone(null);
    persistCurrent(startSession(Date.now(), crypto.randomUUID()));
  };

  const tap = () => {
    if (!current) return;
    const { session, completed, ignored } = tapKick(current, Date.now());
    if (ignored) return;
    if (completed) {
      persistCurrent(null);
      setLastDone(session);
      void saveCompleted(session);
      toast({
        title: `${TARGET_KICKS} movements in ${formatSpan(timeToTarget(session) ?? 0)}`,
        description: 'Saved to your history.',
      });
      return;
    }
    persistCurrent(session);
  };

  const undo = () => {
    if (current) persistCurrent(undoTap(current));
  };

  const stop = () => {
    if (!current) return;
    const done = finishSession(current, Date.now());
    persistCurrent(null);
    if (done.count > 0) {
      setLastDone(done);
      void saveCompleted(done);
    }
  };

  const reset = async () => {
    if (!current) return;
    if (current.count > 0 && !(await confirm(discardKickSessionConfirm()))) return;
    persistCurrent(null);
  };

  const liveConcern = current ? kickConcern(current, now, history) : 'none';
  const doneConcern = lastDone ? kickConcern(lastDone, now, history) : 'none';
  const concern = current ? liveConcern : doneConcern;
  const elapsedMs = current ? now - current.startedAt : 0;

  return (
    <Card className="p-4 space-y-4">
    {confirmDialog}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex items-center justify-between">
        <h4 className="font-semibold flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          Kick counter
        </h4>
        <Badge variant="outline" className="text-[10px]">
          Count to {TARGET_KICKS}
        </Badge>
      </div>

      {/* Always visible, per NHS/RCOG: reduced movements = call now. */}
      <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-2.5">
        <Phone className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-primary" />
        <p className="text-xs text-foreground/85">
          <span className="font-medium">If you notice reduced movements, contact your maternity unit straight away</span>,
          day or night. Do not wait and see, and do not rely on this counter or a home heartbeat
          monitor to reassure yourself.
        </p>
      </div>

      {!current ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            There is no set number of movements that is normal; what matters is your baby's own
            pattern. Pick a time when your baby is usually active, lie on your side, and tap each
            movement (kicks, rolls, swishes) until you reach {TARGET_KICKS}.
            {usual !== null && <> Usually it takes you about {formatSpan(usual)}.</>}
          </p>
          <Button onClick={start} className="w-full h-12 text-base">
            Start counting
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-center">
            <div className="font-display text-6xl leading-none text-primary tabular-nums font-medium">{current.count}</div>
            <div className="text-xs text-muted-foreground mt-1">of {TARGET_KICKS} movements</div>
            <div className="text-xs text-muted-foreground mt-2">
              Started {formatDistanceToNowStrict(new Date(current.startedAt))} ago · {formatSpan(elapsedMs)}
            </div>
          </div>

          <Button onClick={tap} className="w-full h-20 text-lg gap-2" size="lg">
            <Activity className="h-5 w-5" />
            Tap for each movement
          </Button>

          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" size="sm" onClick={stop} className="flex-1">
              Stop and save
            </Button>
            <Button variant="ghost" size="sm" onClick={undo} disabled={current.count === 0} className="gap-1 text-muted-foreground">
              <Undo2 className="h-3.5 w-3.5" />
              Undo
            </Button>
            <Button variant="ghost" size="sm" onClick={reset} className="gap-1 text-muted-foreground hover:text-destructive">
              <RotateCcw className="h-3.5 w-3.5" />
              Discard
            </Button>
          </div>
        </div>
      )}

      {concern !== 'none' && (
        <div className={attentionBanner} role="alert">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
          <p className="text-xs">{concernText[concern]}</p>
        </div>
      )}

      {history.length > 0 && (
        <div className="pt-3 border-t space-y-2">
          <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <History className="h-3 w-3" />
            Your sessions
          </h5>
          <ul className="space-y-1.5 max-h-48 overflow-y-auto">
            {history.slice(0, 14).map(s => {
              const t = timeToTarget(s);
              const c = kickConcern(s, s.endedAt ?? now, history);
              return (
                <li key={s.id} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1">
                    {format(new Date(s.startedAt), 'EEE d MMM, HH:mm')}
                    {pendingIds.has(s.id) && <CloudOff className="h-3 w-3" aria-label="Not synced yet" />}
                  </span>
                  <span className="font-medium flex items-center gap-1.5 tabular-nums">
                    {t !== null
                      ? `${TARGET_KICKS} in ${formatSpan(t)}`
                      : `${s.count} in ${formatSpan((s.endedAt ?? s.startedAt) - s.startedAt)}`}
                    <span
                      aria-label={c === 'none' ? 'like your usual' : 'slower or shorter than usual'}
                      className={`inline-block h-1.5 w-1.5 rounded-full ${c === 'none' ? healthTone.ok.dot : healthTone.watch.dot}`}
                    />
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
