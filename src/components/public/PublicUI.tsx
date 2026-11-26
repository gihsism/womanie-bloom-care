import type { ReactNode } from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import type { LifeStage } from '@/components/dashboard/DashboardHeader';
import { cn } from '@/lib/utils';

// Building blocks for the public pages (landing, Product, Pricing, About
// ...) in idea 4: white page, one bold left-aligned title per section,
// content as hairline rows with a tinted icon, and ONE primary button
// per page (btn-stage). No gradients, glows or hover lifts.

/** Big page title + one line + (optionally) the page's one call to action. */
export function PublicHero({ title, sub, cta, children, className }: {
  title: ReactNode;
  sub?: ReactNode;
  cta?: { label: string; onClick: () => void };
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('px-4 pt-24 pb-10 lg:pt-32 lg:pb-14', className)}>
      <div className="mx-auto max-w-3xl">
        <h1 className="text-[2.25rem] lg:text-[3.25rem] leading-[1.08] font-extrabold tracking-[-0.02em] text-foreground">{title}</h1>
        {sub && <p className="mt-4 text-[17px] lg:text-[19px] leading-relaxed text-muted-foreground">{sub}</p>}
        {cta && (
          <button type="button" onClick={cta.onClick} className="btn-stage mt-7 w-full sm:w-auto sm:px-8">
            {cta.label}
          </button>
        )}
        {children}
      </div>
    </section>
  );
}

export function PublicSection({ id, title, sub, children, className }: { id?: string; title?: ReactNode; sub?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={cn('px-4 py-10 lg:py-14', className)}>
      <div className="mx-auto max-w-3xl">
        {title && <h2 className="text-[1.625rem] lg:text-[2rem] leading-tight font-extrabold tracking-[-0.015em]">{title}</h2>}
        {sub && <p className="mt-2 text-[16px] leading-relaxed text-muted-foreground">{sub}</p>}
        <div className={title || sub ? 'mt-6' : ''}>{children}</div>
      </div>
    </section>
  );
}

export interface IconRow {
  icon?: LucideIcon;
  /** A number instead of an icon (numbered steps). */
  n?: number;
  title: ReactNode;
  description?: ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
  /** Show the row in this life stage's colours. */
  stage?: LifeStage;
}

/** A list of points as hairline rows; rows with onClick become buttons. */
export function IconRows({ items, className }: { items: IconRow[]; className?: string }) {
  return (
    <div className={cn('row-group', className)}>
      {items.map((it, i) => {
        const Icon = it.icon;
        const inner = (
          <>
            <span className="grid place-items-center h-11 w-11 shrink-0 rounded-full bg-stage-tint text-stage-accent font-extrabold text-[16px]" aria-hidden="true">
              {Icon ? <Icon className="h-5 w-5" strokeWidth={1.9} /> : it.n}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[16px] font-bold leading-snug text-foreground">{it.title}</span>
              {it.description && <span className="block mt-0.5 text-[15px] leading-relaxed text-muted-foreground">{it.description}</span>}
            </span>
            {it.onClick && <ChevronRight className="h-5 w-5 shrink-0 self-center text-muted-foreground" aria-hidden="true" />}
          </>
        );
        const cls = 'w-full flex items-start gap-3.5 px-4 py-4 text-left';
        return it.onClick ? (
          <button key={i} type="button" data-stage={it.stage} onClick={it.onClick} aria-label={it.ariaLabel} className={cn(cls, 'hover:bg-muted/60')}>
            {inner}
          </button>
        ) : (
          <div key={i} data-stage={it.stage} className={cls}>{inner}</div>
        );
      })}
    </div>
  );
}

/** A quiet text link for second actions, so each page keeps one button. */
export function TextLink({ onClick, children, className }: { onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={cn('inline-flex items-center gap-1 min-h-11 text-[16px] font-semibold text-stage-accent hover:underline underline-offset-4', className)}>
      {children}
    </button>
  );
}
