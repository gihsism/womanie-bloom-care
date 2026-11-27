import { useId, type ReactNode } from 'react';

// Shared "hand" for Womanie's own drawings: the same ink line, porcelain-
// stone fills and single raspberry accent as the Home body maps
// (PregnancyBodyMap, MenopauseBodyMap, BabyBodyMap, CycleDialHero).
//
// Colours are CSS variables so the art follows the tokens. The art-specific
// ones (--art-ink, --art-stone-*) are optional: when a theme does not set
// them the fallbacks are the exact body-map values. The figure ink sits on
// stone, so it stays dark in dark mode; anything drawn straight on the page
// background (leader lines, axes, labels) uses the theme foreground instead.

export const INK = 'var(--art-ink, #1A1A19)';
/** Ink for strokes drawn straight on the page (not on stone): follows the theme, so it shows in dark mode. */
export const PEN = 'hsl(var(--foreground))';
export const STONE_HI = 'var(--art-stone-1, #FCF6F4)';
export const STONE_MID = 'var(--art-stone-2, #EADDD9)';
export const STONE_LO = 'var(--art-stone-3, #D9C8C3)';
export const ACCENT = 'hsl(var(--primary))';
export const LINE = 'hsl(var(--foreground) / 0.72)';
export const FAINT = 'hsl(var(--muted-foreground) / 0.5)';
export const RULE = 'hsl(var(--border))';
export const LABEL = 'hsl(var(--muted-foreground))';
export const PAPER = 'hsl(var(--background))';
export const MONO = "'DM Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

/** Props every drawing accepts. Leave `title` out (or null) to mark the art decorative. */
export interface ArtProps {
  /** Accessible name. Omit or pass null for decorative use: the svg is then aria-hidden. */
  title?: string | null;
  className?: string;
}

/** Ids for gradients and filters that are unique per rendered instance. */
export function useArtIds() {
  const raw = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return { stone: `art-stone-${raw}`, shadow: `art-shadow-${raw}`, glow: `art-glow-${raw}` };
}

export type ArtIds = ReturnType<typeof useArtIds>;

/** The stone gradient, the soft offset shadow and the raspberry glow of the body maps. */
export function ArtDefs({ ids, shadow = 8 }: { ids: ArtIds; shadow?: number }) {
  return (
    <defs>
      <linearGradient id={ids.stone} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={STONE_HI} />
        <stop offset=".55" stopColor={STONE_MID} />
        <stop offset="1" stopColor={STONE_LO} />
      </linearGradient>
      <radialGradient id={ids.glow} cx=".5" cy=".5" r=".6">
        <stop offset="0" stopColor={ACCENT} stopOpacity=".22" />
        <stop offset=".7" stopColor={ACCENT} stopOpacity=".06" />
        <stop offset="1" stopColor={ACCENT} stopOpacity="0" />
      </radialGradient>
      <filter id={ids.shadow} x="-30%" y="-20%" width="160%" height="150%">
        <feGaussianBlur in="SourceAlpha" stdDeviation={shadow} />
        <feOffset dx={shadow * 0.7} dy={shadow * 0.8} />
        <feComponentTransfer><feFuncA type="linear" slope=".14" /></feComponentTransfer>
        <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
  );
}

/** Root svg: scales with its container width (or a fixed `size` in px) and keeps its aspect ratio. */
export function ArtSvg({
  w, h, title, className, children, name, size,
}: ArtProps & { w: number; h: number; children: ReactNode; name: string; size?: number }) {
  const a11y = title
    ? { role: 'img' as const, 'aria-label': title }
    : { 'aria-hidden': true as const, focusable: 'false' as const };
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={size ?? '100%'}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      style={{ display: 'block', height: 'auto', aspectRatio: `${w} / ${h}`, ...(size ? { width: size, flexShrink: 0 } : null) }}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      data-art={name}
      {...a11y}
    >
      {children}
    </svg>
  );
}

type Pt = readonly [number, number];

/**
 * A leader-line label, as on an anatomy plate: a small dot on the drawing,
 * a hairline with one elbow, and a DM Mono caption at the end.
 */
export function Leader({
  from, via, to, label, accent = false, size = 8.5,
}: { from: Pt; via?: Pt; to: Pt; label: string; accent?: boolean; size?: number }) {
  const pts = [from, ...(via ? [via] : []), to].map(([x, y]) => `${x},${y}`).join(' ');
  const goesLeft = to[0] < (via ?? from)[0];
  return (
    <g>
      <polyline points={pts} stroke={LINE} strokeWidth=".7" fill="none" />
      <circle cx={from[0]} cy={from[1]} r="2" fill={accent ? ACCENT : PEN} stroke={PAPER} strokeWidth=".8" />
      <text
        x={to[0] + (goesLeft ? -4 : 4)}
        y={to[1] + size * 0.34}
        textAnchor={goesLeft ? 'end' : 'start'}
        fontFamily={MONO}
        fontSize={size}
        letterSpacing=".08em"
        fill={LABEL}
        stroke="none"
      >
        {label.toUpperCase()}
      </text>
    </g>
  );
}

/** A soft contact shadow under a drawn object. */
export function Ground({ cx, cy, rx, ry = 4 }: { cx: number; cy: number; rx: number; ry?: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#1A1A19" opacity=".08" stroke="none" />;
}

// ---- Shared anatomy ---------------------------------------------------------

/** The body-map woman in profile, native box about 320 x 680 (head top ≈ 39, feet ≈ 660). */
const HEAD = { cx: 152, cy: 74, rx: 29, ry: 35, rotate: -12 };
const BUN = { cx: 118, cy: 56, r: 15 };
const BODY =
  'M140,104 C141,114 141,122 136,130 C122,140 114,160 113,190 C112,240 112,280 118,318 C106,346 98,372 104,400 C110,440 118,470 120,510 C122,560 126,600 128,644 L130,656 C150,660 170,660 186,656 C174,648 162,640 158,630 C156,590 158,560 164,530 C170,500 176,470 178,440 C180,425 182,418 186,410 C196,392 200,356 198,316 C196,284 194,258 192,238 C206,228 208,192 188,170 C178,158 170,150 168,142 C164,128 162,118 160,108 Z';
const BODY_PREGNANT =
  'M140,104 C141,114 141,122 136,130 C122,140 114,160 113,190 C112,240 112,280 118,318 C106,346 98,372 104,400 C110,440 118,470 120,510 C122,560 126,600 128,644 L130,656 C150,660 170,660 186,656 C174,648 162,640 158,630 C156,590 158,560 164,530 C170,500 176,470 178,440 C180,425 182,418 186,410 C230,396 264,356 262,316 C260,272 226,246 192,238 C206,228 208,192 188,170 C178,158 170,150 168,142 C164,128 162,118 160,108 Z';
const ARM = 'M132,150 C124,200 126,250 140,290';
const LEG_LINE = 'M150,452 C146,520 146,580 150,640';

/** The figure, drawn in its native box; place it with `transform`. */
export function Figure({
  ids, transform, pregnant = false, forearm, weight = 1,
}: { ids: ArtIds; transform: string; pregnant?: boolean; forearm?: string; /** stroke multiplier, so a scaled-down figure keeps a 1.2px line */ weight?: number }) {
  return (
    <g transform={transform} stroke={INK}>
      <g filter={`url(#${ids.shadow})`}>
        <ellipse cx={HEAD.cx} cy={HEAD.cy} rx={HEAD.rx} ry={HEAD.ry}
          transform={`rotate(${HEAD.rotate} ${HEAD.cx} ${HEAD.cy})`} fill={`url(#${ids.stone})`} strokeWidth={1.2 * weight} />
        <circle cx={BUN.cx} cy={BUN.cy} r={BUN.r} fill={`url(#${ids.stone})`} strokeWidth={1.2 * weight} />
        <path d={pregnant ? BODY_PREGNANT : BODY} fill={`url(#${ids.stone})`} strokeWidth={1.2 * weight} />
      </g>
      <path d={ARM} strokeWidth={1 * weight} opacity=".55" />
      <path d={forearm ?? (pregnant
        ? 'M140,290 C152,330 170,360 196,376 C204,381 214,382 222,378'
        : 'M140,290 C150,330 166,360 186,376 C192,380 198,381 204,378')} strokeWidth={1.2 * weight} />
      <path d={LEG_LINE} strokeWidth={0.9 * weight} opacity=".35" />
    </g>
  );
}

/**
 * Uterus with tubes and ovaries, front view, centred on (0,0), about
 * 150 wide and 95 tall. `lining` (0-1) fills the cavity with the accent;
 * `follicle` draws a ripe follicle on the right ovary.
 */
export function Uterus({ ids, lining = 0, follicle = false }: { ids: ArtIds; lining?: number; follicle?: boolean }) {
  return (
    <g stroke={INK}>
      <g stroke={PEN}>
        <path d="M-24,-27 C-38,-38 -56,-40 -66,-29 C-72,-22 -71,-12 -63,-9" strokeWidth="1.1" />
        <path d="M-63,-9 l-5,3 M-64,-12 l-6,0 M-62,-6 l-3,5" strokeWidth=".8" opacity=".7" />
        <path d="M24,-27 C38,-37 57,-41 67,-30 C73,-23 71,-13 64,-10" strokeWidth="1.1" />
        <path d="M64,-10 l5,3 M65,-13 l6,-1 M63,-7 l3,5" strokeWidth=".8" opacity=".7" />
      </g>
      <g filter={`url(#${ids.shadow})`}>
        <ellipse cx="-50" cy="-4" rx="11" ry="7.5" transform="rotate(-18 -50 -4)" fill={`url(#${ids.stone})`} strokeWidth="1.1" />
        <ellipse cx="51" cy="-5" rx="11" ry="7" transform="rotate(16 51 -5)" fill={`url(#${ids.stone})`} strokeWidth="1.1" />
        <path d="M-26,-28 C-31,-6 -21,17 -9,30 C-8,36 -8,41 -7,45 C-3,48 3,48 7,45 C8,41 8,36 9,30 C21,17 30,-6 26,-29 C13,-35 -13,-34 -26,-28 Z"
          fill={`url(#${ids.stone})`} strokeWidth="1.2" />
      </g>
      <path d="M-15,-20 C-11,-2 -4,13 0,23 C4,13 11,-3 15,-21 C6,-24 -6,-23 -15,-20 Z"
        fill={lining ? ACCENT : 'none'} fillOpacity={lining} strokeWidth=".9" opacity={lining ? 1 : 0.55} />
      <path d="M-53,-2 c3,-3 6,-2 7,1" strokeWidth=".7" opacity=".45" />
      {follicle && (
        <>
          <circle cx="56" cy="-6" r="4.2" fill={PAPER} strokeWidth=".9" />
          <circle cx="56" cy="-6" r="1.7" fill={ACCENT} stroke="none" />
        </>
      )}
    </g>
  );
}
