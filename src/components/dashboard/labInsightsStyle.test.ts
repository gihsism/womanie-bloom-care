import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

// Home cards that show health values use the Health Records tones
// (muted ink in range, burnt-orange --destructive out of range): no
// traffic-light greens/yellows/reds and no emoji icons.
const FILES = [
  'PregnancyLabInsights.tsx',
  'CycleLabInsights.tsx',
  'ModeLabInsights.tsx',
  'LabInsightParts.tsx',
  'BloodPressureTracker.tsx',
  'PregnancyWeightTracker.tsx',
  'KickCounter.tsx',
  'AmhAgeContext.tsx',
  'EpdsScreener.tsx',
  'FertilityOutlookCard.tsx',
  'BetaHcgTracker.tsx',
  'PeriodFlowCard.tsx',
  'SleepTrendCard.tsx',
  'CycleHistoryCard.tsx',
];
const TRAFFIC = /\b(?:text|bg|border|from|via|to)-(?:green|emerald|yellow|amber|red)-\d{2,3}\b/g;
const EMOJI = /\p{Extended_Pictographic}/u;

describe('Home health-value cards use the house tones', () => {
  it.each(FILES)('%s has no traffic-light colour classes', (f) => {
    const src = readFileSync(resolve(__dirname, f), 'utf8');
    expect(src.match(TRAFFIC) ?? []).toEqual([]);
  });

  it.each(FILES.slice(0, 4))('%s shows no emoji icons', (f) => {
    const src = readFileSync(resolve(__dirname, f), 'utf8');
    expect(EMOJI.test(src)).toBe(false);
  });
});
