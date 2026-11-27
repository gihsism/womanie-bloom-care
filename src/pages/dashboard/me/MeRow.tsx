import type { ReactElement, ReactNode } from 'react';
import { ChevronRight } from '@/components/icons';
import type { ArtProps } from '@/components/art';

// One tappable row on the Me page: label, an optional quiet value on the
// right ("Trying to conceive") and a chevron. No leading icon: rows are
// plain text like Home. The life-stage row may carry its small drawn plate
// (`art`), the one picture on the page.
export function MeRow({
  label,
  value,
  badge,
  art: Art,
  onClick,
  testId,
}: {
  label: string;
  value?: string;
  badge?: number;
  art?: (p: ArtProps) => ReactElement;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="w-full min-h-[48px] flex items-center gap-3 py-3 text-left hover:bg-muted/40 transition-colors"
    >
      <span className="flex-1 min-w-0 text-[15px]">{label}</span>
      {badge ? (
        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
          {badge}
        </span>
      ) : null}
      {value && <span className="text-sm text-muted-foreground truncate max-w-[45%]">{value}</span>}
      {Art && (
        <span className="w-16 flex-shrink-0" aria-hidden="true">
          <Art title={null} />
        </span>
      )}
      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
    </button>
  );
}

/** A group of rows under a DM Mono label, separated by hairlines (no box). */
export function MeGroup({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <section>
      {label && <h2 className="label-mono mb-1">{label}</h2>}
      <div className="border-y border-border divide-y divide-border">
        {children}
      </div>
    </section>
  );
}
