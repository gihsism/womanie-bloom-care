import { createElement, forwardRef, type ForwardRefExoticComponent, type ReactNode, type RefAttributes, type SVGProps } from 'react';
import type { GlyphNode } from './draw';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  /** Width and height (px number or CSS length). Default 24. */
  size?: number | string;
  /** Ink colour. Default currentColor. */
  color?: string;
  /** Line weight in the 24-unit box. Default 1.5 (the body-map line at icon size). */
  strokeWidth?: number | string;
  /** Keep the line weight constant in screen px whatever the size. */
  absoluteStrokeWidth?: boolean;
}

export type Icon = ForwardRefExoticComponent<IconProps & RefAttributes<SVGSVGElement>>;

const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').toLowerCase();

function renderNodes(nodes: GlyphNode[], color: string, prefix = ''): ReactNode[] {
  return nodes.map((n, i) => {
    const key = `${prefix}${i}`;
    if (typeof n === 'string') return createElement('path', { key, d: n });
    if (Array.isArray(n)) {
      if (n[0] === 'dot') return createElement('circle', { key, cx: n[1], cy: n[2], r: n[3] ?? 1, fill: color, stroke: 'none' });
      if (n[0] === 'fill') return createElement('path', { key, d: n[1], fill: color, stroke: 'none', opacity: n[2] });
      return createElement('g', { key, transform: n[1] }, renderNodes(n[2], color, `${key}-`));
    }
    return createElement('path', { key, d: n.d, strokeDasharray: n.dash, opacity: n.opacity, strokeWidth: n.width });
  });
}

/**
 * Build an icon component from a drawing. Decorative by default
 * (aria-hidden), unless it is given an accessible name.
 */
export function createIcon(name: string, glyph: GlyphNode[]): Icon {
  const cls = `w-icon w-icon-${kebab(name)}`;
  const Comp = forwardRef<SVGSVGElement, IconProps>(function WomanieIcon(
    { size = 24, color = 'currentColor', strokeWidth = 1.5, absoluteStrokeWidth, className, children, ...rest },
    ref,
  ) {
    const sw = absoluteStrokeWidth ? (Number(strokeWidth) * 24) / Number.parseFloat(String(size)) : strokeWidth;
    const named = rest['aria-label'] != null || rest['aria-labelledby'] != null || rest.role === 'img';
    return createElement(
      'svg',
      {
        ref,
        xmlns: 'http://www.w3.org/2000/svg',
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: color,
        strokeWidth: sw,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': named ? undefined : true,
        role: named ? 'img' : undefined,
        focusable: 'false',
        className: className ? `${cls} ${className}` : cls,
        ...rest,
      },
      ...renderNodes(glyph, color),
      children,
    );
  });
  Comp.displayName = name;
  return Comp;
}
