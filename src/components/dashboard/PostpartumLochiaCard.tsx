import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Droplet, AlertCircle } from 'lucide-react';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { onHealthDataChange } from '@/lib/data-events';
import { differenceInDays, format, parseISO } from 'date-fns';

// Visualizes the lochia entries DailyLogging captures, mapped to the
// expected postpartum trajectory (bright red → pink/brown → yellow
// over weeks 1-6). Each logged day rendered as a coloured cell on a
// horizontal strip; today ringed.
//
// Surfaces a callout when the pattern doesn't match the expected
// downshift — bright red still showing past week 2, or re-bleeding
// after a few yellow days. Both are signals worth flagging to a
// provider.

interface SignalRow {
  signal_date: string;
  notes: string | null;
}

interface DailyLochia {
  date: Date;
  lochia: LochiaLevel;
}

type LochiaLevel = 'none' | 'spotting' | 'light-red' | 'heavy-red' | 'pink-brown' | 'yellow-clear';

const COLOR: Record<LochiaLevel, string> = {
  none: 'bg-muted/40',
  spotting: 'bg-pink-200',
  'light-red': 'bg-red-300',
  'heavy-red': 'bg-red-500',
  'pink-brown': 'bg-amber-300',
  'yellow-clear': 'bg-amber-100',
};

const LABEL: Record<LochiaLevel, string> = {
  none: 'None',
  spotting: 'Spotting',
  'light-red': 'Light red',
  'heavy-red': 'Heavy red',
  'pink-brown': 'Pink / brown',
  'yellow-clear': 'Yellow / clear',
};

const SEVERITY: Record<LochiaLevel, number> = {
  none: 0,
  'yellow-clear': 1,
  'pink-brown': 2,
  spotting: 2,
  'light-red': 3,
  'heavy-red': 4,
};

function parseLochia(notes: string | null): LochiaLevel | null {
  if (!notes) return null;
  const m = notes.match(/Lochia:\s*(none|spotting|light-red|heavy-red|pink-brown|yellow-clear)/i);
  if (!m) return null;
  return m[1].toLowerCase() as LochiaLevel;
}

interface Props {
  birthDate: Date;
}

export default function PostpartumLochiaCard({ birthDate }: Props) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<DailyLochia[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    // Pull the postpartum window (last 56 days) of signals.
    const start = new Date(birthDate);
    start.setDate(start.getDate() - 1);
    const startStr = format(start, 'yyyy-MM-dd');
    const { data } = await db
      .from('daily_health_signals')
      .select('signal_date, notes')
      .eq('user_id', user.id)
      .gte('signal_date', startStr)
      .order('signal_date', { ascending: true });
    const rows = (data ?? []) as SignalRow[];
    const parsed: DailyLochia[] = [];
    for (const r of rows) {
      const lochia = parseLochia(r.notes);
      if (!lochia) continue;
      parsed.push({ date: parseISO(r.signal_date), lochia });
    }
    setEntries(parsed);
    setLoaded(true);
  }, [user, birthDate]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => onHealthDataChange(load), [load]);

  const daysPostpartum = useMemo(
    () => differenceInDays(new Date(), birthDate),
    [birthDate]
  );

  // Hide after week 8 (no more useful tracking).
  if (daysPostpartum > 56) return null;

  // Need at least one logged entry to render.
  if (loaded && entries.length === 0) return null;

  // Detect re-bleeding: in the last 7 days, did a heavy-red follow ≥3
  // days of yellow/pink/spotting? Flag if so.
  const reBleed = (() => {
    if (entries.length < 4) return false;
    const recent = entries.slice(-10);
    let yellowStreak = 0;
    for (const e of recent) {
      if (SEVERITY[e.lochia] <= 2) yellowStreak++;
      else if (SEVERITY[e.lochia] >= 3 && yellowStreak >= 3) {
        return true;
      } else {
        yellowStreak = 0;
      }
    }
    return false;
  })();

  // Detect persistent bright red past week 2.
  const persistentRed = (() => {
    if (daysPostpartum < 14) return false;
    const recent = entries.slice(-7);
    const redCount = recent.filter(e => SEVERITY[e.lochia] >= 3).length;
    return recent.length >= 3 && redCount >= recent.length - 1;
  })();

  // Build the strip: one cell per day since birth (capped at 42).
  const days = Math.min(42, daysPostpartum + 1);
  const cells: Array<{ day: number; date: Date; lochia: LochiaLevel | null }> = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(birthDate);
    d.setDate(d.getDate() + i);
    const dStr = format(d, 'yyyy-MM-dd');
    const entry = entries.find(e => format(e.date, 'yyyy-MM-dd') === dStr);
    cells.push({ day: i + 1, date: d, lochia: entry?.lochia ?? null });
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Droplet className="h-4 w-4 text-primary" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold">Lochia progression</h3>
          <p className="text-[11px] text-muted-foreground">
            Day-by-day, since birth. Expected: red → brown → yellow over 4–6 weeks.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mb-3">
        {cells.map(c => {
          const today = format(c.date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
          const lochiaClass = c.lochia ? COLOR[c.lochia] : 'bg-muted/20 border-dashed border';
          return (
            <div
              key={c.day}
              className={`h-5 w-5 rounded ${lochiaClass} ${today ? 'ring-2 ring-primary' : ''}`}
              title={`Day ${c.day} (${format(c.date, 'MMM d')}): ${c.lochia ? LABEL[c.lochia] : 'no log'}`}
            />
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {(Object.keys(LABEL) as LochiaLevel[]).map(l => (
          <div key={l} className="flex items-center gap-1 text-[10px]">
            <div className={`h-2.5 w-2.5 rounded ${COLOR[l]}`} />
            <span className="text-muted-foreground">{LABEL[l]}</span>
          </div>
        ))}
      </div>

      {(reBleed || persistentRed) && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50/60 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-800/40">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-amber-600" />
          <div className="text-xs text-amber-800 dark:text-amber-200">
            {persistentRed && (
              <p className="leading-snug">
                Bleeding is still bright red past week 2 — this is later than the typical
                fade. Worth calling your provider.
              </p>
            )}
            {reBleed && !persistentRed && (
              <p className="leading-snug">
                New bright red after several days of fading — often a sign of activity
                overdone, occasionally retained tissue. Worth a provider call.
              </p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
