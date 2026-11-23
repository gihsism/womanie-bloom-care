import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

// Home heroes are trimmed to one fact, one sentence and one "Details"
// link: no buttons of their own (the primary button and the Today rows do
// the acting), no spelled-out duplicate of the number ("eighteen of
// twenty-eight" next to "18 of 28").
const HEROES = [
  'CycleDialHero.tsx',
  'PregnancyBodyMap.tsx',
  'BabyBodyMap.tsx',
  'PillRingHero.tsx',
  'MenopauseBodyMap.tsx',
  'IVFTimelineHero.tsx',
  'ModeHeroStat.tsx',
];
const read = (f: string) => readFileSync(resolve(__dirname, f), 'utf8');

describe('Home heroes are trimmed', () => {
  it.each(HEROES)('%s has no buttons, only a Details link', (f) => {
    const src = read(f);
    expect(src).not.toMatch(/<button\b/);
    expect(src).toMatch(/<DetailsLink\b/);
  });

  it.each(HEROES)('%s does not spell the number out a second time', (f) => {
    const src = read(f);
    expect(src).not.toMatch(/weekWord\(/);
    expect(src).not.toMatch(/of (twenty-eight|forty)/);
  });

  it.each(HEROES)('%s never shows a lab abbreviation or cycle jargon', (f) => {
    const src = read(f);
    expect(src).not.toMatch(/['">](Luteal|Follicular)\b/);
    expect(src).not.toMatch(/\b(TSH|AMH|EPDS|BBT)\b/);
  });

  it('the cycle dial shows the day in the heading, not again in the centre', () => {
    const src = read('CycleDialHero.tsx');
    expect(src).not.toMatch(/>\{d\.day\}<\/text>/);
    expect(src).not.toContain('of {L} days');
  });

  it('the baby hero links only to the baby tracker', () => {
    const src = read('BabyBodyMap.tsx');
    expect(src.match(/<DetailsLink\b/g)).toHaveLength(2); // empty state + main, one rendered at a time
    expect(src).toContain('to="/dashboard/baby" label="Baby tracker"');
  });
});
