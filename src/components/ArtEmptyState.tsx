import type { ReactNode } from 'react';
import { EMPTY_STATES, EMPTY_STATE_CAPTIONS, type EmptyStateKind } from '@/components/art';
import { cn } from '@/lib/utils';

// The app's one empty state: a small drawing in the body-map hand, a plain
// caption that says what goes here, and (optionally) the action that starts
// it. No box, no dashed border, no icon tile: it sits straight on the page.
export function ArtEmptyState({
  kind,
  caption,
  children,
  compact = false,
  className,
  testId,
}: {
  kind: EmptyStateKind;
  /** Defaults to the drawing's own caption. */
  caption?: ReactNode;
  /** The action button(s), if any. */
  children?: ReactNode;
  /** Smaller drawing and padding, for lists inside a section. */
  compact?: boolean;
  className?: string;
  testId?: string;
}) {
  const Drawing = EMPTY_STATES[kind];
  return (
    <div
      className={cn('flex flex-col items-center text-center', compact ? 'py-4' : 'py-8', className)}
      data-testid={testId}
      data-empty-state={kind}
    >
      <div className={cn('w-full', compact ? 'max-w-[132px]' : 'max-w-[180px]')}>
        <Drawing />
      </div>
      <p className={cn('text-sm text-muted-foreground max-w-xs', compact ? 'mt-2' : 'mt-4')}>
        {caption ?? EMPTY_STATE_CAPTIONS[kind]}
      </p>
      {children ? <div className="mt-4 flex flex-col items-center gap-2">{children}</div> : null}
    </div>
  );
}

export default ArtEmptyState;
