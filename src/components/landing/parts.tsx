import type { ReactNode } from 'react';

// Shared pieces of the public landing page. The page is laid out like a
// museum catalogue / anatomy atlas: each section opens with a ruled running
// head (a roman numeral and a DM Mono label), drawings carry FIG. numbers,
// and the text column sits off-centre instead of a centred hero + card grid.

/** The page column: wide on desktop, a 16px gutter on phones. */
export function Column({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 lg:px-10 ${className}`}>{children}</div>;
}

/** Ruled running head that opens a section: "II  What it does ........ 2 / 4". */
export function RunningHead({ no, label, id }: { no: string; label: string; id?: string }) {
  return (
    <div className="flex items-baseline gap-4 border-t border-foreground/70 pt-3">
      <span className="font-display text-sm text-primary" aria-hidden="true">{no}</span>
      <span id={id} className="label-mono">{label}</span>
    </div>
  );
}
