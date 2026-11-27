import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRef } from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import * as Icons from './index';

const components = Object.entries(Icons).filter(
  ([, v]) => typeof v === 'object' && v !== null && 'render' in v,
) as [string, Icons.Icon][];

describe('Womanie icons', () => {
  it('exports the whole set', () => {
    expect(components.length).toBeGreaterThan(150);
  });

  it.each(components)('%s renders a decorative currentColor svg', (_name, Icon) => {
    const { container } = render(<Icon className="h-4 w-4" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('stroke', 'currentColor');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
    expect(svg!.getAttribute('class')).toContain('h-4 w-4');
    expect(svg!.childElementCount).toBeGreaterThan(0);
  });

  it('passes size, strokeWidth, style, handlers and ref through', () => {
    const ref = createRef<SVGSVGElement>();
    let clicked = false;
    const { container } = render(
      <Icons.Heart ref={ref} size={18} strokeWidth={2} style={{ opacity: 0.5 }} onClick={() => { clicked = true; }} data-testid="h" />,
    );
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('width', '18');
    expect(svg).toHaveAttribute('stroke-width', '2');
    expect(svg.style.opacity).toBe('0.5');
    expect(ref.current).toBe(svg);
    svg.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(clicked).toBe(true);
  });

  it('becomes a named image when given an aria-label', () => {
    const { container } = render(<Icons.Bell aria-label="Reminders" />);
    const svg = container.querySelector('svg')!;
    expect(svg).not.toHaveAttribute('aria-hidden');
    expect(svg).toHaveAttribute('role', 'img');
  });

  it('draws the AI marks without sparkles: Sparkles, Wand2, Bot and Brain are our own glyphs', () => {
    const d = (I: Icons.Icon) => render(<I />).container.innerHTML.replace(/w-icon-[a-z0-9-]+/g, '');
    expect(d(Icons.Sparkles)).toBe(d(Icons.Insight));
    expect(d(Icons.Wand2)).toBe(d(Icons.Insight));
    expect(d(Icons.Bot)).toBe(d(Icons.AskMark));
  });
});

describe('no stock icon library left in the app', () => {
  it('nothing under src imports lucide-react', () => {
    const src = resolve(__dirname, '../..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(tsx?|jsx?)$/.test(f) && /from\s*['"]lucide-react['"]/.test(readFileSync(p, 'utf8'))) offenders.push(p);
      }
    };
    walk(src);
    expect(offenders).toEqual([]);
  });
});
