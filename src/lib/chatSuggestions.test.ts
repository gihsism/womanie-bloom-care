import { describe, it, expect } from 'vitest';
import { pickSuggestions, STAGE_SUGGESTIONS, MAX_SUGGESTIONS } from './chatSuggestions';
import { LIFE_STAGES } from './lifeStage';

describe('pickSuggestions', () => {
  it('has a set for every stored life stage', () => {
    for (const s of LIFE_STAGES) expect(STAGE_SUGGESTIONS[s]?.length).toBeGreaterThan(0);
  });

  it('never offers more than 3', () => {
    for (const s of [...LIFE_STAGES, null]) {
      for (const hasUpcomingVisit of [true, false]) {
        const out = pickSuggestions({ lifeStage: s, hasContext: true, hasUpcomingVisit, hasFlaggedResults: true });
        expect(out.length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
        expect(out.length).toBeGreaterThan(0);
      }
    }
    expect(pickSuggestions({ lifeStage: null, hasContext: false })).toHaveLength(3);
  });

  it('uses the stage set, with an upcoming visit in the last slot', () => {
    expect(pickSuggestions({ lifeStage: 'pregnancy', hasContext: true })).toEqual(STAGE_SUGGESTIONS.pregnancy);
    const withVisit = pickSuggestions({ lifeStage: 'pregnancy', hasContext: true, hasUpcomingVisit: true });
    expect(withVisit[2]).toBe('What should I prepare for my next visit?');
    expect(withVisit.slice(0, 2)).toEqual(STAGE_SUGGESTIONS.pregnancy.slice(0, 2));
  });

  it('does not mutate the shared stage sets', () => {
    pickSuggestions({ lifeStage: 'ivf', hasContext: true, hasUpcomingVisit: true });
    expect(STAGE_SUGGESTIONS.ivf).not.toContain('What should I prepare for my next visit?');
  });
});
