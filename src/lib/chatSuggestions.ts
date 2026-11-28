// Suggested first questions on a new Ask AI chat: 4, picked by fixed
// rules (no AI call) from where she is now and what is in her records:
//   1. one out-of-range lab on file ("What does my low ferritin mean?");
//   2. one question for this moment of her stage (pregnancy week, weeks
//      since birth, IVF step, cycle phase);
//   3. an upcoming visit;
//   4. the stage's standard questions fill the rest.
// Same inputs, same questions.
//
// Every chip must be answerable from what Ask AI is given (her records,
// visits, app logs, stage line and cycle-phase line; see
// api/_lib/chat-context.ts). It does not get her period history or her
// temperature chart, so "Are my cycles regular based on my history?" and
// "What does my temperature chart say?" were replaced (round 13).

import type { CyclePhase } from './cycle-phase';

export const MAX_SUGGESTIONS = 4;

export const STAGE_SUGGESTIONS: Record<string, string[]> = {
  'pre-menstrual': [
    'What changes should I expect before my first period?',
    'How do I prepare a period kit for school?',
    'Who can I talk to about my first period?',
  ],
  'menstrual-cycle': [
    'What counts as a regular cycle?',
    'Which lab results are most relevant for my cycle?',
    'What symptoms should I track this month?',
  ],
  contraception: [
    'Is my birth control still the right fit?',
    'What should I do if I miss a pill?',
    'How would switching methods affect me?',
  ],
  conception: [
    'When are my fertile days this cycle?',
    'How can I tell when I am ovulating?',
    'Which supplements help when trying to conceive?',
  ],
  ivf: [
    'What does my current IVF step mean?',
    'Explain my pregnancy hormone (beta hCG) results in plain language',
    'How should I look after myself after egg collection?',
  ],
  pregnancy: [
    'Is my pregnancy progressing normally?',
    'What checkups are coming up?',
    'Which supplements should I keep taking?',
  ],
  postpartum: [
    'What recovery should I expect this week?',
    'Is my bleeding after birth normal?',
    'How can I tell if it might be postpartum depression?',
  ],
  menopause: [
    'Where am I in the menopause transition?',
    'What can help with my symptoms?',
    'Which checkups should I have this year?',
  ],
  'post-menopause': [
    'What should I focus on for long-term health?',
    'How can I keep my bones strong?',
    'Which checkups are overdue?',
  ],
};

export interface FlaggedLab {
  title: string;
  status: string | null;
}

export interface SuggestionInput {
  lifeStage: string | null;
  /** She has records on file (documents or values). */
  hasContext: boolean;
  hasFlaggedResults?: boolean;
  hasUpcomingVisit?: boolean;
  /** Completed pregnancy weeks (from the due date). */
  pregnancyWeek?: number | null;
  postpartumWeeks?: number | null;
  ivfPhase?: string | null;
  cyclePhase?: CyclePhase | null;
  /** Out-of-range values on file, most important / newest first. */
  flaggedLabs?: FlaggedLab[];
}

const NO_RECORDS = ['What can you help me with?', 'What should I upload first?', 'What tests should I be tracking?'];

/** "Ferritin (Serum)" -> "ferritin"; "Vitamin D" -> "vitamin D"; "TSH", "HbA1c" kept. */
export function labNameForQuestion(title: string): string | null {
  const t = (title || '').replace(/\(.*?\)/g, ' ').replace(/[,:;].*$/, '').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 30 || !/\p{L}/u.test(t)) return null;
  return t.split(' ').map((w) => (/^\p{Lu}\p{Ll}+$/u.test(w) ? w.toLowerCase() : w)).join(' ');
}

const LOW = new Set(['low', 'decreased', 'below range']);
const HIGH = new Set(['high', 'elevated', 'above range']);

// The pregnancy hormone is "high" against a non-pregnant range: expected
// while pregnant, after a positive IVF test and in the weeks after birth,
// so "What does my high hCG mean?" is no question to open with there.
const HCG_TITLE = /\b(?:beta[\s-]?)?hcg\b|chorionic gonadotropin/i;
const HCG_EXPECTED_STAGES = new Set(['pregnancy', 'ivf', 'postpartum']);

export function flaggedLabQuestion(lab: FlaggedLab, lifeStage: string | null = null): string | null {
  if (lifeStage && HCG_EXPECTED_STAGES.has(lifeStage) && HCG_TITLE.test(lab.title || '')) return null;
  const name = labNameForQuestion(lab.title);
  if (!name) return null;
  const s = (lab.status || '').trim().toLowerCase();
  if (LOW.has(s)) return `What does my low ${name} mean?`;
  if (HIGH.has(s)) return `What does my high ${name} mean?`;
  return `What does my out-of-range ${name} mean?`;
}

export function pregnancyQuestion(week: number): string | null {
  if (!Number.isFinite(week) || week < 4 || week > 42) return null;
  if (week <= 13) return `Is nausea normal at week ${week}?`;
  if (week <= 19) return 'What happens at the anatomy scan?';
  if (week <= 27) return 'What is the glucose test and when do I need it?';
  if (week <= 35) return 'Is swelling in my feet normal now?';
  return 'How do I know labour is starting?';
}

export function postpartumQuestion(weeks: number): string | null {
  if (!Number.isFinite(weeks) || weeks < 0 || weeks > 104) return null;
  if (weeks <= 2) return 'How much bleeding is normal in the first weeks?';
  if (weeks <= 6) return 'What happens at my 6-week check-up?';
  if (weeks <= 12) return 'When can I start exercising again?';
  return 'Why am I still so tired months after birth?';
}

export const IVF_PHASE_QUESTIONS: Record<string, string> = {
  prep: 'How can I prepare my body before IVF?',
  stimulation: 'Which side effects are normal during stimulation?',
  trigger: 'Why does the trigger shot timing matter so much?',
  retrieval: 'What recovery is normal after egg collection?',
  fertilization: 'What happens to my eggs after collection?',
  transfer: 'What should I do and avoid after embryo transfer?',
  tww: 'Which symptoms are normal in the two-week wait?',
  beta: 'How do I read my beta hCG result?',
};

export function cycleQuestion(phase: CyclePhase, lifeStage: string | null): string | null {
  switch (phase) {
    case 'menstrual': return 'What helps with period cramps?';
    case 'follicular': return 'Why do I feel more energetic after my period?';
    case 'ovulation': return lifeStage === 'conception' ? 'Is now a good time to try to conceive?' : 'What are the signs that I am ovulating?';
    case 'luteal': return 'Why do I feel bloated before my period?';
    case 'late-luteal': return 'What helps with PMS symptoms?';
    default: return null;
  }
}

/** The one question for this moment of her stage, or null. */
export function momentQuestion(input: SuggestionInput): string | null {
  const stage = input.lifeStage;
  if (stage === 'pregnancy' && typeof input.pregnancyWeek === 'number') return pregnancyQuestion(input.pregnancyWeek);
  if (stage === 'postpartum' && typeof input.postpartumWeeks === 'number') return postpartumQuestion(input.postpartumWeeks);
  if (stage === 'ivf' && input.ivfPhase) return IVF_PHASE_QUESTIONS[input.ivfPhase] ?? null;
  if ((stage === 'menstrual-cycle' || stage === 'conception') && input.cyclePhase) return cycleQuestion(input.cyclePhase, stage);
  return null;
}

export function pickSuggestions(input: SuggestionInput): string[] {
  const out: string[] = [];
  const add = (q: string | null | undefined) => {
    if (!q || out.length >= MAX_SUGGESTIONS) return;
    if (out.some((o) => o.toLowerCase() === q.toLowerCase())) return;
    out.push(q);
  };
  const moment = momentQuestion(input);

  if (!input.hasContext) {
    add(moment);
    NO_RECORDS.forEach(add);
    // No moment question for this stage: its first standard question.
    (input.lifeStage ? STAGE_SUGGESTIONS[input.lifeStage] ?? [] : []).forEach(add);
    add('Which checkups should I have this year?');
    return out;
  }

  // 1. One out-of-range value, by name.
  const flagged = (input.flaggedLabs ?? []).map((l) => flaggedLabQuestion(l, input.lifeStage)).find(Boolean) ?? null;
  add(flagged);
  // 2. This moment of her stage.
  add(moment);
  // 3. A visit coming up.
  if (input.hasUpcomingVisit) add('What should I prepare for my next visit?');
  // 4. The stage's standard set, or a records-based set.
  const stageSet = input.lifeStage ? STAGE_SUGGESTIONS[input.lifeStage] : undefined;
  const base = stageSet ?? [
    'What do my latest results mean?',
    input.hasFlaggedResults || flagged ? 'Which results should I worry about?' : 'Are there any concerning findings?',
    'Summarize my health records',
  ];
  base.forEach(add);
  if (input.hasFlaggedResults && !flagged) add('Which results should I worry about?');
  add('Summarize my health records');
  add('What tests should I be tracking?');
  return out;
}
