import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { CheckCircle2, Plus, Trash2, Wind } from 'lucide-react';
import { format, isToday, parseISO, subDays } from 'date-fns';

// Simple pelvic-floor exercise tracker for postpartum. Most clinicians
// recommend starting light Kegels from week 2 (vaginal delivery) or
// once cleared by a provider for C-section; the canonical target is
// 10 reps × 3 sessions per day. Adherence is the problem, not the
// physical effort.
//
// One-tap surface: "Log set." Each tap stores an entry; today's
// count + week streak are shown. Local-only — no schema, instant
// feel.

interface SetEntry { at: string }

const lsKey = (uid: string) => `postpartum:${uid}:pelvic-floor`;
const MAX_ENTRIES = 500;
const TARGET_PER_DAY = 3;

const PostpartumPelvicFloor = () => {
  const { user } = useAuth();
  const uid = user?.id ?? '';
  const [sets, setSets] = useState<SetEntry[]>([]);

  useEffect(() => {
    if (!uid) return;
    try {
      const raw = localStorage.getItem(lsKey(uid));
      if (raw) {
        const parsed = JSON.parse(raw) as SetEntry[];
        if (Array.isArray(parsed)) setSets(parsed);
      }
    } catch { /* ignore */ }
  }, [uid]);

  const persist = (next: SetEntry[]) => {
    const trimmed = next.slice(0, MAX_ENTRIES);
    setSets(trimmed);
    try { localStorage.setItem(lsKey(uid), JSON.stringify(trimmed)); } catch { /* ignore */ }
  };

  const logSet = () => {
    persist([{ at: new Date().toISOString() }, ...sets]);
  };

  const removeSet = (at: string) => {
    persist(sets.filter(s => s.at !== at));
  };

  const todayCount = useMemo(
    () => sets.filter(s => isToday(parseISO(s.at))).length,
    [sets]
  );

  // 7-day daily-set strip (newest day right).
  const week = useMemo(() => {
    const days: Array<{ date: Date; count: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const key = format(d, 'yyyy-MM-dd');
      const count = sets.filter(s => format(parseISO(s.at), 'yyyy-MM-dd') === key).length;
      days.push({ date: d, count });
    }
    return days;
  }, [sets]);

  // Habit streak: consecutive days from yesterday going back with ≥1 set.
  const streak = useMemo(() => {
    let s = 0;
    for (let i = 1; i < 60; i++) {
      const d = subDays(new Date(), i);
      const key = format(d, 'yyyy-MM-dd');
      const has = sets.some(e => format(parseISO(e.at), 'yyyy-MM-dd') === key);
      if (has) s++;
      else break;
    }
    return s;
  }, [sets]);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold flex items-center gap-2">
          <Wind className="h-4 w-4 text-primary" />
          Pelvic floor
        </h3>
        {streak >= 3 && (
          <Badge variant="outline" className="text-[10px] gap-1">
            <CheckCircle2 className="h-3 w-3" />
            {streak}-day streak
          </Badge>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground mb-3">
        Aim for {TARGET_PER_DAY} short sets a day (10 reps each). Once cleared by your provider —
        usually week 2 for vaginal delivery, after the 6-week visit if C-section.
      </p>

      <div className="flex items-center gap-2 mb-3">
        <Button size="sm" className="gap-1.5" onClick={logSet}>
          <Plus className="h-3.5 w-3.5" />
          Log set
        </Button>
        <div className="flex-1 text-right">
          <p className="text-xs text-muted-foreground">Today</p>
          <p className={`text-lg font-semibold ${todayCount >= TARGET_PER_DAY ? 'text-emerald-600' : ''}`}>
            {todayCount} / {TARGET_PER_DAY}
          </p>
        </div>
      </div>

      {/* 7-day strip */}
      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Last 7 days</p>
        <div className="flex items-end gap-1">
          {week.map((d, i) => {
            const hit = d.count >= TARGET_PER_DAY;
            const some = d.count > 0;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                <div
                  className={`h-8 w-full rounded ${hit ? 'bg-primary' : some ? 'bg-primary/40' : 'bg-muted'}`}
                  title={`${format(d.date, 'EEE MMM d')}: ${d.count} sets`}
                >
                  {d.count > 0 && (
                    <span className="text-[9px] text-primary-foreground font-medium flex items-center justify-center h-full">
                      {d.count}
                    </span>
                  )}
                </div>
                <span className="text-[9px] text-muted-foreground">
                  {format(d.date, 'EEE')[0]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Today's entries (for accidental-tap recovery) */}
      {todayCount > 0 && (
        <details className="mt-3">
          <summary className="text-[10px] uppercase tracking-wide text-muted-foreground cursor-pointer">
            Today's entries
          </summary>
          <ul className="space-y-0.5 mt-2">
            {sets
              .filter(s => isToday(parseISO(s.at)))
              .slice(0, 12)
              .map(s => (
                <li key={s.at} className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{format(parseISO(s.at), 'h:mm a')}</span>
                  <button
                    type="button"
                    onClick={() => removeSet(s.at)}
                    className="hover:text-destructive p-1 -m-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive rounded"
                    aria-label="Remove entry"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              ))}
          </ul>
        </details>
      )}
    </Card>
  );
};

export default PostpartumPelvicFloor;
