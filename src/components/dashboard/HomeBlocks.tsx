import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NOTHING_TODAY, type MoreRow, type PrimaryAction, type Target, type TodayItem } from '@/lib/todayItems';

// The three simple blocks under Home's hero: the ranked "Today" list, the
// one filled button, and "More for <stage>". Rows are one line with a
// chevron; a target is a route or a Log sheet ('sheet:log' /
// 'sheet:medicines'), which the page opens via onSheet.

export type SheetKind = 'log' | 'medicines';

export function useGo(onSheet: (k: SheetKind) => void) {
  const navigate = useNavigate();
  return (target: Target) => {
    if (target.startsWith('sheet:')) onSheet(target.slice(6) as SheetKind);
    else navigate(target);
  };
}

function Row({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="w-full flex items-center justify-between gap-3 py-3 text-left text-[15px] hover:text-primary transition-colors"
      >
        <span className="truncate">{label}</span>
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    </li>
  );
}

export function TodayList({ items, go }: { items: TodayItem[]; go: (t: Target) => void }) {
  return (
    <section className="mb-5" aria-labelledby="today-heading">
      <h2 id="today-heading" className="text-base font-semibold mb-1">Today</h2>
      {items.length === 0 ? (
        <p className="py-3 text-[15px] text-muted-foreground border-y border-border">{NOTHING_TODAY}</p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {items.map((i) => <Row key={i.id} label={i.label} onClick={() => go(i.target)} />)}
        </ul>
      )}
    </section>
  );
}

// The one filled button; `secondary` adds a quiet text link under it
// (today's log, when the filled button opens a stage tool instead).
export function PrimaryButton({ action, secondary, go }: { action: PrimaryAction; secondary?: PrimaryAction | null; go: (t: Target) => void }) {
  if (!secondary) {
    return (
      <Button type="button" size="lg" className="w-full mb-8" onClick={() => go(action.target)}>
        {action.label}
      </Button>
    );
  }
  return (
    <div className="mb-8 flex flex-col items-center gap-1">
      <Button type="button" size="lg" className="w-full" onClick={() => go(action.target)}>
        {action.label}
      </Button>
      <Button type="button" variant="link" size="sm" className="tap-target text-[15px]" onClick={() => go(secondary.target)}>
        {secondary.label}
      </Button>
    </div>
  );
}

export function MoreForStage({ stage, rows, go }: { stage: string; rows: MoreRow[]; go: (t: Target) => void }) {
  if (!rows.length) return null;
  return (
    <section aria-labelledby="more-heading">
      <h2 id="more-heading" className="text-base font-semibold mb-1">More for {stage.toLowerCase() === 'ivf' ? 'IVF' : stage.toLowerCase()}</h2>
      <ul className="divide-y divide-border border-y border-border">
        {rows.map((r) => <Row key={r.label} label={r.label} onClick={() => go(r.target)} />)}
      </ul>
    </section>
  );
}

// The one link a Home hero carries: to the stage's detail page.
export function DetailsLink({ to, label = 'Details' }: { to: string; label?: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 mt-2 text-sm font-medium text-primary hover:underline">
      {label}
      <ChevronRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}
