import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { Milk, Trash2, Plus } from 'lucide-react';
import { differenceInMinutes, format, isToday, parseISO } from 'date-fns';

// Postpartum feeding tracker. Two-button log surface:
//   • Tap to record a feed at "now"
//   • Pick side / method on the next tap (breast L, breast R, bottle)
//
// Local-only storage — these entries are minute-by-minute, change
// fast, aren't a clinical signal to anyone outside the household.
// Keeping it client-side avoids round-trips on every tap and avoids
// schema work. Storage shape:
//   { feeds: Array<{ at: ISOString, method: 'breast_l' | 'breast_r' | 'bottle' }>}
// Newest first. Trimmed to last 200 entries.

interface FeedEntry {
  at: string; // ISO
  method: 'breast_l' | 'breast_r' | 'bottle';
}

const METHOD_LABEL: Record<FeedEntry['method'], string> = {
  breast_l: 'Left breast',
  breast_r: 'Right breast',
  bottle: 'Bottle',
};

const METHOD_SHORT: Record<FeedEntry['method'], string> = {
  breast_l: 'L',
  breast_r: 'R',
  bottle: 'B',
};

const METHOD_TONE: Record<FeedEntry['method'], string> = {
  breast_l: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-200',
  breast_r: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-200',
  bottle: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200',
};

const lsKey = (userId: string) => `postpartum:${userId}:feeds`;
const MAX_ENTRIES = 200;

const PostpartumFeedingTracker = () => {
  const { user } = useAuth();
  const userId = user?.id ?? '';

  const [feeds, setFeeds] = useState<FeedEntry[]>([]);
  const [pendingTimestamp, setPendingTimestamp] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    try {
      const raw = localStorage.getItem(lsKey(userId));
      if (raw) {
        const parsed = JSON.parse(raw) as FeedEntry[];
        if (Array.isArray(parsed)) setFeeds(parsed);
      }
    } catch { /* ignore */ }
  }, [userId]);

  const persist = (next: FeedEntry[]) => {
    const trimmed = next.slice(0, MAX_ENTRIES);
    setFeeds(trimmed);
    try { localStorage.setItem(lsKey(userId), JSON.stringify(trimmed)); } catch { /* ignore */ }
  };

  const startFeed = () => {
    setPendingTimestamp(new Date().toISOString());
  };

  const recordFeed = (method: FeedEntry['method']) => {
    if (!pendingTimestamp) return;
    persist([{ at: pendingTimestamp, method }, ...feeds]);
    setPendingTimestamp(null);
  };

  const removeFeed = (at: string) => {
    persist(feeds.filter(f => f.at !== at));
  };

  // Stats: total today, average gap (minutes), time since last.
  const stats = useMemo(() => {
    if (feeds.length === 0) {
      return { todayCount: 0, gapAvg: null as number | null, sinceLast: null as number | null };
    }
    const todayCount = feeds.filter(f => isToday(parseISO(f.at))).length;
    const sinceLast = differenceInMinutes(new Date(), parseISO(feeds[0].at));

    // Average gap over the last 8 feeds.
    const recent = feeds.slice(0, 8);
    if (recent.length < 2) return { todayCount, gapAvg: null, sinceLast };
    const gaps: number[] = [];
    for (let i = 0; i < recent.length - 1; i++) {
      const gap = differenceInMinutes(parseISO(recent[i].at), parseISO(recent[i + 1].at));
      if (gap > 0 && gap < 12 * 60) gaps.push(gap);
    }
    const gapAvg = gaps.length > 0 ? gaps.reduce((s, v) => s + v, 0) / gaps.length : null;
    return { todayCount, gapAvg, sinceLast };
  }, [feeds]);

  const formatGap = (m: number | null) => {
    if (m === null) return '—';
    const h = Math.floor(m / 60);
    const min = m % 60;
    if (h === 0) return `${min}m`;
    if (min === 0) return `${h}h`;
    return `${h}h ${min}m`;
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold flex items-center gap-2">
          <Milk className="h-4 w-4 text-primary" />
          Feeding log
        </h3>
        {stats.todayCount > 0 && (
          <Badge variant="outline" className="text-[10px]">
            {stats.todayCount} today
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
        <div className="bg-muted/50 rounded-lg p-2">
          <div className="text-[10px] text-muted-foreground">Last feed</div>
          <div className="font-semibold text-sm">
            {stats.sinceLast === null ? '—' : `${formatGap(stats.sinceLast)} ago`}
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg p-2">
          <div className="text-[10px] text-muted-foreground">Avg gap</div>
          <div className="font-semibold text-sm">{formatGap(stats.gapAvg)}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-2">
          <div className="text-[10px] text-muted-foreground">Today</div>
          <div className="font-semibold text-sm">{stats.todayCount}</div>
        </div>
      </div>

      {pendingTimestamp ? (
        <div className="mb-3">
          <p className="text-xs text-muted-foreground mb-2">
            Logging feed at {format(parseISO(pendingTimestamp), 'h:mm a')} — pick a method:
          </p>
          <div className="grid grid-cols-3 gap-2">
            <Button size="sm" variant="outline" className="text-xs" onClick={() => recordFeed('breast_l')}>
              Left breast
            </Button>
            <Button size="sm" variant="outline" className="text-xs" onClick={() => recordFeed('breast_r')}>
              Right breast
            </Button>
            <Button size="sm" variant="outline" className="text-xs" onClick={() => recordFeed('bottle')}>
              Bottle
            </Button>
          </div>
          <Button size="sm" variant="ghost" className="text-xs mt-1 w-full" onClick={() => setPendingTimestamp(null)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button size="sm" className="w-full mb-3 gap-1.5" onClick={startFeed}>
          <Plus className="h-3.5 w-3.5" />
          Log feed now
        </Button>
      )}

      {feeds.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Recent</p>
          <ul className="space-y-1 max-h-44 overflow-y-auto">
            {feeds.slice(0, 12).map(f => {
              const dt = parseISO(f.at);
              const today = isToday(dt);
              return (
                <li key={f.at} className="flex items-center gap-2 text-xs">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${METHOD_TONE[f.method]}`} aria-label={METHOD_LABEL[f.method]}>
                    {METHOD_SHORT[f.method]}
                  </span>
                  <span className="flex-1 text-muted-foreground tabular-nums">
                    {today ? format(dt, 'h:mm a') : format(dt, 'MMM d, h:mm a')}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFeed(f.at)}
                    className="text-muted-foreground hover:text-destructive focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive rounded"
                    aria-label="Remove feed entry"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
        Newborns typically feed 8–12× per 24 hours; spacing extends as baby grows.
        This log stays on your device — no cloud sync.
      </p>
    </Card>
  );
};

export default PostpartumFeedingTracker;
