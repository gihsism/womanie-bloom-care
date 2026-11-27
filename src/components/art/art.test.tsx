import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import {
  AskAiMark, EMPTY_STATES, EMPTY_STATE_CAPTIONS, LIFE_STAGE_PLATES, LandingHeroFigure,
  MOOD_FACES, MOOD_VALUES, plateForStage,
} from './index';
import { LIFE_STAGES } from '@/lib/lifeStage';

function svgOf(el: ReactElement) {
  const { container } = render(el);
  const svg = container.querySelector('svg');
  expect(svg).not.toBeNull();
  return svg as SVGSVGElement;
}

function expectAccessible(svg: SVGSVGElement) {
  const named = svg.getAttribute('role') === 'img' && !!svg.getAttribute('aria-label');
  const hidden = svg.getAttribute('aria-hidden') === 'true';
  expect(named || hidden).toBe(true);
}

describe('art', () => {
  it.each(Object.entries(LIFE_STAGE_PLATES))('plate %s renders a named svg', (_k, Plate) => {
    const svg = svgOf(<Plate />);
    expect(svg).toHaveAttribute('role', 'img');
    expect(svg.getAttribute('aria-label')).toBeTruthy();
    expect(svg.getAttribute('viewBox')).toBe('0 0 320 220');
  });

  it('plates go decorative when the title is null', () => {
    const svg = svgOf(<LIFE_STAGE_PLATES.pregnancy title={null} />);
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).not.toHaveAttribute('role');
  });

  it('every app life stage maps to a plate', () => {
    for (const s of LIFE_STAGES) expect(plateForStage(s)).toBeTypeOf('function');
    expect(plateForStage('menstrual-cycle')).toBe(LIFE_STAGE_PLATES.cycle);
    expect(plateForStage('post-menopause')).toBe(LIFE_STAGE_PLATES.menopause);
    expect(plateForStage(undefined)).toBe(LIFE_STAGE_PLATES.general);
  });

  it.each(Object.entries(EMPTY_STATES))('empty state %s renders accessibly with a caption', (k, Empty) => {
    const svg = svgOf(<Empty />);
    expectAccessible(svg);
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    const caption = EMPTY_STATE_CAPTIONS[k as keyof typeof EMPTY_STATE_CAPTIONS];
    expect(caption.length).toBeGreaterThan(20);
    expect(caption).not.toMatch(/nothing here yet|!/i);
    expectAccessible(svgOf(<Empty title="Empty" />));
  });

  it('Ask AI mark is named and 40px by default', () => {
    const svg = svgOf(<AskAiMark />);
    expect(svg).toHaveAttribute('aria-label', 'Ask AI');
    expect(svg).toHaveAttribute('width', '40');
    expect(svgOf(<AskAiMark title={null} />)).toHaveAttribute('aria-hidden', 'true');
  });

  it('landing hero is named and carries its three labels', () => {
    const svg = svgOf(<LandingHeroFigure />);
    expectAccessible(svg);
    expect(svg).toHaveAttribute('role', 'img');
    expect(svg.textContent).toContain('CYCLE');
    expect(svg.textContent).toContain('LAB RESULTS');
    expect(svg.textContent).toContain('VISITS');
  });

  it.each(Object.entries(MOOD_FACES))('mood face %s renders a named svg', (k, Face) => {
    const svg = svgOf(<Face />);
    expect(svg).toHaveAttribute('role', 'img');
    expect(svg.getAttribute('aria-label')?.toLowerCase()).toBe(k);
    expect(svgOf(<Face title={null} />)).toHaveAttribute('aria-hidden', 'true');
  });

  it('mood map keys equal the mood values the app stores', () => {
    const files = ['src/components/dashboard/DailyLogging.tsx', 'src/components/dashboard/calendar/DailyLogSheet.tsx'];
    const used = new Set<string>();
    for (const f of files) {
      const src = fs.readFileSync(path.resolve(process.cwd(), f), 'utf8');
      const block = src.match(/const MOOD_OPTIONS = \[([\s\S]*?)\];/);
      expect(block, `MOOD_OPTIONS in ${f}`).not.toBeNull();
      for (const m of block![1].matchAll(/value:\s*'([^']+)'/g)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(0);
    expect(Object.keys(MOOD_FACES).sort()).toEqual([...used].sort());
    expect([...MOOD_VALUES].sort()).toEqual([...used].sort());
  });

  it('gradient ids are unique per instance', () => {
    const { container } = render(<><LIFE_STAGE_PLATES.cycle /><LIFE_STAGE_PLATES.cycle /></>);
    const ids = [...container.querySelectorAll('linearGradient')].map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
