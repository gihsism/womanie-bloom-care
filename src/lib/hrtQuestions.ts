// "Questions for your doctor about HRT": 3-5 neutral questions built from
// her logged symptoms and her medicine history, pre-filled into "Questions
// to bring" (visit_questions). Pure logic, unit-tested; the card is
// MenopauseSymptomTrends.
//
// Rules: questions only, never advice. No question says she should or
// should not take anything; each one asks the doctor to explain, so the
// decision stays in the room. Symptom-specific wording only when she has
// actually logged that symptom often enough to mention.

import type { MenopauseInsight, MedicationInput, MetricKey } from './menopauseInsights';
import { isHormoneTherapy, shortDate, startDate, stopDate } from './menopauseInsights';
import { MAX_QUESTIONS, type VisitQuestion } from './visitQuestions';

export const MIN_HRT_QUESTIONS = 3;
export const MAX_HRT_QUESTIONS = 5;
// Re-exported: the constant lives in visitQuestions.ts so screens that only
// need it don't download the HRT question builder and menopause insights.
export { UNSCHEDULED_VISIT_ID } from './visitQuestions';

export interface HrtQuestionInput {
  insight: MenopauseInsight;
  medications: MedicationInput[];
  stage: 'menopause' | 'post-menopause' | string;
  /** Her age in years, when known. */
  age?: number | null;
  now?: Date;
}

export interface SuggestedQuestion {
  id: string;
  text: string;
}

const PHRASE: Record<MetricKey, string> = {
  hot_flushes: 'hot flushes',
  night_sweats: 'night sweats',
  sleep: 'poor sleep',
  mood: 'low mood',
  joint_pain: 'joint pain',
};

/** Symptoms she logs often enough to name: on ~2+ days a week, or ~1+ hot flush a day. Short sleep (< 6.5 h) counts as poor sleep. */
export function frequentSymptoms(insight: MenopauseInsight): MetricKey[] {
  if (insight.confidence === 'none') return [];
  const out: MetricKey[] = [];
  for (const m of insight.metrics) {
    const recent = lastValue(m.weekly);
    const level = m.after ?? recent;
    if (level == null || m.dataDays < 3) continue;
    if (m.kind === 'hours') { if (level < 6.5) out.push(m.key); continue; }
    if (m.kind === 'count' ? level >= 1 : level >= 2) out.push(m.key);
  }
  return out;
}

function lastValue(weekly: Array<number | null>): number | null {
  // Average of the most recent 4 weeks that have a value.
  const vals = weekly.filter((v): v is number => v != null).slice(-4);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

/** "hot flushes, night sweats and poor sleep". */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

type HrtStatus =
  | { kind: 'current'; name: string; since: Date | null }
  | { kind: 'stopped'; name: string; on: Date | null }
  | { kind: 'none' };

/** Her hormone-therapy status from the medicine list: taking now beats stopped. */
export function hrtStatus(meds: MedicationInput[], now = new Date()): HrtStatus {
  const hormone = meds.filter(m => typeof m.name === 'string' && m.name.trim() && isHormoneTherapy(m.name));
  const current = hormone
    .filter(m => { const s = stopDate(m); return !s || s.getTime() > now.getTime(); })
    .sort((a, b) => (startDate(b)?.getTime() ?? 0) - (startDate(a)?.getTime() ?? 0))[0];
  if (current) return { kind: 'current', name: current.name.trim(), since: startDate(current) };
  const stopped = hormone.sort((a, b) => (stopDate(b)?.getTime() ?? 0) - (stopDate(a)?.getTime() ?? 0))[0];
  if (stopped) return { kind: 'stopped', name: stopped.name.trim(), on: stopDate(stopped) };
  return { kind: 'none' };
}

export function suggestHrtQuestions(input: HrtQuestionInput): SuggestedQuestion[] {
  const { insight, medications, stage, age, now = new Date() } = input;
  const status = hrtStatus(medications, now);
  const frequent = frequentSymptoms(insight);
  const named = joinList(frequent.map(k => PHRASE[k]));
  const vasomotor = frequent.includes('hot_flushes') || frequent.includes('night_sweats');
  const hot = insight.metrics.find(m => m.key === 'hot_flushes');
  const out: SuggestedQuestion[] = [];
  const add = (id: string, text: string) => { if (!out.some(q => q.id === `hrt:${id}`)) out.push({ id: `hrt:${id}`, text }); };

  if (status.kind === 'current') {
    const since = status.since ? ` on ${shortDate(status.since)}` : '';
    add('review', `I started ${status.name}${since}. How will we judge whether it is working for me, and when should we review it?`);
    // Logged and not clearly better since starting: ask whether that is expected.
    if (hot && hot.direction !== null && hot.improved !== true && frequent.includes('hot_flushes')) {
      add('still', 'My hot flushes have not changed much since I started. Is that expected at this point, and what are the options if it stays this way?');
    } else if (named) {
      add('still', `I am still logging ${named}. Is that expected on my current treatment?`);
    }
    add('side-effects', 'Which side effects or changes should I tell you about, and when should I get in touch sooner?');
    add('duration', 'How long do people usually stay on HRT, and how is the decision about continuing or stopping made?');
    add('checks', 'Which check-ups or screenings do I need while I am on HRT?');
  } else if (status.kind === 'stopped') {
    const on = status.on ? ` on ${shortDate(status.on)}` : '';
    add('stopped', `I stopped ${status.name}${on}. What should I watch for now, and what are the options if symptoms come back?`);
    if (named) add('symptoms', `I have been logging ${named}. Could these be related to stopping, and what could help?`);
    add('options', 'What are the options for managing menopause symptoms, with and without hormones, and how do they compare for me?');
    add('history', 'Is there anything in my personal or family history (for example blood clots, breast cancer, migraine or heart disease) that matters for these options?');
  } else {
    if (named) {
      add('symptoms', `I have been logging ${named}. Could these be related to ${stage === 'post-menopause' ? 'menopause' : 'perimenopause or menopause'}, and what are the options for managing them, with and without hormones?`);
    } else {
      add('symptoms', 'What are the options for managing menopause symptoms, with and without hormones?');
    }
    add('benefits', 'What are the possible benefits and risks of HRT for someone with my age and health history?');
    add('history', 'Is there anything in my personal or family history (for example blood clots, breast cancer, migraine or heart disease) that we should consider before deciding about HRT?');
  }

  // Age / timing question: the benefit-risk picture depends on age and time since menopause.
  if (typeof age === 'number' && age >= 60) {
    add('timing', 'Does my age or the time since my last period change which options make sense to discuss?');
  }
  if (frequent.includes('joint_pain')) {
    add('joints', 'Is the joint pain I have been logging likely to be part of menopause, or worth looking into separately?');
  }
  if (frequent.includes('mood') && status.kind !== 'current') {
    add('mood', 'Could the changes in my mood be linked to menopause, and what support is available?');
  }
  if (status.kind === 'none' && (vasomotor || frequent.length > 0)) {
    add('types', 'If we consider HRT, how do the different forms (patches, gels, tablets) differ, and what would we look at to choose?');
  }
  // Fill up to the minimum with neutral evergreen questions.
  const fillers: Array<[string, string]> = [
    ['benefits', 'What are the possible benefits and risks of HRT for someone with my age and health history?'],
    ['checks', 'Which bone-density and heart-health checks should I have at this stage?'],
    ['lifestyle', 'Besides medicines, what else could help with my symptoms?'],
  ];
  for (const [id, text] of fillers) {
    if (out.length >= MIN_HRT_QUESTIONS) break;
    add(id, text);
  }
  return out.slice(0, MAX_HRT_QUESTIONS);
}

/** Add the suggestions to a saved list, skipping ones already there (same id or same text). Keeps her ticks and order. */
export function mergeIntoVisitList(existing: VisitQuestion[], suggestions: SuggestedQuestion[]): { list: VisitQuestion[]; added: number } {
  const list = [...existing];
  let added = 0;
  for (const s of suggestions) {
    if (list.length >= MAX_QUESTIONS) break;
    const t = s.text.trim().toLowerCase();
    if (list.some(q => q.id === s.id || q.text.trim().toLowerCase() === t)) continue;
    list.push({ id: s.id, text: s.text, asked: false });
    added++;
  }
  return { list, added };
}
