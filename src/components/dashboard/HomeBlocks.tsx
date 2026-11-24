import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { MoreRow, Target } from '@/lib/todayItems';

// Home's navigation helper and its "More for <stage>" list (idea 4: the
// tiles and the Today list live in src/components/home/). Rows are one
// line with a chevron; a target is a route or a Log sheet ('sheet:log' /
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
        className="w-full flex items-center justify-between gap-3 min-h-12 py-2 text-left text-[17px] font-medium hover:text-primary transition-colors"
      >
        <span className="truncate">{label}</span>
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    </li>
  );
}

export function MoreForStage({ stage, rows, go }: { stage: string; rows: MoreRow[]; go: (t: Target) => void }) {
  if (!rows.length) return null;
  return (
    <section aria-labelledby="more-heading">
      <h2 id="more-heading" className="text-[19px] font-extrabold mb-1.5 px-0.5">More for {stage.toLowerCase() === 'ivf' ? 'IVF' : stage.toLowerCase()}</h2>
      <ul className="divide-y divide-line border-y border-line">
        {rows.map((r) => <Row key={r.label} label={r.label} onClick={() => go(r.target)} />)}
      </ul>
    </section>
  );
}
