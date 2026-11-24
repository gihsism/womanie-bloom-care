import { useState } from 'react';
import { format } from 'date-fns';
import { ChevronRight } from 'lucide-react';
import type { Target, TodayItem } from '@/lib/todayItems';
import type { LoggedRow } from '@/lib/quickLog/state';
import type { IconKey } from '@/lib/quickLog/tiles';
import TileIcon from './TileIcon';

// Idea 4 "Today": a plain list. First what needs her (visits, doctor
// notes, results, a period due — lib/todayItems.ts, max 3), then what she
// logged today with the time, newest first. Long logs fold behind "See all".

const SHOWN = 4;
const ITEM_ICON: Record<string, IconKey> = {
  'visit-today': 'cal', 'visit-soon': 'cal', 'doctor-note': 'steth', 'flagged-results': 'flask',
  'period-late': 'drop', 'period-soon': 'drop', 'pms-soon': 'moodlow', setup: 'plus',
};

export const NOTHING_LOGGED = 'Nothing logged yet today';

export default function TodayLog({ items, logged, go }: { items: TodayItem[]; logged: LoggedRow[]; go: (t: Target) => void }) {
  const [all, setAll] = useState(false);
  const rows = all ? logged : logged.slice(0, SHOWN);
  const more = logged.length > SHOWN;
  return (
    <section className="mt-6" aria-labelledby="today-heading">
      <div className="flex items-baseline justify-between px-0.5 mb-1.5">
        <h2 id="today-heading" className="text-[19px] font-extrabold">Today</h2>
        {more && (
          <button type="button" onClick={() => setAll(v => !v)} className="text-[16px] font-bold text-stage-accent hover:underline">
            {all ? 'Show less' : 'See all'}
          </button>
        )}
      </div>
      {items.length === 0 && logged.length === 0 ? (
        <p className="py-3 text-[16px] text-muted-foreground border-t border-line">{NOTHING_LOGGED}</p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {items.map(i => (
            <li key={i.id}>
              <button type="button" onClick={() => go(i.target)} className="w-full flex items-center gap-3 min-h-12 py-2 text-left text-[17px] font-medium hover:text-stage-accent">
                <span className="text-stage-accent"><TileIcon name={ITEM_ICON[i.id] ?? 'note'} className="h-5 w-5" strokeWidth={1.9} /></span>
                <span className="flex-1 truncate">{i.label}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </button>
            </li>
          ))}
          {rows.map(r => (
            <li key={r.id} className="flex items-center gap-3 min-h-12 py-2 text-[17px] font-medium">
              <span className="text-stage-accent"><TileIcon name={r.icon} className="h-5 w-5" strokeWidth={1.9} /></span>
              <span className="flex-1 truncate">{r.label}</span>
              <span className="text-muted-foreground tabular-nums">{r.time ? format(r.time, 'HH:mm') : 'today'}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
