import { cn } from '@/lib/utils';

// Womanie's own mark: the "o" of the name drawn as one ink line, in the
// same hand as the Home body maps and the cycle dial. The loop does not
// close cleanly: the pen runs a little past where it started, the way a
// hand-drawn ring does. The raspberry dot sits on the ring like the
// "today" marker on the cycle dial.
//
// Geometry is in a 32 x 32 box and is shared with the icon generator
// (scripts/brand-icons.mjs writes public/favicon.svg and the PNG icons
// from the same path), so the tab icon, the home-screen icon and the
// header wordmark are the same drawing.

export const LOOP_PATH =
  'M12.4 6.9C18.6 4.5 26.1 8.4 26.4 15.3C26.7 22.1 21.5 26.7 15.5 26.4C9.3 26.1 5.5 21.1 5.8 15.5C6.1 10.2 9.8 6.5 15.4 6.1';
export const DOT = { cx: 23.6, cy: 22.6 };

type Props = {
  variant?: 'wordmark' | 'mark';
  className?: string;
  /** Accessible name; defaults to "Womanie". */
  title?: string;
};

function Loop({ strokeWidth, dotR, size, viewBox, style }: {
  strokeWidth: number; dotR: number; size: string; viewBox: string; style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox={viewBox}
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      style={{ overflow: 'visible', flex: 'none', ...style }}
    >
      <path d={LOOP_PATH} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <circle
        cx={DOT.cx}
        cy={DOT.cy}
        r={dotR}
        fill="hsl(var(--primary))"
        stroke="var(--logo-halo, hsl(var(--background)))"
        strokeWidth={strokeWidth * 0.7}
      />
    </svg>
  );
}

export default function Logo({ variant = 'wordmark', className, title = 'Womanie' }: Props) {
  if (variant === 'mark') {
    return (
      <span role="img" aria-label={title} className={cn('inline-flex text-foreground', className)}>
        <Loop viewBox="0 0 32 32" size="1em" strokeWidth={2.4} dotR={3.2} />
      </span>
    );
  }
  // Wordmark: "W", the drawn loop at x-height, "manie" — set in Fraunces.
  return (
    <span
      role="img"
      aria-label={title}
      className={cn('inline-flex items-baseline whitespace-nowrap font-display font-medium leading-none tracking-[-0.01em] text-foreground', className)}
    >
      <span aria-hidden="true">W</span>
      <Loop
        viewBox="5 5 22.5 22.5"
        size="0.56em"
        strokeWidth={3.2}
        dotR={3.9}
        style={{ margin: '0 0.02em', transform: 'translateY(0.03em)' }}
      />
      <span aria-hidden="true">manie</span>
    </span>
  );
}
