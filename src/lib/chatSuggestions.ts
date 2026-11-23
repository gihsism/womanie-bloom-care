// Suggested first questions on a new Ask AI chat: at most 3, picked from
// the user's life stage (stored key) and what is in her records.

export const MAX_SUGGESTIONS = 3;

export const STAGE_SUGGESTIONS: Record<string, string[]> = {
  'pre-menstrual': [
    'What changes should I expect before my first period?',
    'How do I prepare a period kit for school?',
    'When should I tell a trusted adult?',
  ],
  'menstrual-cycle': [
    'Are my cycles regular based on my history?',
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
    'What does my temperature chart (BBT) say about ovulation?',
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
    'Are any of my results worth asking my doctor about?',
    'Which checkups are overdue?',
  ],
};

export function pickSuggestions({
  lifeStage,
  hasContext,
  hasFlaggedResults = false,
  hasUpcomingVisit = false,
}: {
  lifeStage: string | null;
  hasContext: boolean;
  hasFlaggedResults?: boolean;
  hasUpcomingVisit?: boolean;
}): string[] {
  if (!hasContext) {
    return ['What can you help me with?', 'What should I upload first?', 'What tests should I be tracking?'];
  }
  const stageSet = lifeStage ? STAGE_SUGGESTIONS[lifeStage] : undefined;
  const base = stageSet
    ? [...stageSet]
    : [
        'What do my latest results mean?',
        hasFlaggedResults ? 'Which results should I worry about?' : 'Are there any concerning findings?',
        'Summarize my health records',
      ];
  // A visit coming up is the most time-bound question: it takes the last slot.
  if (hasUpcomingVisit) base.splice(MAX_SUGGESTIONS - 1, 1, 'What should I prepare for my next visit?');
  return base.slice(0, MAX_SUGGESTIONS);
}
