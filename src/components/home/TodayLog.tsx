import { useState } from 'react';
import { format } from 'date-fns';
import { ChevronRight } from 'lucide-react';
import type { Target, TodayItem } from '@/lib/todayItems';
import type { LoggedRow } from '@/lib/quickLog/state';
import type { IconKey } from '@/lib/quickLog/tiles';
import TileIcon from './TileIcon';

// Idea 4 "Today", round 6: one plain list, at most THREE rows showing.
// First what needs her (visits, doctor notes, results, a period due —
// lib/todayItems.ts), then what she logged today with the time, newest
// first. The rest folds behind "Show all". A brand-new day (or a brand-new
// account) gets a short, friendly empty state instead of a bare line.

export const TODAY_SHOWN = 3;
const ITEM_ICON: Record<string, IconKey> = {
  'visit-today': 'cal', 'visit-soon': 'cal', 'doctor-note': 'steth', 'flagged-results': 'flask',
  'period-late': 'drop', 'period-soon': 'drop', 'pms-soon': 'moodlow', setup: 'plus',
  'pill-missed': 'pillx', 'medicine-due': 'pill', 'vaccination-due': 'syringe', 'baby-vaccination': 'syringe',
  'mood-check': 'moodlow', 'mood-weekly': 'moodlow',
};

export const NOTHING_LOGGED = 'Nothing logged yet today';
export const NOTHING_LOGGED_HINT = 'Tap Log today. One tap is enough.';

type Row = { kind: 'item'; item: TodayItem } | { kind: 'logged'; row: LoggedRow };

export default function TodayLog({ items, logged, go }: { items: TodayItem[]; logged: LoggedRow[]; go: (t: Target) => void }) {
  const [all, setAll] = useState(false);
  const rows: Row[] = [...items.map(item => ({ kind: 'item' as const, item })), ...logged.map(row => ({ kind: 'logged' as const, row }))];
  const shown = all ? rows : rows.slice(0, TODAY_SHOWN);
  const hidden = rows.length - TODAY_SHOWN;
  return (
    <section className="mt-7" aria-labelledby="today-heading">
      <div className="flex items-baseline justify-between px-0.5 mb-1.5">
        <h2 id="today-heading" className="text-[20px] font-extrabold">Today</h2>
        {hidden > 0 && (
          <button type="button" onClick={() => setAll(v => !v)} aria-expanded={all} className="min-h-11 px-1 text-[16px] font-bold text-stage-accent hover:underline">
            {all ? 'Show less' : `Show all (${rows.length})`}
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="mt-1 rounded-3xl bg-stage-tint px-5 py-5" data-testid="today-empty">
          <p className="text-[17px] font-bold">{NOTHING_LOGGED}</p>
          <p className="mt-1 text-[15px] text-muted-foreground">{NOTHING_LOGGED_HINT}</p>
        </div>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {shown.map(r => r.kind === 'item' ? (
            <li key={r.item.id}>
              <button type="button" onClick={() => go(r.item.target)} className="w-full flex items-center gap-3 min-h-14 py-2 text-left text-[17px] font-medium hover:text-stage-accent">
                <span className="text-stage-accent"><TileIcon name={ITEM_ICON[r.item.id] ?? 'note'} className="h-5 w-5" strokeWidth={1.9} /></span>
                <span className="flex-1 truncate">{r.item.label}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </button>
            </li>
          ) : (
            <li key={r.row.id} className="flex items-center gap-3 min-h-14 py-2 text-[17px] font-medium">
              <span className="text-stage-accent"><TileIcon name={r.row.icon} className="h-5 w-5" strokeWidth={1.9} /></span>
              <span className="flex-1 truncate">{r.row.label}</span>
              <span className="text-muted-foreground tabular-nums">{r.row.time ? format(r.row.time, 'HH:mm') : 'today'}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
