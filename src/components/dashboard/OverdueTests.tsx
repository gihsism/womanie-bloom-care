import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, ArrowRight } from 'lucide-react';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { onHealthDataChange } from '@/lib/data-events';
import { getFriendlyName } from '@/lib/medical-utils';
import { differenceInMonths } from 'date-fns';

// Surfaces tests the user has tracked at least twice and hasn't seen
// in over 12 months. Informational — not prescriptive ("you should
// retest"); just a "you haven't seen this in a while" nudge so a real
// gap doesn't go invisible.
//
// Pure compute over current_extracted_data. Hidden when nothing is
// overdue. Tap any row to deep-link into the panel deep-dive view.

interface ExtractedItem {
  title: string;
  date_recorded: string | null;
  data_type: string | null;
  raw_data: Record<string, unknown> | string | null;
}

interface OverdueRow {
  title: string;
  panel: string | null;
  monthsAgo: number;
  totalReadings: number;
}

const OVERDUE_THRESHOLD_MONTHS = 12;
const MIN_PRIOR_READINGS = 2;
const MAX_VISIBLE = 5;

function panelOf(item: ExtractedItem): string | null {
  const raw = item.raw_data;
  if (!raw) return null;
  let parsed: Record<string, unknown> | null = null;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); } catch { return null; }
  } else if (typeof raw === 'object') {
    parsed = raw as Record<string, unknown>;
  }
  return parsed && typeof parsed.panel === 'string' ? parsed.panel : null;
}

function panelSlug(panel: string): string {
  return panel
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function OverdueTests() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [items, setItems] = useState<ExtractedItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await db
      .from('current_extracted_data')
      .select('title, date_recorded, data_type, raw_data')
      .eq('user_id', user.id)
      .eq('data_type', 'lab_result');
    setItems((data ?? []) as ExtractedItem[]);
    setLoaded(true);
  }, [user]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => onHealthDataChange(load), [load]);

  const overdue = useMemo<OverdueRow[]>(() => {
    if (!loaded) return [];
    const now = new Date();
    // Group by canonical title.
    const byTitle = new Map<string, ExtractedItem[]>();
    for (const item of items) {
      if (!item.date_recorded) continue;
      const list = byTitle.get(item.title) ?? [];
      list.push(item);
      byTitle.set(item.title, list);
    }
    const out: OverdueRow[] = [];
    for (const [title, list] of byTitle) {
      if (list.length < MIN_PRIOR_READINGS) continue;
      const sorted = [...list].sort(
        (a, b) => Date.parse(b.date_recorded as string) - Date.parse(a.date_recorded as string)
      );
      const latest = sorted[0];
      const months = differenceInMonths(now, new Date(latest.date_recorded as string));
      if (months < OVERDUE_THRESHOLD_MONTHS) continue;
      out.push({
        title,
        panel: panelOf(latest),
        monthsAgo: months,
        totalReadings: list.length,
      });
    }
    // Most stale first.
    out.sort((a, b) => b.monthsAgo - a.monthsAgo);
    return out;
  }, [items, loaded]);

  if (!loaded || overdue.length === 0) return null;

  const visible = overdue.slice(0, MAX_VISIBLE);
  const hiddenCount = overdue.length - visible.length;

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-secondary/10 flex items-center justify-center">
          <Clock className="h-4 w-4 text-secondary" />
        </div>
        <div>
          <p className="text-sm font-semibold">Tests you haven't seen in a while</p>
          <p className="text-[11px] text-muted-foreground">
            {overdue.length} {overdue.length === 1 ? 'test' : 'tests'} you've tracked before but not in 12+ months — worth bringing up at your next appointment.
          </p>
        </div>
      </div>

      <ul className="space-y-1.5">
        {visible.map(row => (
          <li
            key={row.title}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 group"
          >
            <button
              type="button"
              className="flex-1 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
              onClick={() => {
                if (row.panel) {
                  navigate(`/dashboard/panel/${panelSlug(row.panel)}`);
                } else {
                  navigate('/dashboard/medical-history');
                }
              }}
            >
              <span className="text-sm font-medium">{getFriendlyName(row.title)}</span>
              <span className="text-[11px] text-muted-foreground ml-2">
                last seen {row.monthsAgo} months ago
                {row.totalReadings > 2 && ` · ${row.totalReadings} prior readings`}
              </span>
            </button>
            <ArrowRight className="h-3 w-3 text-muted-foreground opacity-50 group-hover:opacity-100" />
          </li>
        ))}
      </ul>

      {hiddenCount > 0 && (
        <p className="text-[11px] text-muted-foreground mt-2 text-center">
          + {hiddenCount} more
        </p>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="mt-2 h-7 w-full text-xs gap-1.5"
        onClick={() => navigate('/dashboard/ai-doctor?q=' + encodeURIComponent('Which of my tests am I overdue to recheck, and why?'))}
      >
        Ask AI which to prioritize
      </Button>
    </Card>
  );
}
