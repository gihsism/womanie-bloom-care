import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

// Idea 4 replaced the per-stage Home heroes (figures, dials, rings) with
// one coloured stage header. The header keeps the same trim the heroes had:
// one fact (the big line), one sentence, two small facts, no buttons of
// its own (the tiles do the acting) and a single link (the stage chip).
// The wording rules — no spelled-out duplicate of the number, no cycle
// jargon or lab abbreviations — are checked on every stage in
// src/lib/stageHeader.test.ts.
const OLD_HEROES = [
  'CycleDialHero.tsx',
  'PregnancyBodyMap.tsx',
  'BabyBodyMap.tsx',
  'PillRingHero.tsx',
  'MenopauseBodyMap.tsx',
  'IVFTimelineHero.tsx',
  'ModeHeroStat.tsx',
];
const read = (f: string) => readFileSync(resolve(__dirname, f), 'utf8');

describe('Home header is trimmed', () => {
  const header = read('../home/StageHeader.tsx');

  it('has no buttons and exactly one link (the stage chip)', () => {
    expect(header).not.toMatch(/<button\b/);
    expect(header.match(/<Link\b/g)).toHaveLength(1);
  });

  it('shows one big line, one sentence and the two facts', () => {
    expect(header.match(/<h1\b/g)).toHaveLength(1);
    expect(header).toContain('{model.big}');
    expect(header).toContain('{model.sentence}');
    expect(header).toMatch(/model\.facts\.map/);
  });

  it.each(OLD_HEROES)('the old hero %s is gone (no second status block on Home)', (f) => {
    expect(existsSync(resolve(__dirname, f))).toBe(false);
  });

  it('the header never spells the number out or shows lab abbreviations', () => {
    const src = read('../../lib/stageHeader.ts');
    expect(src).not.toMatch(/weekWord\(/);
    expect(src).not.toMatch(/['">](Luteal|Follicular)\b/);
    expect(src).not.toMatch(/\b(TSH|AMH|EPDS|BBT)\b/);
  });
});
