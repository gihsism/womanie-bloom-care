import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';

// One tappable row on the Me page: icon, label, an optional quiet value
// on the right ("Trying to conceive") and a chevron. Idea 4: the same
// row scale as Home's Today list, icons in the stage accent.
export function MeRow({
  icon: Icon,
  label,
  value,
  badge,
  onClick,
  testId,
}: {
  icon: LucideIcon;
  label: string;
  value?: string;
  badge?: number;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="tap-target w-full flex items-center gap-3 min-h-14 px-4 py-3 text-left hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stage-accent"
    >
      <Icon className="h-5 w-5 text-stage-accent flex-shrink-0" strokeWidth={1.9} aria-hidden="true" />
      <span className="flex-1 min-w-0 truncate text-[17px] font-medium">{label}</span>
      {badge ? (
        <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-destructive text-destructive-foreground text-[13px] font-bold tabular-nums">
          {badge}
        </span>
      ) : null}
      {value && <span className="text-[15px] text-muted-foreground truncate max-w-[45%]">{value}</span>}
      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
    </button>
  );
}

/** A group of rows in one bordered block, separated by hairlines. */
export function MeGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="row-group">
      {children}
    </div>
  );
}
