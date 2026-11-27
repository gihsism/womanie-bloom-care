import type { LucideIcon } from '@/components/icons';
import { ChevronRight } from '@/components/icons';

// One tappable row on the Me page: icon, label, an optional quiet value
// on the right ("Trying to conceive") and a chevron. Uses the current
// tokens only; the visual redesign comes later.
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
      className="tap-target w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/50 transition-colors"
    >
      <Icon className="h-5 w-5 text-muted-foreground flex-shrink-0" aria-hidden="true" />
      <span className="flex-1 text-sm font-medium">{label}</span>
      {badge ? (
        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
          {badge}
        </span>
      ) : null}
      {value && <span className="text-sm text-muted-foreground truncate max-w-[45%]">{value}</span>}
      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
    </button>
  );
}

/** A group of rows in one bordered block, separated by hairlines. */
export function MeGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card divide-y divide-border overflow-hidden">
      {children}
    </div>
  );
}
