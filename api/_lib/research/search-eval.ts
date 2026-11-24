// Retrieval eval for the research library: realistic patient questions
// in everyday words, each with the library topics whose items answer it.
// An item counts as relevant when it carries one of the expected topics
// (topics are curated in scripts/research/topics.mjs, so this stays valid
// when the library is rebuilt). Used by search-eval.test.ts.

import type { ResearchItem } from './library.js';

export interface EvalQuestion {
  q: string;
  stage: string | null;
  topics: string[];
  /**
   * Stricter relevance (regex source, case-insensitive): the item's title
   * must also match, e.g. a paracetamol question needs a paracetamol study,
   * not a migraine guideline that happens to carry the topic.
   */
  title?: string;
}

export const EVAL_QUESTIONS: EvalQuestion[] = [
  { q: 'can I drink coffee while pregnant', stage: 'pregnancy', topics: ['caffeine-pregnancy'] },
  { q: 'why am I so tired after the baby', stage: 'postpartum', topics: ['postpartum-recovery', 'postnatal-depression', 'iron-deficiency', 'anaemia-pregnancy', 'postpartum-thyroid-bp'] },
  { q: 'hot flushes at night what helps', stage: 'menopause', topics: ['hot-flushes', 'menopause-sleep'] },
  { q: 'does vitamin d help me get pregnant', stage: 'conception', topics: ['vitamin-d', 'vitamin-d-pregnancy', 'lifestyle-fertility', 'preconception-care', 'ivf-lifestyle'] },
  { q: 'is it normal to cry a lot two weeks after birth', stage: 'postpartum', topics: ['postnatal-depression'] },
  { q: 'iron levels low pregnancy', stage: 'pregnancy', topics: ['anaemia-pregnancy', 'iron-deficiency'] },
  { q: "my periods are so painful I can't go to work", stage: 'menstrual-cycle', topics: ['period-pain', 'endometriosis'] },
  { q: 'bleeding through a pad every hour on my period', stage: 'menstrual-cycle', topics: ['heavy-bleeding', 'iron-deficiency', 'fibroids'] },
  { q: 'feeling sick every morning in the first trimester', stage: 'pregnancy', topics: ['nausea-pregnancy'] },
  { q: "haven't felt the baby kick much today", stage: 'pregnancy', topics: ['fetal-movements'] },
  { q: 'is it safe to sleep on my back when pregnant', stage: 'pregnancy', topics: ['sleep-position'] },
  { q: 'I leak a bit of pee when I sneeze since giving birth', stage: 'postpartum', topics: ['pelvic-floor'] },
  { q: 'sore cracked nipples when feeding', stage: 'postpartum', topics: ['breastfeeding-problems', 'breastfeeding'] },
  { q: 'when can my baby start eating real food', stage: 'postpartum', topics: ['infant-feeding'] },
  { q: 'best days in my cycle to have sex to get pregnant', stage: 'conception', topics: ['intercourse-timing', 'cycle-tracking'] },
  { q: "I'm 38, is it too late to have a baby", stage: 'conception', topics: ['age-fertility', 'amh-ovarian-reserve', 'egg-freezing', 'infertility-evaluation'] },
  { q: 'condom broke last night what do I do', stage: 'contraception', topics: ['emergency-contraception'] },
  { q: 'does getting the coil fitted hurt and how long does it last', stage: 'contraception', topics: ['iud-implant'] },
  { q: 'dry down there and sex hurts since the change', stage: 'menopause', topics: ['genitourinary'] },
  { q: "I keep waking at 3am and can't get back to sleep, I'm 50", stage: 'menopause', topics: ['menopause-sleep', 'hot-flushes'] },
  { q: 'brain fog and forgetting words in my late forties', stage: 'menopause', topics: ['menopause-mood', 'perimenopause'] },
  { q: 'will HRT give me breast cancer', stage: 'menopause', topics: ['hrt-benefits-risks', 'breast-health'] },
  { q: 'spotting again two years after my periods stopped', stage: 'post-menopause', topics: ['postmenopausal-bleeding'] },
  { q: 'how do I keep my bones strong as I get older', stage: 'post-menopause', topics: ['bone-health', 'healthy-ageing'] },
  { q: 'how many embryos should we put back', stage: 'ivf', topics: ['embryo-transfer', 'ivf-outcomes'] },
  { q: 'bad headache and swollen feet at 34 weeks', stage: 'pregnancy', topics: ['pre-eclampsia'] },
  { q: 'my sugar test came back high while expecting', stage: 'pregnancy', topics: ['gestational-diabetes'] },
  { q: 'it burns when I pee', stage: null, topics: ['uti'] },
  { q: 'itchy with thick white discharge', stage: null, topics: ['vaginal-infections'] },
  { q: 'my newborn screams for hours every evening', stage: 'postpartum', topics: ['infant-colic-crying'] },
  { q: 'can I eat sushi or soft cheese while pregnant', stage: 'pregnancy', topics: ['food-safety-pregnancy', 'pregnancy-nutrition'] },
  { q: 'is one glass of wine ok when expecting', stage: null, topics: ['alcohol-pregnancy'] },
  { q: 'irregular periods, spots and extra hair on my chin', stage: 'menstrual-cycle', topics: ['pcos', 'irregular-cycles'] },
  { q: 'should I get the flu jab when expecting', stage: null, topics: ['vaccines-pregnancy'] },
];

/**
 * "Medicine + pregnancy" questions, kept apart from EVAL_QUESTIONS so their
 * known misses do not lower the main floor. A drug-specific topic and the
 * drug in the title are both required. History (Nov 2026, 2,493 items):
 * the paracetamol questions used to rank migraine/headache guidelines and
 * other "Medicines in pregnancy" guidelines above the paracetamol reviews,
 * because that topic's label names paracetamol (every item in it got a
 * topic-strength hit) and guidelines got 1.25x vs reviews 1.1x. Fixed in
 * library.ts: bracketed label examples count weakly, a drug named in the
 * title lifts the item, guidelines get 1.15x.
 */
export const DRUG_PREGNANCY_QUESTIONS: EvalQuestion[] = [
  { q: 'Is it safe to take paracetamol for a headache in pregnancy?', stage: 'pregnancy', topics: ['paracetamol-pregnancy'], title: 'paracetamol|acetaminophen|analgesic' },
  { q: 'can I take paracetamol while pregnant?', stage: 'pregnancy', topics: ['paracetamol-pregnancy'], title: 'paracetamol|acetaminophen|analgesic' },
  { q: 'does taking tylenol in pregnancy cause autism?', stage: 'pregnancy', topics: ['paracetamol-pregnancy'], title: 'paracetamol|acetaminophen|analgesic' },
  { q: 'can I keep taking my antidepressant (sertraline) while pregnant?', stage: 'pregnancy', topics: ['medications-pregnancy'], title: 'antidepress|ssri|sertraline|psychotropic' },
  { q: 'should I take low dose aspirin in pregnancy?', stage: 'pregnancy', topics: ['aspirin-pregnancy'], title: 'aspirin|antiplatelet' },
  // Added with the nsaids-pregnancy topic (Nov 2026, 2,507 items): before it
  // the top results were postpartum perineal-pain and antirheumatic reviews.
  { q: 'Can I take ibuprofen in pregnancy?', stage: 'pregnancy', topics: ['nsaids-pregnancy', 'medications-pregnancy'], title: 'ibuprofen|nsaid|non-?steroidal anti-inflammatory|analgesic' },
];

/**
 * Mixed "named medicine or supplement" questions outside pregnancy-only
 * wording. Expected items checked by hand against library.json (Nov 2026,
 * 2,493 items): the title must name the substance (and, where the
 * question is about a specific outcome, that outcome).
 */
export const MIXED_MEDICINE_QUESTIONS: EvalQuestion[] = [
  // "Sertraline and breastfeeding: review and meta-analysis"
  { q: 'is it ok to take sertraline while breastfeeding?', stage: 'postpartum', topics: ['medicines-breastfeeding', 'postnatal-depression', 'breastfeeding'], title: 'sertraline|antidepress|ssri' },
  // SOGC No. 469 iron guideline, "Intermittent oral iron supplementation during pregnancy", ...
  { q: 'do I need iron tablets in pregnancy?', stage: 'pregnancy', topics: ['anaemia-pregnancy', 'iron-deficiency'], title: '\\biron\\b' },
  // "Type and timing of menopausal hormone therapy and breast cancer risk", WHI trials, ...
  { q: 'does HRT raise my risk of breast cancer?', stage: 'menopause', topics: ['hrt-benefits-risks', 'breast-health'], title: 'breast' },
  // Metformin items are spread over several topics; the title must name both.
  {
    q: 'does metformin help with PCOS?',
    stage: 'menstrual-cycle',
    topics: ['pcos', 'ovarian-cysts', 'combined-pill', 'iui', 'ivf-outcomes', 'ovarian-stimulation', 'ivf-lifestyle', 'lifestyle-fertility', 'preconception-care', 'weight-diet', 'hypertension-pregnancy'],
    title: 'metformin.*(pcos|polycystic)|(pcos|polycystic).*metformin',
  },
  // USPSTF / SOGC No. 427 folic acid guidelines, "Folic acid supplementation during the preconception period"
  { q: 'what dose of folic acid should I take when trying to get pregnant?', stage: 'conception', topics: ['folic-acid'], title: 'folic|folate' },
  // Added with the codeine-breastfeeding topic (Nov 2026, 2,507 items): before
  // it no source named codeine or opioids at all.
  { q: 'Is codeine safe when breastfeeding?', stage: 'postpartum', topics: ['codeine-breastfeeding', 'medicines-breastfeeding'], title: 'codeine|opioid|analgesi' },
];

export interface EvalResult {
  hitAt3: number;
  hitAt6: number;
  n: number;
  misses3: string[];
}

/** hit@k: share of questions with at least one relevant item in the top k. */
export function scoreRuns(runs: { question: EvalQuestion; ranked: ResearchItem[] }[]): EvalResult {
  let h3 = 0;
  let h6 = 0;
  const misses3: string[] = [];
  for (const { question, ranked } of runs) {
    const title = question.title ? new RegExp(question.title, 'i') : null;
    const rel = (it: ResearchItem) => it.topics.some((t) => question.topics.includes(t)) && (!title || title.test(it.title));
    const in3 = ranked.slice(0, 3).some(rel);
    if (in3) h3++;
    else misses3.push(question.q);
    if (ranked.slice(0, 6).some(rel)) h6++;
  }
  const n = runs.length;
  return { hitAt3: h3 / n, hitAt6: h6 / n, n, misses3 };
}
