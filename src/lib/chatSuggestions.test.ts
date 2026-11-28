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

// Round 13 chip audit: every starter chip each stage can show, over every
// moment it can be in, with and without records, a visit and flagged labs.
describe('starter chip audit, every stage', () => {
  const ALL_PHASES = ['menstrual', 'follicular', 'ovulation', 'luteal', 'late-luteal'] as const;
  const variants = (stage: string | null) => {
    const out: string[][] = [];
    for (const hasContext of [true, false])
      for (const hasUpcomingVisit of [true, false])
        for (const flaggedLabs of [[], [{ title: 'Ferritin', status: 'low' }], [{ title: 'Beta hCG', status: 'high' }, { title: 'TSH', status: 'high' }]])
          for (const week of [null, 6, 16, 24, 31, 38])
            for (const pp of [null, 1, 4, 9, 30])
              for (const ivfPhase of [null, ...Object.keys(IVF_PHASE_QUESTIONS)])
                for (const cyclePhase of [null, ...ALL_PHASES])
                  out.push(pickSuggestions({
                    lifeStage: stage, hasContext, hasUpcomingVisit, hasFlaggedResults: flaggedLabs.length > 0, flaggedLabs,
                    pregnancyWeek: week, postpartumWeeks: pp, ivfPhase, cyclePhase,
                  }));
    return out;
  };
  // Words that belong to one stage only: a chip with them anywhere else is stale.
  const OWN_WORDS: Record<string, RegExp> = {
    pregnancy: /\b(week \d+|anatomy scan|glucose test|labour|swelling in my feet|pregnancy progressing)\b/i,
    postpartum: /\b(after birth|since birth|postpartum|6-week check-up|exercising again)\b/i,
    ivf: /\b(ivf|stimulation|trigger|egg collection|embryo|two-week wait)\b/i,
    'pre-menstrual': /\b(first period|period kit)\b/i,
    menopause: /\bmenopause transition\b/i,
  };
  const norm = (q: string) => q.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

  for (const stage of [...LIFE_STAGES, null]) {
    it(`${stage ?? 'no stage'}: 4 distinct chips, none from another stage, all answerable`, () => {
      for (const out of variants(stage)) {
        expect(out).toHaveLength(MAX_SUGGESTIONS);
        expect(new Set(out.map(norm)).size, out.join(' | ')).toBe(out.length);
        for (const q of out) {
          for (const [own, re] of Object.entries(OWN_WORDS)) {
            if (own !== stage) expect(re.test(q), `${stage}: "${q}" belongs to ${own}`).toBe(false);
          }
          // Ask AI gets no period history and no temperature chart.
          expect(q).not.toMatch(/based on my history|temperature chart|\bbbt\b/i);
          expect(q.length).toBeLessThanOrEqual(90);
        }
      }
    });
  }

  it('a high hCG is not an opening question while pregnant, in IVF or after birth', () => {
    const hcg = { title: 'Beta hCG', status: 'high' };
    for (const s of ['pregnancy', 'ivf', 'postpartum']) {
      expect(flaggedLabQuestion(hcg, s)).toBeNull();
      expect(pickSuggestions({ lifeStage: s, hasContext: true, flaggedLabs: [hcg, { title: 'TSH', status: 'high' }] })[0]).toBe('What does my high TSH mean?');
    }
    expect(flaggedLabQuestion(hcg, 'menstrual-cycle')).toBe('What does my high beta hCG mean?');
  });
});
