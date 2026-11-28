// Womanie research library: trusted evidence (clinical guidelines,
// Cochrane and other systematic reviews, a few landmark trials), every
// item fetched from PubMed and summarised from its abstract by
// scripts/research/build-library.mjs. The data lives in library.json next
// to this file and is read once per server instance.
//
// Uses:
//   - searchItems / searchResearch: keyword + topic + life-stage scoring
//     (no vector DB). Used by the AI chat to pick sources.
//   - evidenceForTopic: "what the research says about X" for a feature
//     card next to the user's own data.
//   - browseItems: the /library page (filter by stage, topic, text).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const LIFE_STAGES = [
  'menstrual-cycle',
  'conception',
  'pregnancy',
  'postpartum',
  'contraception',
  'ivf',
  'menopause',
  'post-menopause',
  'general',
] as const;
export type LifeStage = (typeof LIFE_STAGES)[number];

export type EvidenceLevel = 'guideline' | 'systematic review' | 'study';

export interface ResearchItem {
  id: string;
  pmid: string;
  doi: string | null;
  title: string;
  /** Organisation if the record names one, otherwise the journal. */
  source: string;
  journal: string;
  organisation: string | null;
  year: number;
  publicationTypes: string[];
  evidenceLevel: EvidenceLevel;
  landmark?: boolean;
  url: string;
  summary: string;
  keyPoints: string[];
  certainty: 'high' | 'moderate' | 'low' | 'very low' | 'not stated';
  lifeStages: LifeStage[];
  topics: string[];
  tags: string[];
  keywords: string[];
  /** Absent for PubMed items; "guideline-page" for an official non-PubMed source (pmid ""). */
  sourceType?: 'guideline-page';
  page?: { publisher: string; summariser: string; [key: string]: unknown };
}

export interface ResearchTopic {
  id: string;
  label: string;
  stages: LifeStage[];
}

export interface ResearchLibrary {
  version: string;
  generatedAt: string;
  source: string;
  disclaimer: string;
  topics: ResearchTopic[];
  items: ResearchItem[];
}

export const RESEARCH_DISCLAIMER =
  'General information from published research, not medical advice. Talk to your doctor or midwife about your situation.';

let cached: ResearchLibrary | null = null;

/** The whole library (lazy, cached per instance). */
export function getLibrary(): ResearchLibrary {
  if (cached) return cached;
  let raw: string;
  try {
    raw = readFileSync(new URL('./library.json', import.meta.url), 'utf8');
  } catch {
    // Fallback for bundlers that move this module away from the JSON.
    raw = readFileSync(join(process.cwd(), 'api', '_lib', 'research', 'library.json'), 'utf8');
  }
  cached = JSON.parse(raw) as ResearchLibrary;
  return cached;
}

/** Maps an app mode / profile.life_stage onto a library stage. */
export function normalizeLifeStage(stage: unknown): LifeStage | null {
  if (typeof stage !== 'string') return null;
  const s = stage.trim().toLowerCase().replace(/_/g, '-');
  if ((LIFE_STAGES as readonly string[]).includes(s)) return s as LifeStage;
  const aliases: Record<string, LifeStage> = {
    menstrual: 'menstrual-cycle',
    cycle: 'menstrual-cycle',
    'pre-menstrual': 'menstrual-cycle',
    premenstrual: 'menstrual-cycle',
    'regular-cycle': 'menstrual-cycle',
    'trying-to-conceive': 'conception',
    pregnant: 'pregnancy',
    fertility: 'conception',
    ttc: 'conception',
    trying: 'conception',
    perimenopause: 'menopause',
    postmenopause: 'post-menopause',
    'postmenopausal': 'post-menopause',
  };
  return aliases[s] ?? null;
}

// ── Text matching ─────────────────────────────────────────────────

const STOPWORDS = new Set(
  (
    'a an and are as at be been but by can could do does did for from had has have how i if in into is it its ' +
    'me my of on or our should so than that the their them then there these they this to too was we were what ' +
    'when where which while who why will with would you your am im ok okay safe much many any some get got ' +
    'about after before during still just really need want know tell time day days week weeks thing things ' +
    'result results help good bad better best normal mean means explain okay keep keeping continue continuing carry'
  ).split(' '),
);

// Everyday words -> the wording the library uses. Applied to the query
// only (keywords from the build already include patient synonyms).
const SYNONYMS: Record<string, string[]> = {
  coffee: ['caffeine'],
  tea: ['caffeine'],
  caffeine: ['coffee'],
  hrt: ['hormone', 'therapy'],
  period: ['menstrual'],
  periods: ['menstrual'],
  pill: ['contraceptive', 'oral'],
  coil: ['iud', 'intrauterine'],
  iud: ['intrauterine', 'coil'],
  flushes: ['flashes', 'vasomotor'],
  flashes: ['flushes', 'vasomotor'],
  sweats: ['vasomotor'],
  wine: ['alcohol'],
  drinking: ['alcohol'],
  drink: ['alcohol'],
  baby: ['infant'],
  sids: ['sudden', 'infant', 'death'],
  ppd: ['postpartum', 'depression'],
  epds: ['edinburgh', 'postnatal', 'depression'],
  postnatal: ['postpartum'],
  postpartum: ['postnatal'],
  anemia: ['anaemia', 'iron'],
  anaemia: ['anemia', 'iron'],
  gdm: ['gestational', 'diabetes'],
  preeclampsia: ['pre-eclampsia'],
  'pre-eclampsia': ['preeclampsia'],
  morning: ['nausea'],
  sickness: ['nausea', 'vomiting'],
  ttc: ['conception', 'fertility'],
  pregnant: ['pregnancy'],
  conceive: ['conception', 'fertility'],
  fertile: ['fertility'],
  workout: ['exercise'],
  sport: ['exercise'],
  bones: ['bone', 'osteoporosis'],
  smear: ['cervical', 'screening'],
  pap: ['cervical', 'screening'],
  mammogram: ['mammography', 'breast'],
  boob: ['breast'],
  breastfeed: ['breastfeeding'],
  nursing: ['breastfeeding'],
  amh: ['anti-mullerian', 'ovarian', 'reserve'],
  back: ['supine'],
  pee: ['urine', 'urinary', 'urination'],
  wee: ['urine', 'urinary', 'urination'],
  burn: ['burning', 'dysuria'],
  swollen: ['swelling', 'oedema', 'edema'],
  tylenol: ['paracetamol', 'acetaminophen'],
  panadol: ['paracetamol', 'acetaminophen'],
  paracetamol: ['acetaminophen'],
  acetaminophen: ['paracetamol'],
  advil: ['ibuprofen'],
  ibuprofen: ['nsaid', 'non-steroidal'],
  nurofen: ['ibuprofen'],
  clomid: ['clomiphene'],
  zoloft: ['sertraline'],
  prozac: ['fluoxetine'],
  folic: ['folate'],
  folate: ['folic'],
  // Foods pregnant women are told to watch: the library words them as the
  // infection or contaminant (listeria, toxoplasmosis, mercury), never as
  // the dish, so "sushi" alone matched only generic pregnancy-diet items.
  sushi: ['fish', 'seafood', 'raw', 'listeria', 'mercury'],
  sashimi: ['fish', 'seafood', 'raw', 'listeria', 'mercury'],
  salmon: ['fish', 'seafood', 'listeria'],
  tuna: ['fish', 'mercury'],
  oyster: ['seafood', 'raw', 'listeria'],
  prawn: ['seafood'],
  shellfish: ['seafood'],
  cheese: ['listeria', 'unpasteurised', 'dairy'],
  brie: ['cheese', 'listeria', 'unpasteurised'],
  camembert: ['cheese', 'listeria', 'unpasteurised'],
  pate: ['listeria'],
  deli: ['listeria'],
  undercooked: ['raw', 'toxoplasmosis'],
  // Citation audit (Nov 2026): everyday or abbreviated words the library
  // spells differently, found by questions whose best sources ranked low.
  ohss: ['ovarian', 'hyperstimulation'],
  hyperstimulation: ['ohss'],
  amenorrhea: ['amenorrhoea'],
  amenorrhoea: ['amenorrhea'],
  diagnose: ['diagnosis'],
  diagnosed: ['diagnosis'],
  exercising: ['exercise'],
  exercised: ['exercise'],
  'c-section': ['caesarean', 'cesarean'],
  csection: ['caesarean', 'cesarean'],
  caesarean: ['cesarean'],
  cesarean: ['caesarean'],
  heartburn: ['reflux'],
  reflux: ['heartburn'],
  thyroxine: ['levothyroxine'],
  estrogen: ['oestrogen'],
  oestrogen: ['estrogen'],
};

/**
 * Everyday phrases -> library words, matched on the lowercased question
 * (word boundaries). "My periods stopped" never says amenorrhoea, and
 * "how can I tell if I have ..." asks for the signs and screening, not
 * for treatment trials. The extra words count like synonyms (0.7x).
 */
const PHRASE_SYNONYMS: [RegExp, string[]][] = [
  [/\b(periods? (has |have )?(stopped|stop|disappeared|gone)|(no|missed|missing|lost my|absent) periods?|not had (a|my) period|periods? (has |have )?not come)\b/, ['amenorrhea', 'amenorrhoea']],
  [/\b(how (can|do|would|will) i (tell|know)|signs? of|symptoms? of|first signs?)\b/, ['symptom', 'screening', 'diagnosis']],
];

/**
 * An age in a fertility or IVF question ("IVF success rates at 40", "I'm
 * 38") is about age, not the number: adds 'age'. Numbers
 * followed by a unit (weeks, days, mg, ...) are not ages.
 */
const AGE_NUMBER = /\b(3[5-9]|4[0-9])\b(?!\s*(\+|weeks?|wks?|days?|mg|mcg|hours?|hrs?|minutes?|mins?|months?|%|kg|lbs?|cm|mm|years? ago))/;
const AGE_STAGES = new Set<LifeStage>(['conception', 'ivf']);

// Medicines and supplements (stemmed query tokens). When a question names
// one, items about that substance (in their title, or failing that their
// own keywords) rank above items that only share a topic with it.
const SUBSTANCES = new Set(
  (
    'paracetamol acetaminophen tylenol panadol ibuprofen advil nurofen nsaid non-steroidal aspirin codeine opioid triptan sumatriptan ' +
    'antidepressant ssri snri sertraline zoloft fluoxetine prozac citalopram escitalopram paroxetine venlafaxine mirtazapine ' +
    'lithium lamotrigine valproate antiepileptic metformin insulin letrozole clomiphene clomid inositol myo-inositol ' +
    'progesterone progestogen dydrogesterone estrogen oestrogen estradiol testosterone tibolone levothyroxine thyroxine ' +
    'iron folic folate iodine omega-3 dha fish-oil calcium magnesium vitamin probiotic ' +
    'antibiotic nitrofurantoin trimethoprim cranberry fluconazole clotrimazole metronidazole antihistamine ondansetron ' +
    'doxylamine pyridoxine ginger tranexamic mefenamic labetalol nifedipine methyldopa heparin ' +
    'raloxifene bisphosphonate alendronate denosumab gabapentin fezolinetant clonidine misoprostol mifepristone ' +
    'levonorgestrel ulipristal domperidone melatonin'
  )
    .split(' ')
    .map(stem),
);

/** Score multipliers for items that name a substance the question names. */
export const SUBSTANCE_TITLE_BOOST = 1.3;
export const SUBSTANCE_KEYWORD_BOOST = 1.1;
/** Lift for pregnancy items when the question itself says pregnant/pregnancy. */
export const PREGNANCY_QUERY_BOOST = 1.1;
/**
 * For a pregnancy question, an item whose title is about the time after
 * birth or the baby (and never names pregnancy) answers a different
 * question: e.g. paracetamol for perineal pain after birth, or for a
 * preterm baby's heart duct. It gets no pregnancy lift and this factor.
 */
export const AFTER_BIRTH_TITLE_FACTOR = 0.85;
const AFTER_BIRTH_TITLE = /\b(postpartum|post-partum|postnatal|after (child)?birth|puerper\w*|newborns?|neonat\w*|preterm infants?|infants?)\b/i;
const PREGNANCY_TITLE = /\b(pregnan\w*|prenatal|antenatal|in utero|gestation\w*|during (labou?r|childbirth))\b/i;

/** True when a title is about after birth or the baby, not about pregnancy. */
export function isAfterBirthTitle(title: string): boolean {
  return AFTER_BIRTH_TITLE.test(title) && !PREGNANCY_TITLE.test(title);
}

/**
 * Citation audit (Nov 2026): "Can I keep taking my levothyroxine in
 * pregnancy?" got a review of women having IVF as its first source. When
 * neither the question nor the user's stage is about fertility treatment,
 * an item whose title is about IVF/ICSI/assisted reproduction studied a
 * different group of women and gets this factor.
 */
export const IVF_TITLE_FACTOR = 0.85;
const IVF_TITLE = /\b(in vitro fertili[sz]ation|ivf|icsi|intracytoplasmic|assisted reproduct\w*|art cycles?|embryo transfers?)\b/i;
const IVF_QUERY = /\b(ivf|icsi|in vitro|embryos?|egg retrieval|transfer|assisted reproduct\w*|fertility treatment|iui|insemination)\b/i;
const IVF_STAGES = new Set<string>(['ivf', 'conception']);

/**
 * Research round 9: one screening or prevention subject asked, a different
 * one in the title. The Swiss cervical-screening letter matched "cancer",
 * "screening" and the Swiss lift, so it was the 2nd source for Swiss
 * mammography questions and joined HPV-vaccine questions. A rule applies
 * when the question matches `ask` and not `unless`; items whose title
 * matches `title` and not `keep` get SUBJECT_MISMATCH_FACTOR.
 */
export const SUBJECT_MISMATCH_FACTOR = 0.6;
const SUBJECT_MISMATCH: { ask: RegExp; unless: RegExp; title: RegExp; keep: RegExp }[] = [
  // Breast screening asked, cervical screening in the title.
  {
    ask: /\b(mammo\w*|breast)\b/i,
    unless: /\b(cervi\w*|smear|pap|hpv)\b/i,
    title: /\b(cervi\w*|smear|pap)\b/i,
    keep: /\b(breast|mammo\w*)\b/i,
  },
  // Cervical screening asked, breast screening in the title.
  {
    ask: /\b(cervi\w*|smear|pap)\b/i,
    unless: /\b(mammo\w*|breast)\b/i,
    title: /\b(mammo\w*|breast)\b/i,
    keep: /\b(cervi\w*|smear|pap)\b/i,
  },
  // A vaccine asked, a screening programme in the title.
  {
    ask: /\bvaccin\w*\b/i,
    unless: /\b(screen\w*|smear|pap|test\w*)\b/i,
    title: /\bscreening\b/i,
    keep: /\bvaccin\w*\b/i,
  },
  // Round 10: leaking or a bladder / prolapse problem asked without any
  // word about an operation, a surgery review in the title. Pelvic-floor
  // training comes first for this, so for "I leak a bit of pee when I
  // sneeze since giving birth" the sling-operation review stepped ahead
  // of an exercise review; it now steps back. Asked about surgery, it
  // ranks as before.
  {
    ask: /\b(leak\w*|incontinen\w*|pee|wee|urine|bladder|prolapse)\b/i,
    unless: /\b(surg\w*|operat\w*|sling\w*|mesh|tape|colposuspension|bulking|procedure\w*)\b/i,
    title: /\b(surg\w*|operat\w*|sling\w*|mesh|tapes?|colposuspension|bulking|procedures?|repairs?)\b/i,
    keep: /\b(pelvic floor|muscle training|exercis\w*|physiother\w*|conservative)\b/i,
  },
  // Round 11: the Swiss cervical-screening letter matched "test" and the
  // Swiss lift, so it led "Chlamydia test, how often ...?" and came 2nd or
  // 3rd for PCOS blood tests and Swiss fertility tests. Another test asked
  // (no smear / HPV / cancer / check-up word): a cervical-screening title
  // steps back.
  {
    ask: /\b(tests?|testing|blood work|bloods)\b/i,
    unless: /\b(cervi\w*|smear|pap|hpv|cancer|check-?ups?|screen\w*)\b/i,
    title: /\bcervical (cancer )?screening\b/i,
    keep: /(?!)/,
  },
  // Round 11: an STI asked, a cervical-screening or group B strep title
  // (both matched "test" / "swab", the latter is about newborn sepsis).
  {
    ask: /\b(chlamydia|gonorrh\w*|syphilis|herpes|trichomon\w*|stis?|stds?|sexually transmitted)\b/i,
    unless: /\b(cervi\w*|smear|pap|hpv|pregnan\w*|labou?r|birth|newborns?)\b/i,
    title: /\b(cervical|streptococc\w*|gbs|pre-?eclampsia)\b/i,
    keep: /\b(chlamydia|gonorrh\w*|sexually transmitted|stis?)\b/i,
  },
  // Round 11: birth after a caesarean asked. Cochrane reviews on caesarean
  // rates, labour support and midwife care led "Can I have a vaginal birth
  // after a caesarean?" ahead of the FIGO and ACOG VBAC guidance; any title
  // that is not about birth after a previous caesarean steps back.
  {
    ask: /\b(vbac|tolac|(birth|labou?r|deliver\w*) after (a |my |one |two |previous |an? earlier )?(c-?sections?|caesareans?|cesareans?))\b/i,
    unless: /(?!)/,
    title: /\w/,
    keep: /\b(vbac|tolac|trial of labou?r|after (a )?(previous |prior )?(caesarean|cesarean|c-section)|(previous|prior|repeat) (caesarean|cesarean|c-section))\b/i,
  },
  // Round 11: an insurance question with no word about pregnancy or birth,
  // the BAG maternity-benefits title ("Does the Krankenkasse pay the yearly
  // gynaecology check-up?" got it first).
  {
    ask: /\b(insurance|insured|krankenkasse|kasse|cover(ed|s)?|pay|pays|paid|costs?)\b/i,
    unless: /\b(pregnan\w*|birth|matern\w*|midwi\w*|hebamme|baby|babies|antenatal|prenatal|postnatal|postpartum|breastfe\w*|ultrasounds?|scans?|nipt|trimester|ersttrimester\w*)\b/i,
    title: /\bmaternity\b/i,
    keep: /(?!)/,
  },
  // Round 11: breastfeeding asked without any word about cancer, a cancer
  // title that does not name breastfeeding ("Is the pill safe while
  // breastfeeding?" got a breast-cancer risk-factor review first, since
  // breastfeeding and the pill are risk factors in it).
  {
    ask: /\b(breastfe\w*|breast-?fe\w*|lactat\w*|nursing|stillen)\b/i,
    unless: /\b(cancer|tumou?rs?|lumps?|oncolog\w*)\b/i,
    title: /\b(cancer|carcinoma|tumou?rs?)\b/i,
    keep: /\b(breastfe\w*|lactat\w*)\b/i,
  },
  // Round 12: the Swiss law items answer legal, insurance and work
  // questions. Asked about health or chances with none of their words
  // ("How does age affect egg freezing success?" got the FMedG storage
  // item first, "Can I exercise during IVF stimulation?" the BAG fact
  // sheet, "Does the Pille danach need a prescription?" the answer on
  // contraception costs), they step back.
  // What insurance pays (KVG, the Federal Council answer, the BAG fact sheet).
  {
    ask: /\w/,
    unless: /\b(insur\w*|krankenkasse|kasse|pay|pays|paid|cover(ed|s)?|costs?|price\w*|free|deductible|franchise|selbstbehalt)\b/i,
    title: /\bKVG\b|\bmotion \d|\bfact sheet on reproductive medicine\b/,
    keep: /(?!)/,
  },
  // The KVG item is about medicines and cost-sharing: an insurance question
  // about something else ("Does the Krankenkasse pay the yearly gynaecology
  // check-up?") keeps the item that names that service first.
  {
    ask: /\w/,
    unless: /\b(hrt|hormon\w*|medicin\w*|medications?|drugs?|prescri\w*|pills?|tablets?|deductible|franchise|selbstbehalt|cost-?sharing)\b/i,
    title: /\bKVG\b/,
    keep: /(?!)/,
  },
  // What the law allows (FMedG).
  {
    ask: /\w/,
    unless: /\b(legal|illegal|laws?|allowed|banned?|permitted|rules?|stor(e|ed|age)|how long|donat\w*|donors?|surrogac\w*)\b/i,
    title: /\bFMedG\b/,
    keep: /(?!)/,
  },
  // Leave and work (EOG, ArG).
  {
    ask: /\w/,
    unless: /\b(leave|working|employ\w*|jobs?|(at|to) work|night shifts?|allowance|paternity|partner|mutterschutz\w*|mutterschaft\w*|rights?)\b/i,
    title: /\b(EOG|ArG)\b/,
    keep: /(?!)/,
  },
  // Round 13: an app or tracker asked, a title about something else ("Are
  // fertility apps reliable for avoiding or getting pregnant?" had two
  // antioxidant reviews and preconception lifestyle advice behind the app
  // review). Titles about apps, cycle tracking, fertility awareness or
  // timing sex stay.
  {
    ask: /\b(apps?|trackers?)\b/i,
    unless: /(?!)/,
    title: /\w/,
    keep: /\b(apps?|applications?|mobile|smartphones?|digital|track\w*|fertility awareness|natural family planning|timed intercourse|timing|cycles?|ovulat\w*|fertile)\b/i,
  },
  // Round 13: breasts asked without a word about feeding, a breastfeeding
  // title ("Sore breasts before period every month" and "Is it normal for
  // one breast to grow faster than the other?" got a review of
  // breastfeeding and the mother's health).
  {
    ask: /\bbreasts?\b/i,
    unless: /\b(breastfe\w*|breast-?fe\w*|feed\w*|nursing|lactat\w*|milk|nipples?|baby|babies|stillen)\b/i,
    title: /\b(breastfe\w*|breast-?feeding|lactat\w*)\b/i,
    keep: /(?!)/,
  },
  // Round 13: the thyroid asked, a title with no thyroid word ("Thyroid
  // problems after giving birth" got delayed milk supply and gestational
  // diabetes reviews). Asked together with miscarriage or fertility, the
  // pregnancy-loss and fertility guidance keeps its place.
  {
    ask: /\b(thyroid\w*|tsh|hashimoto\w*|hypothyroid\w*|hyperthyroid\w*)\b/i,
    unless: /\b(miscarr\w*|pregnancy loss|infertil\w*|fertility|ivf)\b/i,
    title: /\w/,
    keep: /\b(thyro\w*|tsh|iodine|levothyrox\w*|hypothyroid\w*|hyperthyroid\w*|hashimoto\w*|graves)\b/i,
  },
  // Round 13: an overview of acupuncture for cancer-related conditions led
  // "Joint pain in menopause, is it hormonal?", with side effects of
  // breast-cancer treatment behind it; without a cancer word they step back.
  {
    ask: /\w/,
    unless: /\b(cancer|tumou?rs?|oncolog\w*|chemo\w*|survivors?)\b/i,
    title: /\b(cancer-related|cancer treatments?|inhibitor-induced)\b/i,
    keep: /(?!)/,
  },
  // Round 14: the new ovarian cancer symptom items came up for "What are the
  // warning signs of OHSS?"; without a cancer word, ovarian cancer titles
  // step back.
  {
    ask: /\w/,
    unless: /\b(cancer|tumou?rs?|oncolog\w*|malignan\w*|ca-?125)\b/i,
    title: /\bovarian cancer\b/i,
    keep: /(?!)/,
  },
  // Round 14: the new breast pain and breast-check items came up for a
  // late-first-period question; without a breast word they step back.
  {
    ask: /\w/,
    unless: /\b(breasts?|nipples?|chest|mastalgia|bras?)\b/i,
    title: /\b(breast pain|check your breasts)\b/i,
    keep: /(?!)/,
  },
];

function subjectMismatchFactor(query: string, title: string): number {
  for (const r of SUBJECT_MISMATCH)
    if (r.ask.test(query) && !r.unless.test(query) && r.title.test(title) && !r.keep.test(title)) return SUBJECT_MISMATCH_FACTOR;
  return 1;
}

function stem(w: string): string {
  if (w.length > 5 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) return w.slice(0, -1);
  return w;
}

export function tokenize(text: string): string[] {
  return (text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[a-z0-9][a-z0-9-]*/g) ?? [])
    .map((w) => w.replace(/^-+|-+$/g, ''))
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map(stem)
    .filter((w) => !STOPWORDS.has(w));
}

function expandQuery(tokens: string[], extra: string[] = []): { token: string; weight: number }[] {
  const out = new Map<string, number>();
  for (const t of tokens) {
    out.set(t, Math.max(out.get(t) ?? 0, 1));
    for (const syn of SYNONYMS[t] ?? []) {
      const s = stem(syn);
      if (!out.has(s)) out.set(s, 0.7);
    }
  }
  for (const e of extra) {
    const s = stem(e);
    if (!out.has(s)) out.set(s, 0.7);
  }
  return [...out].map(([token, weight]) => ({ token, weight }));
}

/** Library words implied by the question's phrasing (PHRASE_SYNONYMS, ages). */
export function phraseExpansions(query: string, stage: LifeStage | null): string[] {
  const q = query.toLowerCase();
  const out: string[] = [];
  for (const [re, words] of PHRASE_SYNONYMS) if (re.test(q)) out.push(...words);
  if (stage && AGE_STAGES.has(stage) && AGE_NUMBER.test(q)) out.push('age');
  return out;
}

interface IndexedItem {
  item: ResearchItem;
  strong: Set<string>; // keywords, tags, topic ids/label heads
  topic: Set<string>; // our curated topic ids/label heads: high precision
  /** Words from a topic label's bracketed example list: weak, like a summary hit. */
  topicAside: Set<string>;
  /** The item's own keywords and tags (not its topics). */
  own: Set<string>;
  title: Set<string>;
  body: Set<string>;
  phrases: string[]; // multi-word keywords/tags, lowercased
}

/**
 * Splits a topic label into its head and its bracketed example list.
 * "Medicines in pregnancy (paracetamol, antidepressants)" names examples:
 * not every item in the topic is about paracetamol, so those words must
 * not count as a strong match for all of them. A bracket without a comma
 * is an alias of the head ("Polycystic ovary syndrome (PCOS)") and stays.
 */
export function splitTopicLabel(label: string): { head: string; aside: string } {
  let aside = '';
  const head = label.replace(/\(([^)]*)\)/g, (_whole, inner: string) => {
    if (!inner.includes(',')) return ` ${inner} `;
    aside += ` ${inner}`;
    return ' ';
  });
  return { head: head.replace(/\s+/g, ' ').trim(), aside: aside.trim() };
}

const indexCache = new WeakMap<ResearchItem[], IndexedItem[]>();
const focusDfCache = new WeakMap<ResearchItem[], Map<string, number>>();

/**
 * Rare query words are the subject of the question (citation audit, Nov
 * 2026). For "What is OHSS and how do I avoid it during IVF?" every word
 * used to count alike, so IVF reviews that only mention OHSS in passing
 * (and also say "avoid") outranked the OHSS guideline. A query word that
 * at most FOCUS_MAX_DF items carry in their title or own keywords now
 * lifts those items like a named medicine does (substanceFactor). Only
 * for a real library: in a handful of fixture items every word is rare.
 */
export const FOCUS_MAX_DF = 40;
export const FOCUS_MIN_ITEMS = 200;

/**
 * A question word that names one of our curated topics ("endometriosis",
 * "pcos", "osteoporosis") is its anchor. An item that never mentions any
 * anchor of the question, not even in its summary, matched only the side
 * words ("how do doctors diagnose ... surgery" pulled a bleeding-disorder
 * guideline into an endometriosis answer): it gets this factor.
 */
export const ANCHOR_MISS_FACTOR = 0.8;

/**
 * Womanie is a Swiss app: official Swiss guidance (BAG, BLV, SGGG items,
 * tagged "switzerland") steps forward when it matches the question's own
 * words and topic, so "whooping cough vaccine in pregnancy" or "folic acid
 * before pregnancy" cite the Swiss schedule / BLV advice ahead of US or
 * Canadian documents saying much the same (Ask AI audit, round 7). Items
 * found only by meaning, or missing the question's topic, get no lift.
 */
export const SWISS_SOURCE_FACTOR = 1.25;
const isSwissItem = (item: ResearchItem) => item.tags.includes('switzerland');
const topicVocabCache = new WeakMap<ResearchItem[], Set<string>>();

function topicVocabulary(items: ResearchItem[], idx: IndexedItem[]): Set<string> {
  const hit = topicVocabCache.get(items);
  if (hit) return hit;
  const vocab = new Set<string>();
  for (const it of idx) for (const t of it.topic) vocab.add(t);
  topicVocabCache.set(items, vocab);
  return vocab;
}

/** How many items carry each word in their title or own keywords/tags. */
function focusFrequency(items: ResearchItem[], idx: IndexedItem[]): Map<string, number> {
  const hit = focusDfCache.get(items);
  if (hit) return hit;
  const df = new Map<string, number>();
  for (const it of idx) for (const t of new Set([...it.title, ...it.own])) df.set(t, (df.get(t) ?? 0) + 1);
  focusDfCache.set(items, df);
  return df;
}

function indexItems(items: ResearchItem[], topics: ResearchTopic[]): IndexedItem[] {
  const hit = indexCache.get(items);
  if (hit) return hit;
  const topicLabel = new Map(topics.map((t) => [t.id, splitTopicLabel(t.label)]));
  const idx = items.map((item) => {
    const topicText = item.topics.map((t) => `${t.replace(/-/g, ' ')} ${topicLabel.get(t)?.head ?? ''}`).join(' ');
    const asideText = item.topics.map((t) => topicLabel.get(t)?.aside ?? '').join(' ');
    const own = new Set(tokenize([...item.keywords, ...item.tags].join(' ')));
    return {
      item,
      strong: new Set([...own, ...tokenize(topicText)]),
      topic: new Set(tokenize(topicText)),
      topicAside: new Set(tokenize(asideText)),
      own,
      title: new Set(tokenize(item.title)),
      body: new Set(tokenize(`${item.summary} ${item.keyPoints.join(' ')}`)),
      phrases: [...item.keywords, ...item.tags].filter((k) => k.includes(' ')).map((k) => k.toLowerCase()),
    };
  });
  indexCache.set(items, idx);
  return idx;
}

export interface SearchOptions {
  /** User's life stage: boosts matching items (or filters with strictStage). */
  lifeStage?: string | null;
  /** Only items in this stage (plus 'general' unless excludeGeneral). */
  strictStage?: boolean;
  excludeGeneral?: boolean;
  /** Only items tagged with this topic id. */
  topic?: string | null;
  limit?: number;
  /** Drop results scoring below this (chat uses it to avoid weak sources). */
  minScore?: number;
  /**
   * Query + document embeddings for hybrid ranking (see hybrid.ts). Absent
   * or null = keyword-only, exactly the original behaviour.
   */
  semantic?: SemanticInput | null;
  /**
   * Relevance floor (chat): when no item in the library matches any of the
   * question's subject words (see SUBJECT_CONTEXT_WORDS), every hit shares
   * only the life stage or a loose semantic neighbourhood with it; then
   * only items at least SUBJECTLESS_MIN_COSINE close to the question stay.
   */
  requireSubject?: boolean;
}

/**
 * Words that set the scene of a question (who, which life stage, what
 * kind of question) rather than its subject. "Can I eat sushi while
 * pregnant?" is about sushi: an item that matches only "eat" and
 * "pregnant" (a gestational-diabetes diet, Japanese nutrient intakes) is
 * off-topic unless its embedding is very close (SUBJECTLESS_MIN_COSINE).
 * Stemmed like query tokens.
 */
export const SUBJECT_CONTEXT_WORDS = new Set(
  (
    'pregnant pregnancy expecting antenatal prenatal trimester breastfeeding breastfeed nursing lactation lactating ' +
    'postpartum postnatal birth baby infant newborn woman women eat eating take taking use using dose doses dosage ' +
    'work works working effective help helps try trying start stop worried worry risk risks late early long often'
  )
    .split(' ')
    .map(stem),
);

/**
 * Cosine an item needs when no item matches the question's subject words.
 * From the chat eval: "is it safe to fly at 30 weeks" keeps the air-travel
 * guideline (0.66) and loses COVID-vaccine and exercise items (~0.41);
 * "can I eat sushi" (before its synonyms) lost Japanese nutrient intakes,
 * diabetes diets and vegetarian diets (0.38-0.47).
 */
export const SUBJECTLESS_MIN_COSINE = 0.5;

export interface SemanticInput {
  /** Unit-length query vector. */
  query: Float32Array;
  /** Unit-length document vectors by item id (missing = no semantic signal). */
  docs: Map<string, Float32Array>;
  /** Share of the blend given to the semantic score (0-1). */
  weight: number;
  /** Cosine at or below which an item gets no semantic credit. */
  floor: number;
  /** Cosine at or above which an item gets full semantic credit. */
  ceil: number;
}

/**
 * Keyword score that counts as a full-strength match when normalising:
 * the keyword part of the blend is base / max(best base, KEYWORD_REF), so
 * a weak best keyword match is not inflated to 1.
 */
export const KEYWORD_REF = 10;

/** Cosine mapped onto 0-1 between the model's floor and ceil. */
export function semanticStrength(cos: number, floor: number, ceil: number): number {
  if (!(ceil > floor)) return 0;
  return Math.max(0, Math.min(1, (cos - floor) / (ceil - floor)));
}

/**
 * The hybrid base score, in keyword-score units so minScore and the chat
 * cutoff keep their meaning: ref * ((1 - w) * keyword/ref + w * semantic).
 */
export function blendScores(keywordBase: number, semantic: number, weight: number, ref: number): number {
  const w = Math.max(0, Math.min(1, weight));
  return ref * ((1 - w) * Math.min(1, keywordBase / ref) + w * semantic);
}

export interface ScoredItem {
  item: ResearchItem;
  score: number;
}

// Kept small: evidence level breaks ties between similarly relevant items
// but must not lift an off-subject guideline over the review that answers
// the question (was 1.25, which put e.g. an antirheumatic-drugs guideline
// above the paracetamol-in-pregnancy reviews).
const EVIDENCE_BOOST: Record<EvidenceLevel, number> = { guideline: 1.15, 'systematic review': 1.1, study: 1 };
// Cochrane reviews are the most rigorous reviews in the library.
const COCHRANE_BOOST = 1.1;

/**
 * Guidelines replaced by a newer version of the same guideline that is
 * also in the library (citation audit, Nov 2026): the 2018 international
 * PCOS guideline was the third source for "How is PCOS diagnosed?" next to
 * its 2023 update. Old id -> newer id. The old one only steps back while
 * its successor is in the searched items.
 */
export const SUPERSEDED: Record<string, string> = {
  'pmid-30024653': 'pmid-37589624', // International PCOS guideline 2018 -> 2023
  'pmid-30453865': 'pmid-37589624', // Australian PCOS guideline summary 2018 -> 2023 international
  'pmid-29064964': 'pmid-30681543', // ACOG VBAC PB 184 (2017) -> PB 205 (2019)
  'pmid-29064970': 'pmid-30681543',
  'pmid-27333357': 'pmid-30134424', // ACOG obstetric lacerations PB 165 (2016) -> PB 198 (2018)
  'pmid-28333811': 'pmid-30801474', // ACOG obstetric analgesia PB 177 (2017) -> PB 209 (2019)
  'pmid-27214185': 'pmid-29794673', // ACOG aromatase inhibitors CO 663 (2016) -> CO 738 (2018)
  'pmid-29232273': 'pmid-29470343', // ACOG tubal ectopic PB 191 -> PB 193 (2018)
  'pmid-26813211': 'pmid-37338872', // USPSTF depression screening 2016 -> 2023
  'pmid-34014910': 'pmid-39106301', // US SPR 2021 update -> US SPR 2024
  'pmid-26241291': 'pmid-28937569', // ACOG marijuana CO 637 (2015) -> CO 722 (2017)
  'pmid-26942391': 'pmid-28937570', // ACOG imaging in pregnancy CO 656 (2016) -> CO 723 (2017)
  'pmid-30358733': 'pmid-35797481', // NAMS hormone therapy position statement 2017 -> 2022
  'pmid-26382310': 'pmid-37252752', // NAMS non-hormonal hot flushes 2015 -> 2023
  'pmid-25611642': 'pmid-30575639', // ACOG severe hypertension in pregnancy CO 623 (2015) -> CO 767 (2019)
  'pmid-30629567': 'pmid-37486660', // ACOG perinatal depression screening CO 757 (2018) -> CPG 4 (2023)
  'pmid-28934178': 'pmid-39106314', // US MEC 2016 updates -> US MEC 2024
  'pmid-32271729': 'pmid-39106314',
  'pmid-28492856': 'pmid-36592456', // ACP osteoporosis treatment 2017 -> 2023 living guideline
  // Research round 9: superseded-guideline sweep. Newer version already in the library:
  'pmid-26334606': 'pmid-35691683', // SOGC folic acid 2015 -> Guideline 427 (2022)
  'pmid-35691684': 'pmid-35691683', // Guideline 427, French version -> English record (one guideline, one slot)
  'pmid-28625286': 'pmid-40216328', // SOGC primary dysmenorrhoea No. 345 (2017) -> 2025 update
  'pmid-29080721': 'pmid-38049282', // SOGC hirsutism No. 350 (2017) -> Guideline 444 (2023)
  'pmid-26637088': 'pmid-39581327', // SOGC OASIS 2015 -> Guideline 457 (2024)
  'pmid-25711406': 'pmid-33529414', // AWMF vulvovaginal candidosis 015/072 2015 -> 2021
  'pmid-29566854': 'pmid-38762806', // ASRM PGT-A committee opinion 2018 -> 2024
  'pmid-27235766': 'pmid-38556964', // ASRM uterine septum guideline 2016 -> 2024
  'pmid-27008889': 'pmid-39652037', // ESHRE premature ovarian insufficiency 2016 -> 2025
  'pmid-30801477': 'pmid-33595252', // ACOG morcellation CO 770 (2019) -> CO 822 (2021)
  'pmid-30575668': 'pmid-32443079', // ACOG gestational hypertension PB 202 (2019) -> PB 222 (2020)
  'pmid-30575675': 'pmid-32443079',
  'pmid-31477606': 'pmid-40717224', // AAP influenza in children 2019-2020 -> 2025-2026
  'pmid-37641884': 'pmid-40717224', // AAP influenza in children 2023-2024 -> 2025-2026
  'pmid-26344176': 'pmid-39163015', // USPSTF iron in pregnancy 2015 -> 2024
  'pmid-26389730': 'pmid-33464343', // USPSTF tobacco cessation 2015 -> 2021
  // Newer version added in round 9 (summaries from the abstracts):
  'pmid-28097362': 'pmid-37526713', // USPSTF folic acid 2017 -> 2023 reaffirmation
  'pmid-28444286': 'pmid-37721605', // USPSTF pre-eclampsia screening 2017 -> hypertensive disorders 2023
  'pmid-29710141': 'pmid-38833246', // USPSTF falls prevention 2018 -> 2024
  'pmid-25585505': 'pmid-33280722', // ASRM ovarian reserve testing 2015 -> 2020
  'pmid-30659131': 'pmid-41671440', // NCCN cervical cancer v3.2019 -> v2.2026
  'pmid-28937568': 'pmid-32332417', // ACOG smoking cessation CO 721 (2017) -> CO 807 (2020)
  'pmid-26598775': 'pmid-31940155', // NICE menopause NG23 2015 -> November 2024 update
};
/**
 * Factor for a superseded guideline, and for an ACOG "Summary:" record
 * whose full version is also in the library (two slots, one guideline).
 */
export const SUPERSEDED_FACTOR = 0.6;
const demoteCache = new WeakMap<ResearchItem[], Set<string>>();

/** Normalised title without the leading "Summary" marker, for duplicate checks. */
function titleKey(title: string): string {
  return title.toLowerCase().replace(/\bsummary:\s*/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Ids of items that step back for a newer or fuller record in `items`. */
export function demotedIds(items: ResearchItem[]): Set<string> {
  const hit = demoteCache.get(items);
  if (hit) return hit;
  const ids = new Set(items.map((i) => i.id));
  const full = new Set(items.filter((i) => !/\bsummary:/i.test(i.title)).map((i) => titleKey(i.title)));
  const out = new Set<string>();
  for (const it of items) {
    const newer = SUPERSEDED[it.id];
    if (newer && ids.has(newer)) out.add(it.id);
    else if (/\bsummary:/i.test(it.title) && full.has(titleKey(it.title))) out.add(it.id);
  }
  demoteCache.set(items, out);
  return out;
}

function stageAllowed(item: ResearchItem, stage: LifeStage | null, opts: SearchOptions): boolean {
  if (!stage || !opts.strictStage) return true;
  if (item.lifeStages.includes(stage)) return true;
  return !opts.excludeGeneral && item.lifeStages.includes('general');
}

function dotProduct(a: Float32Array, b: Float32Array): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

const PREGNANCY_WORDS = new Set(['pregnant', 'pregnancy', 'expecting', 'antenatal', 'prenatal'].map(stem));

/** Named medicine in the title > in the item's own keywords > neither. */
function substanceFactor(it: IndexedItem, substances: string[]): number {
  if (substances.length === 0) return 1;
  if (substances.some((s) => it.title.has(s))) return SUBSTANCE_TITLE_BOOST;
  if (substances.some((s) => it.own.has(s))) return SUBSTANCE_KEYWORD_BOOST;
  return 1;
}

function stageFactor(item: ResearchItem, stage: LifeStage | null): number {
  if (!stage) return 1;
  if (item.lifeStages.includes(stage)) return 1.5;
  if (item.lifeStages.includes('general')) return 1.05;
  return 0.6;
}

/**
 * Ranks `items` for a free-text query. Pure (pass the items in), so it is
 * testable with fixtures; searchResearch() runs it on the real library.
 *
 * Score per query token: keyword/tag/topic hit 3, title hit 2, summary hit
 * 1 (synonyms count 0.7x), plus 2 per multi-word keyword found verbatim in
 * the query; then x coverage (share of query tokens matched), x life-stage
 * factor, x evidence boost, with a small recency nudge. Words in a topic
 * label's bracketed example list count like a summary hit (1). A medicine
 * the question names lifts items with it in the title (x1.3) or own
 * keywords (x1.1); "pregnant" in the question lifts pregnancy items (x1.1)
 * and lowers items whose title is about after birth or the baby (x0.85).
 * Citation-audit factors (Nov 2026): rare subject words lift items naming
 * them (focus terms, like medicines); items that miss every topic word of
 * the question x0.8; IVF-population titles x0.85 outside fertility
 * questions; superseded guidelines and duplicate "Summary:" records x0.6;
 * Swiss (BAG / BLV / SGGG) items that match the question words x1.25.
 * Round 9: a title on a different screening / prevention subject than
 * the question (cervical vs breast, screening vs vaccine) x0.6.
 * Round 10: a surgery title for a leaking / bladder / prolapse question
 * that names no operation x0.6.
 */
export function searchItems(
  items: ResearchItem[],
  query: string,
  opts: SearchOptions = {},
  topics: ResearchTopic[] = [],
): ScoredItem[] {
  const stage = normalizeLifeStage(opts.lifeStage);
  const qTokens = tokenize(query);
  const expanded = expandQuery(qTokens, phraseExpansions(query, stage));
  const qLower = ` ${query.toLowerCase().replace(/[^a-z0-9 -]+/g, ' ').replace(/\s+/g, ' ')} `;
  const nowYear = new Date().getFullYear();
  const results: ScoredItem[] = [];
  const sem = query.trim() ? opts.semantic ?? null : null;
  const indexed = indexItems(items, topics);
  const focusDf = items.length >= FOCUS_MIN_ITEMS ? focusFrequency(items, indexed) : null;
  // Named medicines, plus rare subject words of the question (focus terms)
  // together with their synonyms: "coffee" is rare in titles, but an item
  // titled "caffeine intake in pregnancy" answers it just as well.
  const focus = qTokens.filter((t) => {
    if (!focusDf || SUBJECT_CONTEXT_WORDS.has(t) || PREGNANCY_WORDS.has(t) || /^\d+$/.test(t)) return false;
    const n = focusDf.get(t) ?? 0;
    return n > 0 && n <= FOCUS_MAX_DF;
  });
  const substances = [
    ...new Set([
      ...expanded.map((e) => e.token).filter((t) => SUBSTANCES.has(t)),
      ...focus.flatMap((t) => [t, ...(SYNONYMS[t] ?? []).map(stem)]),
    ]),
  ];
  const asksPregnancy = qTokens.some((t) => PREGNANCY_WORDS.has(t));
  const vocab = topicVocabulary(items, indexed);
  const demoted = demotedIds(items);
  const anchors = qTokens.filter((t) => vocab.has(t) && !SUBJECT_CONTEXT_WORDS.has(t) && !PREGNANCY_WORDS.has(t) && !/^\d+$/.test(t));
  const fertilityTreatmentContext = (stage !== null && IVF_STAGES.has(stage)) || IVF_QUERY.test(query);
  const subjectTokens = opts.requireSubject ? qTokens.filter((t) => !SUBJECT_CONTEXT_WORDS.has(t) && !/^\d+$/.test(t)) : [];
  // Subject words for the Swiss lift (not "pregnant", "swiss" or other context words).
  const ownTokens = qTokens.filter((t) => !SUBJECT_CONTEXT_WORDS.has(t) && !PREGNANCY_WORDS.has(t) && !/^\d+$/.test(t));
  const candidates: { it: IndexedItem; base: number; strength: number; cos: number; subject: boolean; anchored: boolean; own: boolean }[] = [];

  for (const it of indexed) {
    if (opts.topic && !it.item.topics.includes(opts.topic)) continue;
    if (!stageAllowed(it.item, stage, opts)) continue;

    let raw = 0;
    const matched = new Set<string>();
    for (const { token, weight } of expanded) {
      let s = 0;
      if (it.strong.has(token)) s = it.topic.has(token) ? 4 : 3;
      else if (it.title.has(token)) s = 2;
      else if (it.body.has(token) || it.topicAside.has(token)) s = 1;
      if (s > 0) {
        raw += s * weight;
        matched.add(token);
      }
    }
    for (const p of it.phrases) if (qLower.includes(` ${p} `)) raw += 2;

    const subject = subjectTokens.some((t) => matched.has(t) || (SYNONYMS[t] ?? []).some((x) => matched.has(stem(x))));
    const own = ownTokens.some((t) => matched.has(t) || (SYNONYMS[t] ?? []).some((x) => matched.has(stem(x))));
    const anchored = anchors.length === 0 || anchors.some((t) => matched.has(t) || (SYNONYMS[t] ?? []).some((x) => matched.has(stem(x))));
    const coverage = qTokens.length
      ? qTokens.filter((t) => matched.has(t) || (SYNONYMS[t] ?? []).some((s) => matched.has(stem(s)))).length / qTokens.length
      : 1;
    const base = qTokens.length ? raw * (0.4 + 0.6 * coverage) : 1;
    if (sem) {
      const doc = sem.docs.get(it.item.id);
      const cos = doc ? dotProduct(sem.query, doc) : 0;
      const strength = doc ? semanticStrength(cos, sem.floor, sem.ceil) : 0;
      if (raw === 0 && strength === 0) continue;
      candidates.push({ it, base: raw === 0 ? 0 : base, strength, cos, subject, anchored, own });
      continue;
    }
    if (qTokens.length > 0 && raw === 0) continue;
    candidates.push({ it, base, strength: 0, cos: 0, subject, anchored, own });
  }
  // Relevance floor: no item mentions any subject word of the question,
  // so every candidate only shares its life stage or a loose semantic
  // neighbourhood. Keep the close neighbours only (often none at all).
  // Requiring the subject per item instead lost the right sources for
  // everyday words the library does not use ("running", "screams").
  if (subjectTokens.length && !candidates.some((c) => c.subject)) {
    const close = candidates.filter((c) => c.cos >= SUBJECTLESS_MIN_COSINE);
    candidates.length = 0;
    candidates.push(...close);
  }

  // Hybrid: normalise the keyword part against the best keyword match of
  // this query (at least KEYWORD_REF) and blend in the semantic strength.
  const ref = sem ? Math.max(KEYWORD_REF, ...candidates.map((c) => c.base)) : 0;
  for (const { it, base: kwBase, strength, anchored, own } of candidates) {
    const base = sem ? blendScores(kwBase, strength, sem.weight, ref) : kwBase;
    const recency = 1 + Math.max(0, 10 - (nowYear - it.item.year)) * 0.005;
    const cochrane = /cochrane/i.test(it.item.journal) ? COCHRANE_BOOST : 1;
    const current = demoted.has(it.item.id) ? SUPERSEDED_FACTOR : 1;
    const substance = substanceFactor(it, substances);
    const pregnancy = !asksPregnancy
      ? 1
      : isAfterBirthTitle(it.item.title)
        ? AFTER_BIRTH_TITLE_FACTOR
        : it.item.lifeStages.includes('pregnancy')
          ? PREGNANCY_QUERY_BOOST
          : 1;
    const ivf = !fertilityTreatmentContext && IVF_TITLE.test(it.item.title) ? IVF_TITLE_FACTOR : 1;
    const anchor = anchored ? 1 : ANCHOR_MISS_FACTOR;
    const swiss = anchored && own && isSwissItem(it.item) ? SWISS_SOURCE_FACTOR : 1;
    const mismatch = subjectMismatchFactor(query, it.item.title);
    const score =
      base * stageFactor(it.item, stage) * EVIDENCE_BOOST[it.item.evidenceLevel] * cochrane * recency * substance * pregnancy * ivf * anchor * swiss * current * mismatch;
    if (opts.minScore && score < opts.minScore) continue;
    results.push({ item: it.item, score: Math.round(score * 100) / 100 });
  }

  results.sort((a, b) => b.score - a.score || b.item.year - a.item.year || a.item.pmid.localeCompare(b.item.pmid));
  return opts.limit ? results.slice(0, opts.limit) : results;
}

/** searchItems over the real library. */
export function searchResearch(query: string, opts: SearchOptions = {}): ScoredItem[] {
  const lib = getLibrary();
  return searchItems(lib.items, query, opts, lib.topics);
}

/**
 * "What the research says" about a topic id (e.g. 'caffeine-pregnancy')
 * or keyword (e.g. 'ferritin'), best evidence first. Hook for feature
 * cards that sit next to the user's own data.
 */
export function evidenceForTopic(
  topicOrKeyword: string,
  opts: { lifeStage?: string | null; limit?: number } = {},
): ResearchItem[] {
  const lib = getLibrary();
  const limit = opts.limit ?? 3;
  const isTopic = lib.topics.some((t) => t.id === topicOrKeyword);
  const results = isTopic
    ? searchItems(lib.items, '', { topic: topicOrKeyword, lifeStage: opts.lifeStage }, lib.topics)
        .sort((a, b) => rankEvidence(b.item) - rankEvidence(a.item))
    : searchItems(lib.items, topicOrKeyword, { lifeStage: opts.lifeStage, minScore: 2 }, lib.topics);
  return results.slice(0, limit).map((r) => r.item);
}

function rankEvidence(item: ResearchItem): number {
  return (item.evidenceLevel === 'guideline' ? 2 : item.evidenceLevel === 'systematic review' ? 1 : 0) * 100 + item.year;
}

/** For the Library page: filter by stage/topic and optional text. */
export function browseItems(opts: {
  lifeStage?: string | null;
  topic?: string | null;
  q?: string | null;
  semantic?: SemanticInput | null;
}): ResearchItem[] {
  const lib = getLibrary();
  const q = (opts.q ?? '').trim();
  const res = searchItems(
    lib.items,
    q,
    { lifeStage: opts.lifeStage, strictStage: Boolean(opts.lifeStage), topic: opts.topic || null, semantic: opts.semantic },
    lib.topics,
  );
  if (q) return res.map((r) => r.item);
  return res.map((r) => r.item).sort((a, b) => rankEvidence(b) - rankEvidence(a));
}

// ── Chat sources ──────────────────────────────────────────────────

export interface ChatSource {
  n: number;
  id: string;
  pmid: string;
  title: string;
  source: string;
  year: number;
  evidenceLevel: EvidenceLevel;
  url: string;
  /** Licence of the open-access full text the model also read (e.g. "CC BY"), if any. */
  fulltext?: string;
}

/**
 * Picks 0-6 sources for a chat question. Fewer than 3 only when the
 * library has nothing relevant: a weak source is worse than none.
 */
export function selectChatSources(
  question: string | null | undefined,
  lifeStage: string | null | undefined,
  items?: ResearchItem[],
  topics?: ResearchTopic[],
  semantic?: SemanticInput | null,
): ResearchItem[] {
  if (!question || !question.trim()) return [];
  const lib = items ? { items, topics: topics ?? [] } : getLibrary();
  const ranked = searchItems(lib.items, question.slice(0, 500), { lifeStage, minScore: 5, semantic, requireSubject: true }, lib.topics);
  if (ranked.length === 0) return [];
  // Keep items within reach of the best one so a strong match does not
  // drag in loosely related filler.
  const cutoff = ranked[0].score * 0.5;
  return ranked.filter((r) => r.score >= cutoff).slice(0, 6).map((r) => r.item);
}

export function toChatSources(items: ResearchItem[]): ChatSource[] {
  return items.map((it, i) => ({
    n: i + 1,
    id: it.id,
    pmid: it.pmid,
    title: it.title,
    source: it.source,
    year: it.year,
    evidenceLevel: it.evidenceLevel,
    url: it.url,
  }));
}

/**
 * Safety verdicts and doses for named medicines (QA, Nov 2026): the chat
 * hinted at codeine's metabolism without saying anything the sources
 * support, and refused any ibuprofen dose although it had a period-pain
 * guideline. A dose may be reported only as what a given source states.
 */
export const MEDICINE_RULES = `Medicines, safety and doses:
- Say whether a specific medicine is safe in pregnancy or while breastfeeding only if a research source above states it for that medicine. Otherwise say the research here does not cover it, and to ask a pharmacist or doctor before taking it; do not give a safety verdict of your own.
- Doses: if a source above states a standard dose or regimen for the medicine asked about, you may report it as what that source says ("the guideline mentions ..."), with its number, and always add that they should check the label or with a pharmacist or doctor, especially if they have other conditions or take other medicines. Never give a dose, amount or schedule that no source above states. For prescription-only medicines (for example antidepressants, or opioids such as codeine) never go beyond what a source states: the dose is set by the prescriber, so say to ask them. Keep every pregnancy or breastfeeding caution a source gives.
- If no source states a dose, say the research here does not give one and point to the label, a pharmacist or the prescriber, then share what the sources do say about the medicine (for example how well it works), rather than only declining.`;

/** System-prompt block listing the numbered sources and citation rules. */
export function buildSourcesPrompt(items: ResearchItem[]): string {
  if (items.length === 0) {
    return `\n\n## Research sources\nNo items from the Womanie research library matched this question. Do not cite any sources or use bracketed numbers. If you give general health information, say it is general and suggest checking with a doctor or midwife.
${MEDICINE_RULES}`;
  }
  const blocks = items.map((it, i) => {
    const certainty = it.certainty && it.certainty !== 'not stated' ? `; certainty of evidence: ${it.certainty}` : '';
    return `[${i + 1}] ${it.title} — ${it.source}, ${it.year} (${it.evidenceLevel}${certainty})
Finding: ${it.summary}
Key points: ${it.keyPoints.join(' | ')}`;
  });
  return `\n\n## Research sources
These are summaries of published research from the Womanie research library (clinical guidelines and systematic reviews from PubMed, plus official Swiss guidance from BAG, BLV and SGGG), chosen for this question. Each one lists what the research actually found; check that text before citing it:

${blocks.join('\n\n')}

Rules for using these sources:
- Cite only sources you actually used: put a source's number in square brackets, e.g. [1] or [1][3], only after a sentence or clause that its Finding, Key points or passage directly support. The source must say the specific thing your sentence says, not just be about the same topic.
- Before each citation, check the sentence against that source's text. Never carry a dose, amount, percentage, risk figure, duration, age or population over from a source unless it matches exactly what the source states (for example, do not cite a source that studied 300 mg next to a sentence about 200 mg). If the numbers differ, either use the source's own figure or drop the citation.
- Put each number straight after the words its source supports. Anything you add after the number in the same sentence (advice such as "so it is worth seeing your GP", your own explanation, or a point from another source) does not get that number. Example: "Untreated period pain can turn into long-term pain [1], so it is worth getting checked."
- Name the subject in every cited sentence (the medicine, test or treatment), never just "it" or "this", and keep the source's population and certainty for that finding (for example "in copper-coil users", "low-certainty evidence"). Never make a finding sound stronger or more general than the source.
- If no source above supports a claim, state it without a citation as general information, or say the evidence here is limited. Never attach a nearby source just to give a sentence a number.
- Fewer, accurate citations are better than many loose ones. It is fine to cite only one or two sources, or none.
- Never cite anything that is not in this list, never use a number that is not listed above, never invent studies, numbers or guidelines, and never use bracketed numbers for anything else.
- First check whether any source above answers the question actually asked (the same medicine, food, test or situation, in the same group of people). If none does, say so plainly near the start (for example "The research I have here doesn't cover codeine while breastfeeding") and do not fill the gap with sources about something else. Leave out sources that are only about the same general area.
- If the sources are uncertain, low-certainty, conflicting or do not quite answer the question, say so plainly.
${MEDICINE_RULES}
- Do not add your own "Sources" or reference list at the end; the app shows the cited sources under your answer.`;
}

/**
 * Removes citation markers whose number is not one of the given sources
 * ([7] when only [1]-[3] exist), keeping valid numbers inside a group
 * ([1, 7] -> [1]). A safety net for numbers the model invented.
 */
export function stripUnknownCitations(text: string, valid: readonly number[]): string {
  const ok = new Set(valid);
  return text.replace(/([ \t]*)\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\](?!\()/g, (_whole, ws: string, list: string) => {
    const keep = list.split(',').map((x) => Number(x.trim())).filter((n) => ok.has(n));
    return keep.length === 0 ? '' : `${ws}[${keep.join(', ')}]`;
  });
}

/** Numbers like [2] or [1][3] or [1, 3] that the answer actually cites. */
export function citedNumbers(text: string, max: number): number[] {
  const found = new Set<number>();
  for (const m of text.matchAll(/\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\]/g)) {
    for (const n of m[1].split(',').map((x) => Number(x.trim()))) if (n >= 1 && n <= max) found.add(n);
  }
  return [...found].sort((a, b) => a - b);
}

/**
 * Markdown block appended to the stored assistant message so the cited
 * sources survive a reload (chat_messages has no column for them). The
 * chat page parses it back into the compact Sources list
 * (src/lib/research-sources.ts) and strips it before re-sending history.
 */
export const SOURCES_FOOTER_MARK = '\n\n---\n**Sources**\n';

export function formatSourcesFooter(sources: ChatSource[], answer: string): string {
  const cited = new Set(citedNumbers(answer, sources.length));
  const used = sources.filter((s) => cited.has(s.n));
  if (used.length === 0) return '';
  const esc = (s: string) => s.replace(/[[\]]/g, '');
  return SOURCES_FOOTER_MARK + used.map((s) => `- [${s.n}] [${esc(s.title)}](${s.url}) — ${esc(s.source)}, ${s.year}${s.fulltext ? ` · Full text, ${esc(s.fulltext)}` : ''}`).join('\n');
}
