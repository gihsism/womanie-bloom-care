// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { LIFE_STAGES } from './lifeStage';
import { applyClinicTheme, applyStageTheme, CLINIC_THEME } from './stageTheme';

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

// The doctor side's neutral "clinic" set gets exactly the same checks.
describe.each([...LIFE_STAGES, CLINIC_THEME])('stage colours: %s', (stage) => {
  const b = block(`\n  [data-stage="${stage}"] {`);
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

// Night mode: the same AA bar on every dark set (index.css .dark blocks).
// Text on the accent turns dark (--stage-on); fact boxes and chips use
// --stage-chip over the header instead of white.
const darkRoot = block('  .dark {');
const D_BG = token(darkRoot, 'background');
const D_CARD = token(darkRoot, 'card');
const D_INK = token(darkRoot, 'foreground');
const D_MUTED = token(darkRoot, 'muted-foreground');
const D_ON = token(darkRoot, 'stage-on');
const D_DESTR = token(darkRoot, 'destructive');
const D_DESTR_FG = token(darkRoot, 'destructive-foreground');
const D_MUTED_FILL = token(darkRoot, 'muted');

describe('night mode neutrals', () => {
  it('background is a warm near-black, not pure black', () => {
    expect(D_BG).not.toEqual([0, 0, 0]);
    expect(luminance(D_BG)).toBeLessThan(0.02);
    expect(D_BG[0]).toBeGreaterThanOrEqual(D_BG[2]); // warm: red >= blue
    expect(luminance(D_CARD)).toBeGreaterThan(luminance(D_BG)); // cards lifted
  });

  it.each([
    ['ink on background', D_INK, D_BG],
    ['ink on card', D_INK, D_CARD],
    ['muted on background', D_MUTED, D_BG],
    ['muted on card', D_MUTED, D_CARD],
    ['muted on muted fill', D_MUTED, D_MUTED_FILL],
    ['"talk to your doctor" amber on background', D_DESTR, D_BG],
    ['"talk to your doctor" amber on card', D_DESTR, D_CARD],
    ['amber on its 5% wash (Records rows)', D_DESTR, mix(D_CARD, D_DESTR, 0.05)],
    ['amber at 80% on card', mix(D_CARD, D_DESTR, 0.8), D_CARD],
    ['text on amber badge', D_DESTR_FG, D_DESTR],
    ['ink button text (secondary)', token(darkRoot, 'secondary-foreground'), token(darkRoot, 'secondary')],
  ] as const)('%s is AA', (_n, fg, bg) => {
    expect(contrast(fg as RGB, bg as RGB)).toBeGreaterThanOrEqual(AA);
  });

  it('form-field outline is 3:1 on background', () => {
    expect(contrast(token(darkRoot, 'input'), D_BG)).toBeGreaterThanOrEqual(3);
  });
});

describe.each(['default', ...LIFE_STAGES, CLINIC_THEME])('night stage colours: %s', (stage) => {
  const b = stage === 'default' ? darkRoot : block(`.dark[data-stage="${stage}"]`);
  const head = token(b, 'stage-head');
  const headInk = token(b, 'stage-head-ink');
  const headMuted = token(b, 'stage-head-muted');
  const accent = token(b, 'stage-accent');
  const tint = token(b, 'stage-tint');
  const chip = token(b, 'stage-chip');
  const factBox = mix(head, chip, 0.7);

  it.each([
    ['header ink on header', headInk, head],
    ['header muted on header', headMuted, head],
    ['header ink on fact box', headInk, factBox],
    ['header muted on fact box', headMuted, factBox],
    ['accent on background (links, active tab)', accent, D_BG],
    ['accent on card', accent, D_CARD],
    ['dark text on accent (badges, buttons, my chat bubble)', D_ON, accent],
    ['accent on tile', accent, tint],
    ['accent on tile icon circle', accent, chip],
    ['ink on tile (tile words)', D_INK, tint],
    ['muted on tile', D_MUTED, tint],
    ['header ink on chip (60%)', headInk, mix(head, chip, 0.6)],
  ] as const)('%s is AA', (_name, fg, bg) => {
    expect(contrast(fg as RGB, bg as RGB)).toBeGreaterThanOrEqual(AA);
  });

  it('header and tiles stay dark and calm (no bright blocks at night)', () => {
    expect(luminance(head)).toBeLessThan(0.05);
    expect(luminance(tint)).toBeLessThan(0.05);
    expect(luminance(tint)).toBeGreaterThan(luminance(D_BG));
  });
});

describe('one place', () => {
  it('every stored stage has exactly one block, and the shared tokens follow the stage', () => {
    for (const s of LIFE_STAGES) {
      expect(css.split(`\n  [data-stage="${s}"] {`).length - 1).toBe(1);
      expect(css.split(`.dark[data-stage="${s}"]`).length - 1).toBe(1);
    }
    expect(css).toMatch(/:root, \[data-stage\] \{[^}]*--primary: var\(--stage-accent\)/);
  });

  it('the stage colours are distinct, and the clinic set is none of them', () => {
    const all = [...LIFE_STAGES, CLINIC_THEME];
    for (const prefix of ['\n  ', '.dark']) {
      const heads = all.map(s => block(`${prefix}[data-stage="${s}"]`).match(/--stage-head:\s*([^;]+);/)![1]);
      const accents = all.map(s => block(`${prefix}[data-stage="${s}"]`).match(/--stage-accent:\s*([^;]+);/)![1]);
      expect(new Set(heads).size).toBe(all.length);
      expect(new Set(accents).size).toBe(all.length);
    }
    expect(css.split(`\n  [data-stage="${CLINIC_THEME}"] {`).length - 1).toBe(1);
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

describe('applyClinicTheme', () => {
  it('switches to clinic without remembering it, and the undo restores the stage', () => {
    localStorage.clear();
    applyStageTheme('pregnancy');
    localStorage.clear();
    const undo = applyClinicTheme();
    expect(document.documentElement.getAttribute('data-stage')).toBe('clinic');
    expect(localStorage.getItem('womanie_stage_theme')).toBeNull();
    undo();
    expect(document.documentElement.getAttribute('data-stage')).toBe('pregnancy');
  });

  it('undo clears the attribute when there was no stage, and leaves a newer stage alone', () => {
    document.documentElement.removeAttribute('data-stage');
    applyClinicTheme()();
    expect(document.documentElement.hasAttribute('data-stage')).toBe(false);
    const undo = applyClinicTheme();
    applyStageTheme('ivf');
    undo();
    expect(document.documentElement.getAttribute('data-stage')).toBe('ivf');
  });

  it('a stored stage is never "clinic"', () => {
    applyStageTheme(CLINIC_THEME);
    expect(document.documentElement.hasAttribute('data-stage')).toBe(false);
  });
});
