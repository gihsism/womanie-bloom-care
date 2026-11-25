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

/**
 * QA findings on the live chat (Nov 2026). The sushi answer was given
 * diabetes diets, Japanese nutrient intakes and vegetarian diets; the
 * library words raw-fish risks as listeria / mercury / fish (fixed with
 * query synonyms). The sertraline follow-up ("What dose?") is searched
 * together with the question before it, as the chat does.
 */
export const QA_QUESTIONS: EvalQuestion[] = [
  { q: 'Can I eat sushi while pregnant?', stage: 'pregnancy', topics: ['food-safety-pregnancy', 'omega3-pregnancy'], title: 'listeri|mercury|fish|toxoplasm|food' },
  { q: 'Is codeine safe while breastfeeding?', stage: 'postpartum', topics: ['codeine-breastfeeding', 'medicines-breastfeeding'], title: 'codeine|opioid|analgesi' },
  { q: 'What ibuprofen dose works for period pain?', stage: 'menstrual-cycle', topics: ['period-pain'], title: 'non-?steroidal|nsaid|ibuprofen|dysmenorr' },
  { q: 'Is sertraline safe while breastfeeding?\nWhat dose?', stage: 'postpartum', topics: ['medicines-breastfeeding', 'postnatal-depression'], title: 'sertraline|antidepress' },
];

/**
 * Questions the library cannot answer although they share a life stage
 * with it: the chat must get no sources at all (relevance floor), not
 * diet or vaccine reviews that only match "pregnant".
 */
export const NO_SOURCE_QUESTIONS: [string, string | null][] = [
  ['is kombucha ok when pregnant?', 'pregnancy'],
  ['can I eat ramen while breastfeeding?', 'postpartum'],
  ['What dose?', 'postpartum'],
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

/**
 * Citation-accuracy audit (Nov 2026, 2,507 items): 40 everyday questions
 * across life stages. `ids` are the items judged by hand to answer the
 * question and to be current (guideline > review > trial, nothing
 * outdated); a question hits when one of them is among the top 3 sources
 * the chat would send. `gap` marks questions the library has no good
 * source for (see docs/research-gaps.md): they are reported, not scored.
 */
export interface AuditQuestion {
  q: string;
  stage: string;
  ids: string[];
  gap?: boolean;
}

export const AUDIT_QUESTIONS: AuditQuestion[] = [
  // Periods
  { q: 'How long is a normal period and how much bleeding is too much?', stage: 'menstrual-cycle', ids: ['pmid-42932433', 'pmid-29731212', 'pmid-35638592'] },
  { q: "My periods stopped for 4 months and I'm not pregnant, why?", stage: 'menstrual-cycle', ids: ['pmid-28368518', 'pmid-36777338', 'pmid-40682949', 'pmid-37589624'] },
  { q: 'Does the pill help with PMS mood swings?', stage: 'menstrual-cycle', ids: ['pmid-37365881', 'pmid-34224688', 'pmid-41468627'] },
  { q: "What's the best painkiller for period cramps?", stage: 'menstrual-cycle', ids: ['pmid-26224322', 'pmid-40216328'] },
  // PCOS
  { q: 'How is PCOS diagnosed?', stage: 'menstrual-cycle', ids: ['pmid-37589624', 'pmid-29794670', 'pmid-30024653'] },
  { q: 'Will losing weight help my PCOS?', stage: 'menstrual-cycle', ids: ['pmid-30921477', 'pmid-37589624', 'pmid-30024653'] },
  { q: 'Does inositol work for PCOS?', stage: 'menstrual-cycle', ids: ['pmid-38163998', 'pmid-30570133', 'pmid-36703143'] },
  // Endometriosis
  { q: 'How do doctors diagnose endometriosis, do I need surgery?', stage: 'menstrual-cycle', ids: ['pmid-38555044', 'pmid-39373298', 'pmid-27405583'] },
  { q: 'What hormone treatments are there for endometriosis pain?', stage: 'menstrual-cycle', ids: ['pmid-41065045', 'pmid-42746927', 'pmid-37341141'] },
  { q: 'Can I still get pregnant with endometriosis?', stage: 'conception', ids: ['pmid-33095458', 'pmid-32106991', 'pmid-36948440'] },
  // Trying to conceive
  { q: 'How long does it usually take to get pregnant?', stage: 'conception', ids: [], gap: true },
  { q: 'Do ovulation tests actually help you conceive faster?', stage: 'conception', ids: ['pmid-37709293', 'pmid-31139458'] },
  { q: 'Does letrozole work better than clomid for PCOS?', stage: 'conception', ids: ['pmid-36735392', 'pmid-36165742', 'pmid-29797697'] },
  { q: "When should we see a fertility doctor if we're not getting pregnant?", stage: 'conception', ids: [], gap: true },
  // IVF
  { q: 'What are the IVF success rates at 40?', stage: 'ivf', ids: ['pmid-40803331', 'pmid-36878347', 'pmid-35907969'] },
  { q: 'What is OHSS and how do I avoid it during IVF?', stage: 'ivf', ids: ['pmid-41996998', 'pmid-28111738', 'pmid-26597569', 'pmid-27577848'] },
  { q: 'Is a frozen embryo transfer better than fresh?', stage: 'ivf', ids: ['pmid-33539543', 'pmid-41950579'] },
  { q: 'Does progesterone support after embryo transfer matter?', stage: 'ivf', ids: ['pmid-36574915', 'pmid-41475299', 'pmid-36303972', 'pmid-34384594'] },
  // Pregnancy medicines and safety
  { q: 'Is it safe to take antihistamines for hay fever while pregnant?', stage: 'pregnancy', ids: ['pmid-27878468', 'pmid-33433020'] },
  { q: 'Can I keep taking my thyroid medication (levothyroxine) in pregnancy?', stage: 'pregnancy', ids: ['pmid-42219800', 'pmid-32443080', 'pmid-35523752'] },
  { q: 'What can I take for heartburn when pregnant?', stage: 'pregnancy', ids: ['pmid-26384956', 'pmid-31909512'] },
  { q: 'Are antibiotics for a UTI safe in pregnancy?', stage: 'pregnancy', ids: ['pmid-31765489', 'pmid-30895288'] },
  { q: 'Should I take vitamin D during pregnancy?', stage: 'pregnancy', ids: ['pmid-43012372', 'pmid-39077939', 'pmid-38828931'] },
  { q: 'Is it safe to exercise while pregnant?', stage: 'pregnancy', ids: ['pmid-30297272', 'pmid-32217980', 'pmid-34478617', 'pmid-30337460'] },
  // Postpartum and breastfeeding
  { q: 'How can I tell if I have postpartum depression?', stage: 'postpartum', ids: ['pmid-30629567', 'pmid-35416478', 'pmid-40566968', 'pmid-33177069'] },
  { q: 'When can I start exercising again after a C-section?', stage: 'postpartum', ids: ['pmid-32217980', 'pmid-40335351'] },
  { q: 'How soon after birth can I get pregnant again, and what contraception is safe?', stage: 'postpartum', ids: ['pmid-37124160', 'pmid-27155443', 'pmid-25793657', 'pmid-36302159'] },
  { q: 'Is ibuprofen safe while breastfeeding?', stage: 'postpartum', ids: [], gap: true },
  { q: 'Can I take the combined pill while breastfeeding?', stage: 'postpartum', ids: ['pmid-26002804', 'pmid-25793657'] },
  { q: 'How do I increase my breast milk supply?', stage: 'postpartum', ids: ['pmid-32421208'] },
  // Perimenopause and HRT
  { q: 'What are the first signs of perimenopause?', stage: 'menopause', ids: ['pmid-41082911', 'pmid-42743436', 'pmid-30182804'] },
  { q: 'Can perimenopause cause anxiety and low mood?', stage: 'menopause', ids: ['pmid-41902367', 'pmid-39856668', 'pmid-30182804'] },
  { q: "Is HRT safe if I'm over 60?", stage: 'post-menopause', ids: ['pmid-42695385', 'pmid-30358733', 'pmid-26444994'] },
  { q: 'Does HRT patch or pill have a different blood clot risk?', stage: 'menopause', ids: ['pmid-35713694', 'pmid-40488293'] },
  { q: 'What non-hormonal treatments help hot flashes?', stage: 'menopause', ids: ['pmid-42832802', 'pmid-43049482'] },
  { q: 'Is vaginal estrogen safe long term?', stage: 'post-menopause', ids: ['pmid-40298120', 'pmid-39250810', 'pmid-40569036'] },
  // Bone health
  { q: 'Should I get a bone density scan after menopause?', stage: 'post-menopause', ids: ['pmid-39808425', 'pmid-30324412', 'pmid-32427503'] },
  { q: 'Do calcium and vitamin D supplements prevent fractures?', stage: 'post-menopause', ids: ['pmid-42161415', 'pmid-29677309'] },
  // Contraception
  { q: 'Which contraception is most effective?', stage: 'contraception', ids: ['pmid-29064972', 'pmid-29064966', 'pmid-31051299', 'pmid-26280888'] },
  { q: 'Does the contraceptive implant cause weight gain or irregular bleeding?', stage: 'contraception', ids: ['pmid-41297751', 'pmid-27567593', 'pmid-33407632'] },
];

/** Share of scored (non-gap) audit questions with an expected item in the top k. */
export function scoreAudit(runs: { question: AuditQuestion; ranked: ResearchItem[] }[], k = 3): { hit: number; n: number; misses: string[] } {
  const scored = runs.filter((r) => !r.question.gap);
  const misses = scored.filter((r) => !r.ranked.slice(0, k).some((it) => r.question.ids.includes(it.id))).map((r) => r.question.q);
  return { hit: (scored.length - misses.length) / scored.length, n: scored.length, misses };
}
