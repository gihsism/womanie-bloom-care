// Drawing helpers for Womanie's own icon set.
//
// The icons are drawn in the same hand as the Home body maps: one ink line,
// round caps and joins, curves that are a touch uneven (never compass-perfect),
// and the body-map "leader dot" (a small filled dot at the end of a line) as
// the house signature. All coordinates live in a 24 x 24 box.

/** A glyph node: a stroked path, a filled dot, a filled shape, or a transformed group. */
export type GlyphNode =
  | string
  | { d: string; dash?: string; opacity?: number; width?: number }
  | ['dot', number, number, number?]
  | ['fill', string, number?]
  | ['g', string, GlyphNode[]];

const f = (n: number) => Number(n.toFixed(2));

/**
 * A hand-drawn ring: four cubic arcs whose radii differ by a percent or two,
 * so the circle reads as drawn rather than stamped. `turn` rotates where the
 * small irregularities fall, so neighbouring rings do not wobble in step.
 */
export function ring(cx: number, cy: number, r: number, turn = 0): string {
  const k = 0.5523;
  const wob = [0.018, -0.014, 0.022, -0.01];
  const pts = [0, 1, 2, 3].map((i) => {
    const a = turn + (i * Math.PI) / 2;
    const ri = r * (1 + wob[i]);
    return { x: cx + ri * Math.cos(a), y: cy + ri * Math.sin(a), tx: -Math.sin(a), ty: Math.cos(a), ri };
  });
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 0; i < 4; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % 4];
    d += ` C${f(p.x + p.tx * k * p.ri)} ${f(p.y + p.ty * k * p.ri)} ${f(q.x - q.tx * k * q.ri)} ${f(q.y - q.ty * k * q.ri)} ${f(q.x)} ${f(q.y)}`;
  }
  return d + 'Z';
}

/**
 * A soft rounded rectangle whose sides bow out very slightly (b), like a
 * sheet of paper drawn freehand.
 */
export function rr(x: number, y: number, w: number, h: number, r: number, b = 0.12): string {
  const k = 0.5523 * r;
  const x2 = x + w;
  const y2 = y + h;
  return [
    `M${f(x + r)} ${f(y)}`,
    `C${f(x + w * 0.38)} ${f(y - b)} ${f(x + w * 0.62)} ${f(y - b)} ${f(x2 - r)} ${f(y)}`,
    `C${f(x2 - r + k)} ${f(y)} ${f(x2)} ${f(y + r - k)} ${f(x2)} ${f(y + r)}`,
    `C${f(x2 + b)} ${f(y + h * 0.38)} ${f(x2 + b)} ${f(y + h * 0.62)} ${f(x2)} ${f(y2 - r)}`,
    `C${f(x2)} ${f(y2 - r + k)} ${f(x2 - r + k)} ${f(y2)} ${f(x2 - r)} ${f(y2)}`,
    `C${f(x + w * 0.62)} ${f(y2 + b)} ${f(x + w * 0.38)} ${f(y2 + b)} ${f(x + r)} ${f(y2)}`,
    `C${f(x + r - k)} ${f(y2)} ${f(x)} ${f(y2 - r + k)} ${f(x)} ${f(y2 - r)}`,
    `C${f(x - b)} ${f(y + h * 0.62)} ${f(x - b)} ${f(y + h * 0.38)} ${f(x)} ${f(y + r)}`,
    `C${f(x)} ${f(y + r - k)} ${f(x + r - k)} ${f(y)} ${f(x + r)} ${f(y)}Z`,
  ].join(' ');
}

/** A freehand straight line: a cubic with its middle nudged by `bow`. */
export function ln(x1: number, y1: number, x2: number, y2: number, bow = 0.18): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * bow;
  const ny = (dx / len) * bow;
  return `M${f(x1)} ${f(y1)} C${f(x1 + dx / 3 + nx)} ${f(y1 + dy / 3 + ny)} ${f(x1 + (2 * dx) / 3 + nx * 0.6)} ${f(y1 + (2 * dy) / 3 + ny * 0.6)} ${f(x2)} ${f(y2)}`;
}

/** A soft five-point star (ratings), points very slightly rounded. */
export function star(cx: number, cy: number, ro: number, ri: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? ro : ri;
    pts.push(`${f(cx + r * Math.cos(a))} ${f(cy + r * Math.sin(a))}`);
  }
  return `M${pts[0]} L${pts.slice(1).join(' L')}Z`;
}

/** Mirror transforms for groups. */
export const FLIP_X = 'matrix(-1 0 0 1 24 0)';
export const FLIP_Y = 'matrix(1 0 0 -1 0 24)';
export const rot = (deg: number) => `rotate(${deg} 12 12)`;
