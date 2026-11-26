import { describe, it, expect } from 'vitest';
import {
  pickSuggestions,
  flaggedLabQuestion,
  labNameForQuestion,
  momentQuestion,
  pregnancyQuestion,
  postpartumQuestion,
  IVF_PHASE_QUESTIONS,
  STAGE_SUGGESTIONS,
  MAX_SUGGESTIONS,
} from './chatSuggestions';
import { LIFE_STAGES } from './lifeStage';

describe('pickSuggestions', () => {
  it('has a set for every stored life stage', () => {
    for (const s of LIFE_STAGES) expect(STAGE_SUGGESTIONS[s]?.length).toBeGreaterThan(0);
  });

  it('always offers exactly 4, never duplicates', () => {
    for (const s of [...LIFE_STAGES, null]) {
      for (const hasUpcomingVisit of [true, false]) {
        for (const hasContext of [true, false]) {
          const out = pickSuggestions({
            lifeStage: s, hasContext, hasUpcomingVisit, hasFlaggedResults: true,
            pregnancyWeek: 31, postpartumWeeks: 4, ivfPhase: 'transfer', cyclePhase: 'luteal',
            flaggedLabs: [{ title: 'Ferritin', status: 'low' }],
          });
          expect(out).toHaveLength(MAX_SUGGESTIONS);
          expect(new Set(out.map((q) => q.toLowerCase())).size).toBe(out.length);
        }
      }
    }
    expect(pickSuggestions({ lifeStage: null, hasContext: false })).toHaveLength(MAX_SUGGESTIONS);
  });

  it('pregnancy week 31 with a low ferritin on file: the brief example', () => {
    const out = pickSuggestions({
      lifeStage: 'pregnancy', hasContext: true, pregnancyWeek: 31,
      flaggedLabs: [{ title: 'Ferritin (Serum)', status: 'low' }, { title: 'TSH', status: 'high' }],
    });
    expect(out[0]).toBe('What does my low ferritin mean?');
    expect(out[1]).toBe('Is swelling in my feet normal now?');
    expect(out.slice(2)).toEqual(STAGE_SUGGESTIONS.pregnancy.slice(0, 2));
  });

  it('an upcoming visit comes after the lab and the moment questions', () => {
    const out = pickSuggestions({ lifeStage: 'pregnancy', hasContext: true, pregnancyWeek: 10, hasUpcomingVisit: true });
    expect(out[0]).toBe('Is nausea normal at week 10?');
    expect(out[1]).toBe('What should I prepare for my next visit?');
  });

  it('no records: the stage moment first, then getting-started questions', () => {
    const out = pickSuggestions({ lifeStage: 'postpartum', hasContext: false, postpartumWeeks: 1, flaggedLabs: [{ title: 'Ferritin', status: 'low' }] });
    expect(out).toEqual(['How much bleeding is normal in the first weeks?', 'What can you help me with?', 'What should I upload first?', 'What tests should I be tracking?']);
  });

  it('is deterministic: same inputs, same questions', () => {
    const input = { lifeStage: 'ivf', hasContext: true, ivfPhase: 'tww', flaggedLabs: [{ title: 'AMH', status: 'low' }] };
    expect(pickSuggestions(input)).toEqual(pickSuggestions(input));
    expect(pickSuggestions(input).slice(0, 2)).toEqual(['What does my low AMH mean?', IVF_PHASE_QUESTIONS.tww]);
  });

  it('unknown stage with records: results-based set', () => {
    const out = pickSuggestions({ lifeStage: null, hasContext: true, hasFlaggedResults: true });
    expect(out).toContain('Which results should I worry about?');
    expect(out).toContain('What do my latest results mean?');
  });

  it('does not mutate the shared stage sets', () => {
    pickSuggestions({ lifeStage: 'ivf', hasContext: true, hasUpcomingVisit: true });
    expect(STAGE_SUGGESTIONS.ivf).not.toContain('What should I prepare for my next visit?');
  });
});

describe('starter question rules', () => {
  it('names the flagged lab in plain words, keeps acronyms', () => {
    expect(labNameForQuestion('Ferritin')).toBe('ferritin');
    expect(labNameForQuestion('Vitamin D (25-OH)')).toBe('vitamin D');
    expect(labNameForQuestion('HbA1c')).toBe('HbA1c');
    expect(labNameForQuestion('Free T4')).toBe('free T4');
    expect(labNameForQuestion('')).toBeNull();
    expect(labNameForQuestion('A very long lab test name that goes on and on')).toBeNull();
    expect(flaggedLabQuestion({ title: 'TSH', status: 'High' })).toBe('What does my high TSH mean?');
    expect(flaggedLabQuestion({ title: 'Hemoglobin', status: 'decreased' })).toBe('What does my low hemoglobin mean?');
    expect(flaggedLabQuestion({ title: 'CRP', status: 'abnormal' })).toBe('What does my out-of-range CRP mean?');
  });

  it('a lab title that cannot be phrased falls through to the next flagged one', () => {
    const out = pickSuggestions({ lifeStage: 'menopause', hasContext: true, flaggedLabs: [{ title: '???', status: 'low' }, { title: 'FSH', status: 'high' }] });
    expect(out[0]).toBe('What does my high FSH mean?');
  });

  it('pregnancy questions follow the week', () => {
    expect(pregnancyQuestion(2)).toBeNull();
    expect(pregnancyQuestion(8)).toBe('Is nausea normal at week 8?');
    expect(pregnancyQuestion(16)).toBe('What happens at the anatomy scan?');
    expect(pregnancyQuestion(24)).toMatch(/glucose test/);
    expect(pregnancyQuestion(31)).toBe('Is swelling in my feet normal now?');
    expect(pregnancyQuestion(38)).toBe('How do I know labour is starting?');
  });

  it('postpartum questions follow the weeks since birth', () => {
    expect(postpartumQuestion(0)).toMatch(/bleeding/);
    expect(postpartumQuestion(5)).toMatch(/6-week check-up/);
    expect(postpartumQuestion(9)).toMatch(/exercising/);
    expect(postpartumQuestion(30)).toMatch(/tired/);
  });

  it('the moment question only uses data for the stage she is in now', () => {
    // A stale due date on an IVF profile must not produce pregnancy questions.
    expect(momentQuestion({ lifeStage: 'ivf', hasContext: true, pregnancyWeek: 31, ivfPhase: 'stimulation' })).toBe(IVF_PHASE_QUESTIONS.stimulation);
    expect(momentQuestion({ lifeStage: 'menopause', hasContext: true, pregnancyWeek: 31, cyclePhase: 'luteal' })).toBeNull();
    expect(momentQuestion({ lifeStage: 'conception', hasContext: true, cyclePhase: 'ovulation' })).toBe('Is now a good time to try to conceive?');
    expect(momentQuestion({ lifeStage: 'menstrual-cycle', hasContext: true, cyclePhase: 'ovulation' })).toBe('What are the signs that I am ovulating?');
    expect(momentQuestion({ lifeStage: 'ivf', hasContext: true, ivfPhase: 'unknown-phase' })).toBeNull();
  });
});
