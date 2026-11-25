// Deterministic post-answer check of the chat's [n] citations.
//
// The citation audit (scripts/research/citation-audit.mjs) found that
// unsupported citations are rare (~1%) but can be dangerous: a gabapentin
// side effect cited to a source about paroxetine, a source saying
// freeze-all LOWERS the OHSS risk cited for a sentence saying it RAISES it.
// This check runs on the server after the answer has streamed, with no
// extra model call. For every cited stretch of text it compares three
// things with the exact text the model was given for that [n] (summary,
// key points and full-text passages):
//   - medicine names: the source must mention at least one of them;
//   - numbers with units (mg, µg, %, weeks, IU, mmol/L ...): each must be
//     in one of the cited sources (unit conversions and rounding allowed);
//   - direction: the source must not clearly state the opposite effect
//     (raises vs lowers, or "did not raise") for the same terms. Kept
//     conservative: negated claims, two-way and unmatched clauses are
//     never judged;
//   - safety: a claim that a medicine is safe / can be used must not be
//     cited to a source that only says to avoid it (contraindicated, not
//     recommended) and never calls it safe.
// A failing [n] is removed from the sentence (the sentence stays, now
// uncited). Everything here errs towards keeping a citation.

import type { ResearchItem } from './library.js';

export type CitationIssue = 'drug' | 'number' | 'direction' | 'safety';

export interface RemovedCitation {
  n: number;
  issue: CitationIssue;
  /** The drug name or number+unit that failed (no other user content). */
  token: string;
}

export interface CitationCheckResult {
  text: string;
  removed: RemovedCitation[];
}

export interface CitationCheckOptions {
  /**
   * Text whose numbers are the patient's own (records, the question): a
   * number found here is never held against a source ("your AMH of 1.2
   * ng/mL is low for your age [1]").
   */
  exemptText?: string;
}

// ── Source texts ──────────────────────────────────────────────────────

/** The text the model saw for each [n]: title, summary, key points, passages. */
export function evidenceTexts(
  researchItems: readonly Pick<ResearchItem, 'pmid' | 'title' | 'summary' | 'keyPoints'>[],
  passages: readonly { pmid: string; text: string }[] = [],
): Map<number, string> {
  const out = new Map<number, string>();
  researchItems.forEach((it, i) => {
    const own = passages.filter((p) => p.pmid === it.pmid).map((p) => p.text);
    out.set(i + 1, [it.title, it.summary, ...it.keyPoints, ...own].join('\n'));
  });
  return out;
}

// ── Text normalisation ────────────────────────────────────────────────

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};
const WORD_NUM_RE = new RegExp(
  `\\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[- ](one|two|three|four|five|six|seven|eight|nine)\\b|\\b(${Object.keys(WORD_NUMBERS).join('|')})\\b`,
  'gi',
);

/** Lower case, British spellings folded, number words as digits. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[µμ]/g, 'µ')
    .replace(/oestr/g, 'estr')
    .replace(/colecalciferol/g, 'cholecalciferol')
    .replace(/sulph/g, 'sulf')
    .replace(/haem/g, 'hem')
    .replace(/ovarian hyperstimulation syndrome/g, 'ohss')
    .replace(/polycystic ovary syndrome|polycystic ovarian syndrome/g, 'pcos')
    .replace(/(?:hormone replacement|menopausal hormone) therapy/g, 'hrt')
    .replace(/\bmht\b/g, 'hrt')
    .replace(/urinary tract infections?/g, 'uti')
    .replace(/venous thromboembolism/g, 'vte')
    .replace(/in vitro fertili[sz]ation/g, 'ivf')
    .replace(/(\d),(\d{3})(?!\d)/g, '$1$2')
    .replace(WORD_NUM_RE, (_w, tens: string | undefined, unit: string | undefined, single: string | undefined) =>
      tens ? String(WORD_NUMBERS[tens] + WORD_NUMBERS[unit!]) : String(WORD_NUMBERS[single!]),
    );
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── Medicines ─────────────────────────────────────────────────────────

/**
 * Common women's-health medicines and supplements. `names` are spotted in
 * the answer; the source supports the mention if it contains any of
 * `names` or `accept` (synonyms, brand names, the drug class).
 */
interface DrugEntry { names: string[]; accept?: string[] }
const NSAID = ['nsaid', 'non-steroidal', 'nonsteroidal', 'anti-inflammatory'];
const SSRI = ['ssri', 'selective serotonin', 'antidepressant'];
const SNRI = ['snri', 'serotonin-noradrenaline', 'serotonin and noradrenaline', 'serotonin-norepinephrine', 'serotonin and norepinephrine', 'antidepressant'];
const PROGESTOGENS = ['progestogen', 'progestin', 'progestagen', 'progesterone', 'levonorgestrel', 'norethisterone', 'norethindrone', 'desogestrel', 'dydrogesterone', 'medroxyprogesterone', 'drospirenone', 'dienogest', 'etonogestrel', 'norgestimate', 'gestodene'];
const ESTROGENS = ['estrogen', 'estradiol', 'estriol', 'estrone', 'ethinylestradiol', 'ethinyl estradiol', 'conjugated equine'];
const BISPHOS = ['bisphosphonate'];
const HORMONAL = ['combined oral', 'combined hormonal', 'combined pill', 'hrt', 'hormone therapy', 'hormonal contracept'];
const GNRH = ['gnrh', 'gonadotrophin-releasing', 'gonadotropin-releasing'];
const OPIOID = ['opioid', 'opiate'];
const ANTIEPILEPTIC = ['antiepileptic', 'anti-epileptic', 'anticonvulsant', 'antiseizure', 'anti-seizure'];
const ANTIHISTAMINE = ['antihistamine'];

const DRUGS: DrugEntry[] = [
  { names: ['folic acid', 'folate', 'methylfolate', 'l-methylfolate', 'vitamin b9'], accept: ['folic', 'folate', 'methylfolate'] },
  { names: ['iron', 'ferrous sulfate', 'ferrous fumarate', 'ferric carboxymaltose', 'iron sucrose'], accept: ['iron', 'ferrous', 'ferric', 'ferritin'] },
  { names: ['vitamin d', 'vitamin d3', 'cholecalciferol', 'ergocalciferol', 'calcifediol'], accept: ['vitamin d', 'cholecalciferol', 'ergocalciferol', 'calcifediol', '25-hydroxyvitamin d', '25(oh)d', '25ohd'] },
  { names: ['calcium'] },
  { names: ['vitamin b12', 'cobalamin', 'cyanocobalamin'], accept: ['b12', 'cobalamin'] },
  { names: ['vitamin b6', 'pyridoxine'] },
  { names: ['omega-3', 'fish oil', 'docosahexaenoic'], accept: ['omega-3', 'omega 3', 'fish oil', 'dha', 'docosahexaenoic', 'n-3'] },
  { names: ['iodine'] },
  { names: ['magnesium'] },
  { names: ['caffeine'], accept: ['caffeine', 'coffee'] },
  { names: ['inositol', 'myo-inositol'] },
  { names: ['melatonin'] },
  { names: ['cranberry'] },
  { names: ['d-mannose'], accept: ['mannose'] },
  { names: ['probiotic', 'probiotics'], accept: ['probiotic', 'lactobacill'] },
  { names: ['metformin'] },
  { names: ['letrozole'], accept: ['letrozole', 'aromatase inhibitor'] },
  { names: ['anastrozole'], accept: ['anastrozole', 'aromatase inhibitor'] },
  { names: ['clomifene', 'clomiphene', 'clomid'], accept: ['clomifene', 'clomiphene', 'clomid'] },
  { names: ['tamoxifen'] },
  { names: ['cabergoline'] },
  { names: ['bromocriptine'] },
  { names: ['levothyroxine', 'thyroxine'], accept: ['levothyroxine', 'thyroxine', 'thyroid hormone'] },
  { names: ['aspirin', 'acetylsalicylic acid'], accept: ['aspirin', 'acetylsalicylic'] },
  { names: ['paracetamol', 'acetaminophen'] },
  { names: ['ibuprofen'], accept: NSAID },
  { names: ['naproxen'], accept: NSAID },
  { names: ['mefenamic acid'], accept: ['mefenamic', ...NSAID] },
  { names: ['diclofenac'], accept: NSAID },
  { names: ['celecoxib'], accept: NSAID },
  { names: ['tranexamic acid'], accept: ['tranexamic'] },
  { names: ['paroxetine'], accept: SSRI },
  { names: ['fluoxetine'], accept: SSRI },
  { names: ['sertraline'], accept: SSRI },
  { names: ['citalopram'], accept: SSRI },
  { names: ['escitalopram'], accept: SSRI },
  { names: ['venlafaxine'], accept: SNRI },
  { names: ['desvenlafaxine'], accept: SNRI },
  { names: ['duloxetine'], accept: SNRI },
  { names: ['gabapentin'], accept: ['gabapentin', 'gabapentinoid'] },
  { names: ['pregabalin'], accept: ['pregabalin', 'gabapentinoid'] },
  { names: ['clonidine'] },
  { names: ['oxybutynin'] },
  { names: ['fezolinetant'], accept: ['fezolinetant', 'neurokinin', 'nk3'] },
  { names: ['elinzanetant'], accept: ['elinzanetant', 'neurokinin', 'nk3'] },
  { names: ['estradiol'], accept: [...ESTROGENS, ...HORMONAL] },
  { names: ['estrogen', 'estrogens'], accept: [...ESTROGENS, ...HORMONAL] },
  { names: ['ethinylestradiol', 'ethinyl estradiol'], accept: ['ethinylestradiol', 'ethinyl estradiol', 'combined oral', 'combined pill', 'estrogen'] },
  { names: ['progesterone', 'utrogestan'], accept: ['progesterone', 'progestogen', 'progestin', 'progestagen', 'utrogestan'] },
  { names: ['progestogen', 'progestogens', 'progestin', 'progestins', 'progestagen'], accept: [...PROGESTOGENS, ...HORMONAL] },
  { names: ['levonorgestrel'], accept: ['levonorgestrel', 'lng', 'hormonal iud', 'hormonal coil', 'hormonal intrauterine', 'mirena'] },
  { names: ['ulipristal'], accept: ['ulipristal', 'ellaone'] },
  { names: ['desogestrel'] },
  { names: ['drospirenone'] },
  { names: ['dienogest'] },
  { names: ['dydrogesterone'] },
  { names: ['norethisterone', 'norethindrone'], accept: ['norethisterone', 'norethindrone'] },
  { names: ['medroxyprogesterone', 'depo-provera', 'dmpa'], accept: ['medroxyprogesterone', 'depo-provera', 'dmpa', 'injectable'] },
  { names: ['etonogestrel'], accept: ['etonogestrel', 'implant'] },
  { names: ['testosterone'] },
  { names: ['tibolone'] },
  { names: ['dhea', 'prasterone'], accept: ['dhea', 'prasterone', 'dehydroepiandrosterone'] },
  { names: ['ospemifene'] },
  { names: ['mifepristone'] },
  { names: ['misoprostol'] },
  { names: ['oxytocin'] },
  { names: ['carbetocin'] },
  { names: ['alendronate', 'alendronic acid'], accept: ['alendron', ...BISPHOS] },
  { names: ['risedronate'], accept: ['risedron', ...BISPHOS] },
  { names: ['zoledronic acid', 'zoledronate'], accept: ['zoledron', ...BISPHOS] },
  { names: ['ibandronate'], accept: ['ibandron', ...BISPHOS] },
  { names: ['raloxifene'] },
  { names: ['teriparatide'] },
  { names: ['nitrofurantoin'] },
  { names: ['trimethoprim'] },
  { names: ['metronidazole'] },
  { names: ['clindamycin'] },
  { names: ['amoxicillin'] },
  { names: ['doxycycline'] },
  { names: ['azithromycin'] },
  { names: ['fluconazole'] },
  { names: ['clotrimazole'] },
  { names: ['methyldopa'] },
  { names: ['labetalol'] },
  { names: ['nifedipine'] },
  { names: ['heparin', 'enoxaparin', 'dalteparin', 'tinzaparin', 'low molecular weight heparin'], accept: ['heparin', 'enoxaparin', 'dalteparin', 'tinzaparin', 'lmwh'] },
  { names: ['insulin'] },
  { names: ['ondansetron'] },
  { names: ['doxylamine'] },
  { names: ['metoclopramide'] },
  { names: ['prochlorperazine'] },
  { names: ['domperidone'] },
  { names: ['leuprorelin', 'leuprolide'], accept: ['leuprorelin', 'leuprolide', ...GNRH] },
  { names: ['triptorelin'], accept: ['triptorelin', ...GNRH] },
  { names: ['goserelin'], accept: ['goserelin', ...GNRH] },
  { names: ['elagolix'], accept: ['elagolix', ...GNRH] },
  { names: ['relugolix'], accept: ['relugolix', ...GNRH] },
  { names: ['lidocaine', 'lignocaine'], accept: ['lidocaine', 'lignocaine'] },
  // Added after the dose/safety audit (Nov 2026): medicines patients ask
  // about in pregnancy and breastfeeding that the list did not spot.
  { names: ['hrt'], accept: ['hrt', 'hormone therapy', ...ESTROGENS, ...PROGESTOGENS] },
  { names: ['codeine', 'dihydrocodeine'], accept: ['codeine', ...OPIOID] },
  { names: ['tramadol'], accept: ['tramadol', ...OPIOID] },
  { names: ['morphine'], accept: ['morphine', ...OPIOID] },
  { names: ['oxycodone'], accept: ['oxycodone', ...OPIOID] },
  { names: ['valproate', 'valproic acid', 'sodium valproate'], accept: ['valpro', ...ANTIEPILEPTIC] },
  { names: ['lamotrigine'], accept: ['lamotrigine', ...ANTIEPILEPTIC] },
  { names: ['levetiracetam'], accept: ['levetiracetam', ...ANTIEPILEPTIC] },
  { names: ['carbamazepine'], accept: ['carbamazepine', ...ANTIEPILEPTIC] },
  { names: ['topiramate'], accept: ['topiramate', ...ANTIEPILEPTIC] },
  { names: ['lithium'] },
  { names: ['isotretinoin'], accept: ['isotretinoin', 'retinoid'] },
  { names: ['warfarin'], accept: ['warfarin', 'vitamin k antagonist', 'anticoagula'] },
  { names: ['methotrexate'] },
  { names: ['hydroxychloroquine'] },
  { names: ['cetirizine'], accept: ['cetirizine', ...ANTIHISTAMINE] },
  { names: ['loratadine'], accept: ['loratadine', ...ANTIHISTAMINE] },
  { names: ['chlorphenamine', 'chlorpheniramine'], accept: ['chlorphenamine', 'chlorpheniramine', ...ANTIHISTAMINE] },
  { names: ['famotidine'], accept: ['famotidine', 'h2 blocker', 'h2-receptor', 'h2 receptor'] },
  { names: ['cefalexin', 'cephalexin'], accept: ['cefalexin', 'cephalexin', 'cephalosporin'] },
];

/** Generic drug-name endings for medicines not in the list above. */
const DRUG_SUFFIX = /^[a-z]{3,}(?:pril|olol|azole|mab|statin|oxetine|sartan|dipine|floxacin|cycline|cillin|mycin|ciclovir|cyclovir|triptan|dronate|gliptin|glutide|parin|semide|thiazide|azepam|afil|relin|relix|gestrel|profen|coxib|fenac|tropin|trophin|olone|asone|isone|tinib|lukast)$/;

interface DrugMention { label: string; accept: string[] }

const DRUG_PATTERNS = DRUGS.map((d) => ({
  label: d.names[0],
  accept: [...d.names, ...(d.accept ?? [])],
  re: new RegExp(`(?<![a-z0-9-])(?:${d.names.map((n) => escapeRe(n).replace(/ /g, '[\\s-]+')).join('|')})(?![a-z0-9])`, 'i'),
}));

function drugMentions(normText: string): DrugMention[] {
  const found: DrugMention[] = [];
  for (const p of DRUG_PATTERNS) {
    const m = p.re.exec(normText);
    if (!m) continue;
    // "iron deficiency" / "low iron" is the condition, not the supplement.
    if (p.label === 'iron' && /^iron[\s-]+(?:deficien|stores|levels?|status|overload)/.test(normText.slice(m.index))) continue;
    found.push({ label: p.label, accept: p.accept });
  }
  const known = new Set(DRUGS.flatMap((d) => d.names));
  for (const w of normText.match(/[a-z]{6,}/g) ?? []) {
    if (known.has(w) || !DRUG_SUFFIX.test(w)) continue;
    if (found.some((f) => f.label === w)) continue;
    found.push({ label: w, accept: [w] });
  }
  return found;
}

function sourceMentions(normSource: string, accept: string[]): boolean {
  return accept.some((a) => new RegExp(`(?<![a-z0-9])${escapeRe(a).replace(/ /g, '[\\s-]+')}`, 'i').test(normSource));
}

// ── Numbers with units ────────────────────────────────────────────────

type Family = 'mass' | 'volume' | 'time' | 'percent' | 'iu' | 'units' | 'cups' | 'kcal' | 'length' | 'kg' | `conc:${string}`;
interface UnitDef { re: string; family: Family; factor: number }

// Longest first: "µg/L" must win over "µg", "mmol/L" over "mmol".
const UNITS: UnitDef[] = [
  { re: '(?:ng|nanograms?)\\s*\\/\\s*ml', family: 'conc:ngml', factor: 1 },
  { re: '(?:µg|mcg|ug|micrograms?)\\s*\\/\\s*l(?![a-z])', family: 'conc:ngml', factor: 1 },
  { re: 'nmol\\s*\\/\\s*l', family: 'conc:nmol', factor: 1 },
  { re: 'pmol\\s*\\/\\s*l', family: 'conc:pmol', factor: 1 },
  { re: 'mmol\\s*\\/\\s*l', family: 'conc:mmol', factor: 1 },
  { re: '(?:miu|mu)\\s*\\/\\s*l', family: 'conc:miul', factor: 1 },
  { re: '(?:µiu|uiu)\\s*\\/\\s*ml', family: 'conc:miul', factor: 1 },
  { re: '(?:miu\\s*\\/\\s*ml|iu\\s*\\/\\s*l)', family: 'conc:iul', factor: 1 },
  { re: 'mg\\s*\\/\\s*dl', family: 'conc:mgdl', factor: 1 },
  { re: 'g\\s*\\/\\s*dl', family: 'conc:gdl', factor: 1 },
  { re: 'g\\s*\\/\\s*l(?![a-z])', family: 'conc:gl', factor: 1 },
  { re: 'mm\\s*hg', family: 'conc:mmhg', factor: 1 },
  { re: '(?:µg|mcg|ug|micrograms?)', family: 'mass', factor: 1 },
  { re: '(?:mg|milligrams?)', family: 'mass', factor: 1e3 },
  { re: '(?:kg|kilograms?)', family: 'kg', factor: 1 },
  { re: '(?:g|grams?)', family: 'mass', factor: 1e6 },
  { re: '(?:ml|millilit(?:re|er)s?)', family: 'volume', factor: 1 },
  { re: 'dl', family: 'volume', factor: 100 },
  { re: '(?:l|lit(?:re|er)s?)', family: 'volume', factor: 1e3 },
  { re: '(?:%|percent|per cent)', family: 'percent', factor: 1 },
  { re: '(?:iu|international units?)', family: 'iu', factor: 1 },
  { re: 'units?', family: 'units', factor: 1 },
  { re: '(?:minutes?|mins?)', family: 'time', factor: 1 / 1440 },
  { re: '(?:hours?|hrs?|h)', family: 'time', factor: 1 / 24 },
  { re: 'days?', family: 'time', factor: 1 },
  { re: '(?:weeks?|wks?)', family: 'time', factor: 7 },
  { re: 'months?', family: 'time', factor: 30.44 },
  { re: '(?:years?|yrs?)', family: 'time', factor: 365.25 },
  { re: 'cups?', family: 'cups', factor: 1 },
  { re: 'kcal', family: 'kcal', factor: 1 },
  { re: '(?:cm|mm)', family: 'length', factor: 1 },
];
const UNIT_ALT = UNITS.map((u) => `(${u.re})`).join('|');
const NUM = '(?<![a-z\\d.])(\\d+(?:\\.\\d+)?)';
// "10–15 mg", "10 to 15 mg", "between 10 and 15 mg", or a single "400 µg".
// A trailing "-old" ("6-week-old") or letters ("2 hrsx") are not units.
const QUANTITY_RE = new RegExp(`${NUM}(?:\\s*(?:-|–|—|to|and)\\s*${NUM})?\\s*-?\\s*(?:${UNIT_ALT})(?![a-z0-9µ])`, 'gi');

interface Quantity { value: number; family: Family; base: number; raw: string; index: number; end: number }

function unitOf(groups: (string | undefined)[]): UnitDef | null {
  for (let i = 0; i < UNITS.length; i++) if (groups[i]) return UNITS[i];
  return null;
}

function quantities(normText: string): Quantity[] {
  const out: Quantity[] = [];
  // "160/110 mmHg": the regex below only sees the 110; add the systolic.
  for (const m of normText.matchAll(/(?<![\d.])(\d{2,3})\s*\/\s*(\d{2,3})\s*mm\s*hg/g)) {
    const value = Number(m[1]);
    out.push({ value, family: 'conc:mmhg', base: value, raw: m[0].trim(), index: m.index!, end: m.index! + m[0].length });
  }
  for (const m of normText.matchAll(QUANTITY_RE)) {
    const unit = unitOf(m.slice(3));
    if (!unit) continue;
    for (const v of [m[1], m[2]]) {
      if (v === undefined) continue;
      const value = Number(v);
      out.push({ value, family: unit.family, base: value * unit.factor, raw: m[0].trim(), index: m.index!, end: m.index! + m[0].length });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

/** Extra values a source states without a unit we parse: "1 in 100" = 1 %, "RR 0.70" = 30 %. */
function sourcePercents(normSource: string): number[] {
  const out: number[] = [];
  for (const m of normSource.matchAll(/(\d+(?:\.\d+)?)\s+in\s+(\d+(?:\.\d+)?)/g)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (b > 0 && a <= b) out.push((100 * a) / b);
  }
  for (const m of normSource.matchAll(/(?<![\d.])(\d\.\d{1,3})(?![\d.])/g)) {
    const r = Number(m[1]);
    if (r > 0 && r < 3) out.push(Math.abs(1 - r) * 100);
  }
  return out;
}

const APPROX_BEFORE = /(?:about|around|approximately|approx\.?|roughly|nearly|almost|~|≈|up to|over|more than|less than|under|at least|at most|below|above)\s*$/;

function sameValue(a: number, s: number, approx: boolean): boolean {
  if (Math.abs(a - s) < 1e-9) return true;
  // Rounded to the answer's precision: source 29.6 % -> "30 %", 7.25 -> "7.3".
  const decimals = (String(a).split('.')[1] ?? '').length;
  if (Number(s.toFixed(decimals)) === a) return true;
  return approx && s !== 0 && Math.abs(a - s) / Math.abs(s) <= 0.1;
}

/** "600 units" of vitamin D and "600 IU" are the same quantity. */
const sameFamily = (a: Family, b: Family) => a === b || (a === 'iu' && b === 'units') || (a === 'units' && b === 'iu');

function quantitySupported(q: Quantity, approx: boolean, src: Quantity[], extraPercents: number[]): boolean {
  for (const s of src) {
    if (!sameFamily(s.family, q.family)) continue;
    if (sameValue(q.value, s.value, approx)) return true;
    // Different unit of the same kind: 0.4 mg = 400 µg, 72 hours = 3 days,
    // 3 months ~ 12 weeks.
    if (q.base !== q.value || s.base !== s.value) {
      const tol = q.family === 'time' ? 0.1 : 0.001;
      if (s.base !== 0 && Math.abs(q.base - s.base) / Math.abs(s.base) <= tol) return true;
    }
  }
  if (q.family === 'percent') return extraPercents.some((p) => sameValue(q.value, p, true) || Math.abs(q.value - p) < 0.6);
  return false;
}

/** "400 µg (0.4 mg)", "72 hours (3 days)", "50 nmol/L (20 ng/mL)". */
function isConversion(a: Quantity, b: Quantity): boolean {
  if (!sameFamily(a.family, b.family)) return true; // different kinds: not judged
  const tol = a.family === 'time' ? 0.1 : 0.02;
  return a.base !== 0 && Math.abs(a.base - b.base) / Math.abs(a.base) <= tol;
}

/** Words that make a "your ..." stretch advice rather than the patient's own figure. */
const YOUR_ADVICE = /\b(?:dose|doses|dosage|doctor|midwife|gp|pharmacist|nurse|team|take|taking|need|needs|should|can|could|may|might|must|increase|increased|raise|lower|reduce|limit|maximum|max|intake|up to|start|stop|use|first|but|above|below|over|under|more than|less than|at least|reach\w*|exceed\w*)\b/;

// ── Direction ─────────────────────────────────────────────────────────

const UP = /\b(?:increas\w*|rais(?:e|es|ed|ing)|higher|greater|elevat\w*|doubl\w*|tripl\w*|ris(?:e|es|ing)|rose|more likely|worsen\w*|times (?:the|as|higher|greater|more)|\d+[- ]?fold)\b/g;
const DOWN = /\b(?:decreas\w*|reduc\w*|lower(?:s|ed|ing)?|less likely|fewer|declin\w*|drop\w*|cuts?|halv\w*|diminish\w*|prevent\w*|eliminat\w*|lessen\w*|minimi[sz]\w*)\b/g;
const NEGATION = /\b(?:not|no|never|neither|nor|without|unlikely|cannot|n't|did not|does not|do not|unclear|uncertain|similar|comparable|no difference)\b|n't\b/;
const COMPARATIVE = /\b(?:than|compared|versus|vs|relative to)\b/;
// "... compared with women who did not use it", "than non-users": the
// "not" names the comparison group, it does not negate the finding.
const COMPARATOR_NEG = /\b(?:compared (?:with|to)|than|versus|vs)\s+(?:[a-z]+\s+){0,3}?(?:not|no|non-?)\s*[a-z]+(?:\s+(?:it|them|any|one))?/g;
// "did not raise", "was not linked to an increased", "no increase": the
// source denies that effect. Usable against a claim that asserts it.
const DENIED = new RegExp(`\\b(?:not|no|never|without)\\s+(?:[a-z]+\\s+){0,3}?(?:${UP.source.slice(5, -3)}|${DOWN.source.slice(5, -3)})\\b`);
// "Poor sleep -> more depression" and "better sleep -> less depression" agree:
// a quality word flips the meaning, so such clauses are not compared.
const POLARITY = /\b(?:poor|bad|worse|good|better|best|lack|insufficient|inadequate|adequate|untreated|treated|low|high|short|long)\b/;
const CLAUSE_SPLIT = /[,;:]|\b(?:but|while|whereas|although|though|however|yet|and also)\b/;

const STOP = new Set(('a an the of in on at to for from by with and or as is are was were be been being it its this that these those there their they them '
  + 'you your i we our he she her his which who whom what when where why how than then so such also may might can could would should will shall '
  + 'do does did has have had not no very more most less least much many some any all each both other another own same just only about over under '
  + 'up down out into onto per pre post non vs via than if but while whereas although though however yet '
  + 'risk risks rate rates level levels chance chances odds likelihood women woman patient patients people person adults evidence study studies '
  + 'trial trials review reviews effect effects outcome outcomes use used using compared group groups significantly significant slightly overall '
  + 'likely somewhat modest small large number numbers result results showed show shows found find linked link associated association '
  + 'help helps helped treatment treatments taking take takes approach strategy option options common commonly cause causes caused '
  + 'other include includes including such well known').split(/\s+/));

function stem(w: string): string {
  if (w.length <= 4) return w;
  return w.replace(/ies$/, 'y').replace(/(?:ing|ed|es|s|e)$/, '');
}

const DIRECTION_WORDS = new RegExp(`${UP.source}|${DOWN.source}`, 'g');

interface DirClause {
  dir: 'up' | 'down';
  before: Set<string>;
  after: Set<string>;
  terms: Set<string>;
  comparative: boolean;
  /** The clause denies the effect ("did not raise"): only ever used on the source side. */
  denied?: boolean;
}

function directionClauses(normText: string): DirClause[] {
  const out: DirClause[] = [];
  for (const raw of normText.replace(/[()[\]]/g, ' ').split(/(?<=[.!?])\s+|\n/).flatMap((s) => s.split(CLAUSE_SPLIT))) {
    const clause = raw.replace(COMPARATOR_NEG, (m) => m.replace(/\b(?:not|no)\b/g, ' '));
    const ups = clause.match(UP)?.length ?? 0;
    const downs = clause.match(DOWN)?.length ?? 0;
    if ((ups > 0) === (downs > 0)) continue; // none, or both ways: not judged
    if (POLARITY.test(clause)) continue;
    let denied = false;
    if (NEGATION.test(clause)) {
      // One plain denial ("X was not linked to an increased Y") is kept,
      // marked; anything vaguer (unclear, similar, "not only") is skipped.
      const rest = clause.replace(DENIED, ' ');
      if (!DENIED.test(clause) || /\bnot only\b/.test(clause) || NEGATION.test(rest)) continue;
      denied = true;
    }
    DIRECTION_WORDS.lastIndex = 0;
    const at = DIRECTION_WORDS.exec(clause)?.index ?? 0;
    const words = (s: string) => new Set(
      (s.replace(DIRECTION_WORDS, ' ').match(/[a-z][a-z0-9]+/g) ?? [])
        .filter((w) => w.length > 2 && !STOP.has(w))
        .map(stem),
    );
    out.push({ dir: ups ? 'up' : 'down', before: words(clause.slice(0, at)), after: words(clause.slice(at)), terms: words(clause), comparative: COMPARATIVE.test(clause), ...(denied ? { denied } : {}) });
  }
  return out;
}

/** Specific words of a claim (stemmed), for "which source covers what". */
function contentTerms(normText: string): string[] {
  const drugNames = new Set(DRUGS.flatMap((d) => d.names.flatMap((n) => n.split(' '))));
  return [...new Set((normText.match(/[a-z][a-z0-9]{4,}/g) ?? []).filter((w) => !STOP.has(w) && !drugNames.has(w) && !DRUG_SUFFIX.test(w)).map(stem))];
}
const hasTerm = (normSource: string, term: string) => new RegExp(`(?<![a-z])${escapeRe(term)}`).test(normSource);

const overlap = (a: Set<string>, b: Set<string>) => [...a].filter((x) => b.has(x));

/** A clause of the claim that the source clearly contradicts, as "up:term,term". */
function contradiction(claim: DirClause[], source: DirClause[]): string | null {
  for (const c of claim) {
    if (c.denied) continue;
    for (const s of source) {
      // Opposite: the other direction, or the same direction denied.
      if (s.denied ? s.dir !== c.dir : s.dir === c.dir) continue;
      const shared = overlap(c.terms, s.terms);
      if (shared.length < 2) continue;
      // Both what acts and what changes must match: "PGT-A with single-embryo
      // transfer lowers twins" is not contradicted by "single-embryo transfer
      // gave higher birth rates".
      if (!shared.some((t) => c.before.has(t)) || !shared.some((t) => c.after.has(t))) continue;
      // "X lower than Y" vs "Y higher than X" say the same thing: with a
      // comparison, the subjects (words before the verb) must match too.
      if ((c.comparative || s.comparative) && overlap(c.before, s.before).length === 0) continue;
      // The source also says it the claim's way somewhere: not a clear opposite.
      // Against a denial, the agreeing clause must carry every shared term
      // ("oral estrogen raised clot risk" does not undo "transdermal
      // estrogen was not linked to an increased clot risk").
      const agrees = source.some((o) => !o.denied && o.dir === c.dir && (s.denied
        ? shared.every((t) => o.terms.has(t))
        : overlap(c.terms, o.terms).filter((t) => shared.includes(t)).length >= 2));
      if (agrees) continue;
      return `${s.denied ? 'not-' : ''}${c.dir}:${shared.slice(0, 3).join(',')}`;
    }
  }
  return null;
}

// ── Safety ────────────────────────────────────────────────────────────

const SAFE = /\b(?:safe|safely|compatible|suitable|fine|okay|ok|no problem|can (?:be )?(?:taken?|used?|given|continued?))\b/;
// "Avoid" only as advice ("should be avoided", "avoid taking"), not as the
// thing studied ("the benefit of avoiding caffeine").
const UNSAFE = /(?:^\s*avoid\b|\b(?:contraindicat\w*|(?:should|must|best|to) (?:be )?avoid(?:ed)?|be avoided|avoid (?:using|taking|it|them)|not (?:be )?recommended|should not be (?:used|taken|given)|must not|do not (?:use|take)|unsafe|not safe)\b)/;
// "There is no need to avoid ...", "not contraindicated": not a warning.
const UNSAFE_LIFTED = /\b(?:no need|not need|need not|needn't|unnecessary|not necessary|not contraindicat\w*|not be avoided|without avoiding)\b/;

const clausesOf = (normText: string) =>
  normText.split(/(?<=[.!?])\s+|\n/).flatMap((x) => x.split(/[;:]|\b(?:but|while|whereas|although|though|however|yet)\b/));

/**
 * A medicine the claim calls safe / usable that the source only warns
 * against: the source names it in a contraindicated / avoid / not
 * recommended clause and never in a clause calling it safe.
 */
function safetyConflict(normClaim: string, normSource: string): string | null {
  const safeClaims = clausesOf(normClaim).filter((c) => SAFE.test(c) && !NEGATION.test(c) && !UNSAFE.test(c));
  if (!safeClaims.length) return null;
  const srcClauses = clausesOf(normSource);
  for (const c of safeClaims) {
    for (const d of drugMentions(c)) {
      const names = srcClauses.filter((x) => sourceMentions(x, d.accept));
      const warns = names.some((x) => UNSAFE.test(x) && !UNSAFE_LIFTED.test(x));
      const reassures = names.some((x) => SAFE.test(x) && !UNSAFE.test(x) && !NEGATION.test(x));
      if (warns && !reassures) return `unsafe:${d.label}`;
    }
  }
  return null;
}

// ── Claims ────────────────────────────────────────────────────────────

// One or more adjacent markers: "[1]", "[1][3]", " [1, 3]". Not "[1](url)".
const GROUP_RE = /(?:[ \t]*\[\d{1,2}(?:\s*,\s*\d{1,2})*\](?!\())+/g;

/** Index where the sentence holding position `at` starts. */
function sentenceStart(text: string, at: number): number {
  // "... the risk. [1]": the marker belongs to the sentence before the stop.
  let end = at;
  while (end > 0 && /[\s.!?]/.test(text[end - 1]) && text[end - 1] !== '\n') end--;
  for (let i = end - 1; i > 0; i--) {
    if (text[i] === '\n') return i + 1;
    if (/[.!?]/.test(text[i - 1]) && /\s/.test(text[i]) && !/(?:e\.g|i\.e|vs|approx|dr|etc)\.$/i.test(text.slice(Math.max(0, i - 7), i))) return i;
  }
  return 0;
}

// ── The check ─────────────────────────────────────────────────────────

/**
 * Removes [n] markers whose cited text does not hold up against source n
 * (see the header). `sources` maps each n to the text the model saw.
 */
export function checkCitations(answer: string, sources: ReadonlyMap<number, string>, opts: CitationCheckOptions = {}): CitationCheckResult {
  const removed: RemovedCitation[] = [];
  const norm = new Map<number, { text: string; qty: Quantity[]; pct: number[]; dirs: DirClause[] }>();
  const src = (n: number) => {
    let s = norm.get(n);
    if (!s) {
      const text = normalise(sources.get(n) ?? '');
      s = { text, qty: quantities(text), pct: sourcePercents(text), dirs: directionClauses(text) };
      norm.set(n, s);
    }
    return s;
  };
  const exemptNorm = normalise(opts.exemptText ?? '');
  const exemptQty = quantities(exemptNorm);

  const groups = [...answer.matchAll(GROUP_RE)];
  const edits: { start: number; end: number; replacement: string }[] = [];
  let prevEnd = 0;
  for (const g of groups) {
    const start = g.index!;
    const end = start + g[0].length;
    const sStart = sentenceStart(answer, start);
    // The words this group cites: from the previous marker in the same
    // sentence (or the sentence start) up to this marker.
    let claimStart = Math.max(sStart, prevEnd);
    if ((answer.slice(claimStart, start).match(/[a-z]{3,}/gi)?.length ?? 0) < 3) claimStart = sStart;
    prevEnd = end;
    const claimRaw = answer.slice(claimStart, start);
    const claim = normalise(claimRaw.replace(/\*\*/g, ''));
    const nums = [...new Set([...g[0].matchAll(/\d{1,2}/g)].map((m) => Number(m[0])))].filter((n) => sources.has(n));
    if (nums.length === 0) continue;

    const drop = new Map<number, RemovedCitation>();

    // 1. Medicines: each cited source must name at least one of them.
    const drugs = drugMentions(claim);
    if (drugs.length) {
      for (const n of nums) {
        if (drugs.some((d) => sourceMentions(src(n).text, d.accept))) continue;
        // "Melatonin, DHEA and acupuncture ... [3][5][6]": a source that is
        // the only one in the group to name another part of the claim
        // (acupuncture) is citing that part, not the medicines.
        const others = nums.filter((m) => m !== n);
        if (others.length && contentTerms(claim).some((t) => hasTerm(src(n).text, t) && !others.some((m) => hasTerm(src(m).text, t)))) continue;
        drop.set(n, { n, issue: 'drug', token: drugs[0].label });
      }
    }

    // 2. Numbers with units: each must be in at least one cited source.
    const qty = quantities(claim);
    for (let i = 0; i < qty.length; i++) {
      const q = qty[i];
      const before = claim.slice(0, q.index);
      // "50 nmol/L (20 ng/mL)": the bracketed conversion is the model's own.
      // In the same kind of unit it must really be equal: "400 µg (4 mg)"
      // is a wrong dose and is checked like any other number.
      if (i > 0 && qty[i - 1].end <= q.index && /^\s*\(\s*(?:about|approximately|around|~|≈|or)?\s*$/.test(claim.slice(qty[i - 1].end, q.index))
        && isConversion(qty[i - 1], q)) continue;
      // The patient's own figures (records, question), not the source's:
      // "your AMH of 1.2 ng/mL". Not advice or thresholds: "increase your
      // dose by 50%", "ask your doctor, but you can take 4 g", "if your
      // blood pressure is 160/110 mmHg".
      const yours = /\byour\b([^.]{0,40})$/.exec(before);
      if (yours && !YOUR_ADVICE.test(yours[0]) && !/\b(?:if|when|once|until|unless)\s+$/.test(before.slice(0, yours.index))) continue;
      if (exemptQty.some((e) => e.family === q.family && sameValue(q.value, e.value, false))) continue;
      const approx = APPROX_BEFORE.test(before);
      if (!nums.some((n) => quantitySupported(q, approx, src(n).qty, src(n).pct))) {
        for (const n of nums) if (!drop.has(n)) drop.set(n, { n, issue: 'number', token: q.raw });
      }
    }

    // 3. Direction: the source must not clearly say the opposite.
    const claimDirs = directionClauses(claim);
    if (claimDirs.length) {
      for (const n of nums) {
        if (drop.has(n)) continue;
        const c = contradiction(claimDirs, src(n).dirs);
        if (c) drop.set(n, { n, issue: 'direction', token: c });
      }
    }

    // 4. Safety: "X is safe" must not cite a source that only says avoid X.
    for (const n of nums) {
      if (drop.has(n)) continue;
      const c = safetyConflict(claim, src(n).text);
      if (c) drop.set(n, { n, issue: 'safety', token: c });
    }

    if (drop.size === 0) continue;
    removed.push(...drop.values());
    const keep = nums.filter((n) => !drop.has(n));
    const invalid = [...g[0].matchAll(/\d{1,2}/g)].map((m) => Number(m[0])).filter((n) => !sources.has(n) && !drop.has(n));
    const kept = [...keep, ...invalid];
    const lead = g[0].match(/^[ \t]*/)![0];
    edits.push({ start, end, replacement: kept.length ? `${lead}${kept.map((n) => `[${n}]`).join('')}` : '' });
  }

  let text = answer;
  for (const e of edits.reverse()) text = text.slice(0, e.start) + e.replacement + text.slice(e.end);
  return { text, removed };
}
