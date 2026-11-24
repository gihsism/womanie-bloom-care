// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { LIFE_STAGES } from './lifeStage';
import { applyStageTheme } from './stageTheme';

// Idea 4 "Colour by stage": every stored life stage has its own colour set
// in src/index.css (the one place), and every text pair on it passes WCAG
// AA (4.5:1). Computed from the CSS itself so a palette edit can't slip
// through untested.

const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');

type RGB = [number, number, number];

function hslToRgb(h: number, s: number, l: number): RGB {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map(v => Math.round(v * 255)) as RGB;
}

function luminance([r, g, b]: RGB): number {
  const c = [r, g, b].map(v => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => Math.round(v * (1 - t) + b[i] * t)) as RGB;

function block(selector: string): string {
  const i = css.indexOf(selector);
  if (i < 0) throw new Error(`no block ${selector}`);
  return css.slice(i, css.indexOf('}', i));
}

function token(body: string, name: string): RGB {
  const m = body.match(new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`));
  if (!m) throw new Error(`no --${name}`);
  return hslToRgb(Number(m[1]), Number(m[2]), Number(m[3]));
}

const root = block(':root {');
const WHITE: RGB = [255, 255, 255];
const INK = token(root, 'foreground');
const MUTED = token(root, 'muted-foreground');
const AA = 4.5;

describe('idea 4 neutrals', () => {
  it('ink and muted text are AA on white', () => {
    expect(contrast(INK, WHITE)).toBeGreaterThanOrEqual(AA);
    expect(contrast(MUTED, WHITE)).toBeGreaterThanOrEqual(AA);
  });

  it('uses Figtree with a system fallback stack', () => {
    const tw = readFileSync(resolve(__dirname, '../../tailwind.config.ts'), 'utf8');
    expect(tw).toMatch(/sans: \['Figtree', 'ui-sans-serif', 'system-ui'/);
    const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
    expect(html).toContain('family=Figtree');
  });
});

describe.each(LIFE_STAGES)('stage colours: %s', (stage) => {
  const b = block(`[data-stage="${stage}"] {`);
  const head = token(b, 'stage-head');
  const headInk = token(b, 'stage-head-ink');
  const headMuted = token(b, 'stage-head-muted');
  const accent = token(b, 'stage-accent');
  const tint = token(b, 'stage-tint');
  // Fact boxes on the header: white at 70% over the header colour.
  const factBox = mix(head, WHITE, 0.7);

  it.each([
    ['header ink on header', headInk, head],
    ['header muted on header', headMuted, head],
    ['header ink on fact box', headInk, factBox],
    ['header muted on fact box', headMuted, factBox],
    ['accent on white (links, active tab)', accent, WHITE],
    ['white on accent (badges, buttons)', WHITE, accent],
    ['accent on tile', accent, tint],
    ['ink on tile (tile words)', INK, tint],
    ['header ink on chip (white 60%)', headInk, mix(head, WHITE, 0.6)],
  ] as const)('%s is AA', (_name, fg, bg) => {
    expect(contrast(fg as RGB, bg as RGB)).toBeGreaterThanOrEqual(AA);
  });

  it('header is a light, calm colour (white content stays the contrast base)', () => {
    expect(luminance(head)).toBeGreaterThan(0.6);
    expect(luminance(tint)).toBeGreaterThan(luminance(head));
  });
});

describe('one place', () => {
  it('every stored stage has exactly one block, and the shared tokens follow the stage', () => {
    for (const s of LIFE_STAGES) {
      expect(css.split(`[data-stage="${s}"] {`).length - 1).toBe(1);
    }
    expect(css).toMatch(/:root, \[data-stage\] \{[^}]*--primary: var\(--stage-accent\)/);
  });

  it('the stage colours are distinct', () => {
    const heads = LIFE_STAGES.map(s => block(`[data-stage="${s}"] {`).match(/--stage-head:\s*([^;]+);/)![1]);
    expect(new Set(heads).size).toBe(LIFE_STAGES.length);
  });
});

describe('applyStageTheme', () => {
  it('sets data-stage on <html> for stored stages only', () => {
    applyStageTheme('pregnancy');
    expect(document.documentElement.getAttribute('data-stage')).toBe('pregnancy');
    applyStageTheme('nonsense');
    expect(document.documentElement.hasAttribute('data-stage')).toBe(false);
  });
});
