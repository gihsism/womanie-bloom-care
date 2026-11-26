// Question-aware personal context for the AI chat ("personal RAG").
//
// Before: the chat stuffed her latest 20 document summaries and latest
// 100 extracted values into every prompt, whatever she asked. "How has my
// ferritin changed since 2022?" lost the older ferritin values once she
// had more than 100 rows, and "how can I sleep better?" paid for 100
// irrelevant lab lines.
//
// Now the handler loads her rows (paged, capped, user_id only) and this
// module picks, deterministically:
//   1. the FULL dated history of every analyte the question names
//      (synonym table: abbreviations, UK/US spelling, German, Russian);
//   2. the documents whose name, summary or category match the question;
//   3. recent abnormal values, always;
//   4. a compact baseline (latest value of the most recently measured tests);
// plus a short always-on summary (what is on file, conditions, allergies,
// medicines). Everything is fitted to a token budget, in that priority.
//
// No model call and no external service: plain keyword + synonym matching,
// so the same question over the same rows always yields the same block.
// (The research embedder in ./research/embed.ts was considered for a
// cosine score, but it is an English-only model costing ~tens of ms per
// string; embedding hundreds of row titles per turn is not "cheap", and
// the synonym table already covers the multilingual analyte names.)

import { normalizeTestTitle } from './normalize-test-title.js';
import { numberStylesByDocument, parseLabValue, type NumberStyle } from './lab-value.js';
import type { RecordCandidate } from './record-citations.js';

export type Row = Record<string, unknown>;

export interface LabRow {
  /** Row id, for the "From your records" chips (never shown to the model). */
  id?: unknown;
  data_type?: unknown;
  title?: unknown;
  value?: unknown;
  unit?: unknown;
  reference_range?: unknown;
  status?: unknown;
  date_recorded?: unknown;
  notes?: unknown;
  document_id?: unknown;
  raw_data?: unknown;
}

export interface DocRow {
  id?: unknown;
  file_name?: unknown;
  ai_suggested_name?: unknown;
  ai_summary?: unknown;
  ai_suggested_category?: unknown;
  document_type?: unknown;
  uploaded_at?: unknown;
}

// ---------------------------------------------------------------- queries
// Always parameterised, always scoped to the authenticated user ($1).
// Paged so a long history is read in full up to a hard cap.
export const PERSONAL_LAB_PAGE = 500;
export const PERSONAL_LAB_CAP = 3000;
export const PERSONAL_DOC_CAP = 200;

export const PERSONAL_LAB_SQL =
  `SELECT id, data_type, title, value, unit, reference_range, status, date_recorded, notes, document_id, raw_data
     FROM medical_extracted_data
    WHERE user_id = $1
    ORDER BY date_recorded DESC NULLS LAST, id DESC
    LIMIT $2 OFFSET $3`;

export const PERSONAL_DOC_SQL =
  `SELECT id, file_name, ai_suggested_name, ai_summary, ai_suggested_category, document_type, uploaded_at
     FROM health_documents
    WHERE user_id = $1
    ORDER BY uploaded_at DESC
    LIMIT $2`;

type QueryFn = (sql: string, params: unknown[]) => Promise<unknown>;

/** Load her rows: extracted values page by page (capped), documents capped. */
export async function fetchPersonalRows(
  sql: { query: QueryFn },
  userId: string,
  opts: { pageSize?: number; labCap?: number; docCap?: number } = {},
): Promise<{ labs: LabRow[]; docs: DocRow[] }> {
  const pageSize = opts.pageSize ?? PERSONAL_LAB_PAGE;
  const labCap = opts.labCap ?? PERSONAL_LAB_CAP;
  const docCap = opts.docCap ?? PERSONAL_DOC_CAP;
  const loadLabs = async () => {
    const labs: LabRow[] = [];
    for (let offset = 0; offset < labCap; offset += pageSize) {
      const limit = Math.min(pageSize, labCap - offset);
      const page = (await sql.query(PERSONAL_LAB_SQL, [userId, limit, offset])) as LabRow[];
      labs.push(...page);
      if (page.length < limit) break;
    }
    return labs;
  };
  const [labs, docs] = await Promise.all([
    loadLabs(),
    sql.query(PERSONAL_DOC_SQL, [userId, docCap]) as Promise<DocRow[]>,
  ]);
  return { labs, docs };
}

// ---------------------------------------------------------------- synonyms
// Canonical title (as normalizeTestTitle stores it) -> words a patient may
// type. Terms are matched on word boundaries, case-insensitively.
export const ANALYTE_SYNONYMS: Record<string, string[]> = {
  Ferritin: ['ferritin', 'ferritine', 'ферритин', 'iron stores', 'eisenspeicher'],
  Iron: ['iron', 'serum iron', 'eisen', 'железо', 'fe'],
  Transferrin: ['transferrin', 'трансферрин'],
  'Transferrin Saturation': ['transferrin saturation', 'tsat', 'transferrinsättigung'],
  TIBC: ['tibc', 'iron binding'],
  Hemoglobin: ['hemoglobin', 'haemoglobin', 'hb', 'hgb', 'hämoglobin', 'гемоглобин'],
  Hematocrit: ['hematocrit', 'haematocrit', 'hct', 'hämatokrit', 'гематокрит'],
  Platelets: ['platelets', 'platelet', 'plt', 'thrombozyten', 'тромбоциты'],
  'White Blood Cells': ['white blood cells', 'wbc', 'leukocytes', 'leukozyten', 'лейкоциты'],
  'Red Blood Cells': ['red blood cells', 'rbc', 'erythrozyten', 'эритроциты'],
  MCV: ['mcv'],
  TSH: ['tsh', 'thyroid stimulating hormone', 'thyrotropin', 'ттг'],
  'Free T4': ['ft4', 'free t4', 'freies t4', 'т4 свободный', 'свободный т4'],
  'Free T3': ['ft3', 'free t3', 'freies t3', 'т3 свободный', 'свободный т3'],
  'Anti-TPO': ['anti-tpo', 'tpo', 'thyroid peroxidase', 'ат-тпо', 'ат к тпо'],
  AMH: ['amh', 'anti-mullerian', 'anti-müllerian', 'antimullerian', 'ovarian reserve', 'eizellreserve', 'амг', 'антимюллеров'],
  FSH: ['fsh', 'follicle stimulating', 'фсг'],
  LH: ['lh', 'luteinizing', 'luteinising', 'лг'],
  Estradiol: ['estradiol', 'oestradiol', 'e2', 'östradiol', 'эстрадиол'],
  Progesterone: ['progesterone', 'progesteron', 'прогестерон'],
  Prolactin: ['prolactin', 'prolaktin', 'пролактин'],
  Testosterone: ['testosterone', 'testosteron', 'тестостерон'],
  'Total Testosterone': ['testosterone', 'testosteron', 'тестостерон'],
  'Free Testosterone': ['free testosterone', 'testosterone', 'тестостерон'],
  'DHEA-S': ['dhea', 'dhea-s', 'dheas', 'дгэа'],
  SHBG: ['shbg', 'гспг'],
  HCG: ['hcg', 'beta hcg', 'бхгч', 'хгч'],
  Glucose: ['glucose', 'blood sugar', 'glukose', 'blutzucker', 'глюкоза', 'сахар'],
  'Fasting Glucose': ['fasting glucose', 'glucose', 'blood sugar', 'nüchternglukose', 'глюкоза'],
  HbA1c: ['hba1c', 'a1c', 'glycated', 'glycosylated', 'langzeitzucker', 'гликированный'],
  Insulin: ['insulin', 'инсулин'],
  'Fasting Insulin': ['insulin', 'инсулин'],
  'HOMA-IR': ['homa', 'homa-ir', 'insulin resistance', 'инсулинорезистентность'],
  'Total Cholesterol': ['cholesterol', 'cholesterin', 'холестерин'],
  LDL: ['ldl', 'cholesterol', 'лпнп'],
  HDL: ['hdl', 'cholesterol', 'лпвп'],
  Triglycerides: ['triglycerides', 'triglyceride', 'triglyzeride', 'триглицериды'],
  'Vitamin D': ['vitamin d', 'vit d', 'vit. d', 'vitd', '25-oh', '25oh', '25(oh)d', 'calcidiol', 'витамин d', 'витамин д'],
  'Vitamin B12': ['b12', 'vitamin b12', 'vit b12', 'cobalamin', 'в12', 'b 12'],
  Folate: ['folate', 'folic acid', 'folsäure', 'фолиевая', 'фолат'],
  Magnesium: ['magnesium', 'магний'],
  Calcium: ['calcium', 'kalzium', 'кальций'],
  Zinc: ['zinc', 'zink', 'цинк'],
  CRP: ['crp', 'c-reactive', 'срб'],
  'hs-CRP': ['hs-crp', 'hscrp', 'crp'],
  ALT: ['alt', 'alat', 'алт'],
  AST: ['ast', 'asat', 'аст'],
  GGT: ['ggt', 'gamma-gt', 'ггт'],
  Creatinine: ['creatinine', 'kreatinin', 'креатинин'],
  eGFR: ['egfr', 'gfr', 'kidney function', 'nierenfunktion'],
  'CA-125': ['ca-125', 'ca125', 'ca 125'],
};

// Broad words that mean "a group of analytes".
const GROUP_SYNONYMS: Record<string, string[]> = {
  thyroid: ['TSH', 'Free T4', 'Free T3', 'Anti-TPO'],
  schilddrüse: ['TSH', 'Free T4', 'Free T3', 'Anti-TPO'],
  щитовид: ['TSH', 'Free T4', 'Free T3', 'Anti-TPO'],
  anaemia: ['Ferritin', 'Hemoglobin', 'Iron', 'Transferrin Saturation', 'MCV'],
  anemia: ['Ferritin', 'Hemoglobin', 'Iron', 'Transferrin Saturation', 'MCV'],
  anämie: ['Ferritin', 'Hemoglobin', 'Iron', 'Transferrin Saturation', 'MCV'],
  анеми: ['Ferritin', 'Hemoglobin', 'Iron', 'Transferrin Saturation', 'MCV'],
  'blood count': ['Hemoglobin', 'Hematocrit', 'White Blood Cells', 'Red Blood Cells', 'Platelets', 'MCV'],
  cbc: ['Hemoglobin', 'Hematocrit', 'White Blood Cells', 'Red Blood Cells', 'Platelets', 'MCV'],
  blutbild: ['Hemoglobin', 'Hematocrit', 'White Blood Cells', 'Red Blood Cells', 'Platelets', 'MCV'],
  fertility: ['AMH', 'FSH', 'LH', 'Estradiol', 'Progesterone', 'Prolactin'],
  fruchtbarkeit: ['AMH', 'FSH', 'LH', 'Estradiol', 'Progesterone'],
  pcos: ['Testosterone', 'Total Testosterone', 'Free Testosterone', 'LH', 'FSH', 'AMH', 'DHEA-S', 'SHBG', 'Insulin', 'HOMA-IR'],
  cholesterol: ['Total Cholesterol', 'LDL', 'HDL', 'Triglycerides'],
  lipid: ['Total Cholesterol', 'LDL', 'HDL', 'Triglycerides'],
  diabetes: ['HbA1c', 'Glucose', 'Fasting Glucose', 'Insulin', 'HOMA-IR'],
  liver: ['ALT', 'AST', 'GGT'],
  leber: ['ALT', 'AST', 'GGT'],
  kidney: ['Creatinine', 'eGFR'],
  niere: ['Creatinine', 'eGFR'],
};

const ABNORMAL_STATUSES = new Set(['high', 'low', 'abnormal', 'critical', 'elevated', 'decreased', 'out of range', 'borderline']);

// Question words too common to match documents or row titles on.
const STOPWORDS = new Set((
  'what when where which while with without would could should about after again also another because been before being '
  + 'between both does doing down during each from further have having here into just more most much never only other over '
  + 'same some such than that their them then there these they this those through under until very were will your yours '
  + 'mine myself results result levels level value values test tests blood since changed change normal doctor feel feeling '
  + 'help please know tell show think really still last year years month months week weeks today good high low okay '
  + 'is it my me am an and the of to in on for how why can do i a be are was'
).split(/\s+/));

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Word boundary that also works for Cyrillic / umlauts.
const termRe = (t: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${esc(t.toLowerCase())}(?=$|[^\\p{L}\\p{N}])`, 'u');
const RE_CACHE = new Map<string, RegExp>();
function hasTerm(text: string, term: string): boolean {
  let re = RE_CACHE.get(term);
  if (!re) { re = termRe(term); RE_CACHE.set(term, re); }
  return re.test(text);
}
// Russian is inflected ("ферритина", "щитовидки"): prefix match there.
function hasStem(text: string, term: string): boolean {
  // Short Cyrillic abbreviations (ТТГ, ЛГ, АМГ) still need a whole word.
  if (/\p{Script=Cyrillic}/u.test(term) && term.length >= 5) {
    let re = RE_CACHE.get(`stem:${term}`);
    if (!re) {
      re = new RegExp(`(^|[^\\p{L}\\p{N}])${esc(term.toLowerCase())}`, 'u');
      RE_CACHE.set(`stem:${term}`, re);
    }
    return re.test(text);
  }
  return hasTerm(text, term);
}

/** Canonical analytes the question names (via synonyms or group words). */
export function analytesInQuestion(question: string): Set<string> {
  const q = question.toLowerCase();
  const out = new Set<string>();
  for (const [canon, terms] of Object.entries(ANALYTE_SYNONYMS)) {
    // Matched on word boundaries, so "lh" or "fe" only count as their own word.
    if (terms.some((t) => hasStem(q, t))) out.add(canon);
  }
  for (const [word, canons] of Object.entries(GROUP_SYNONYMS)) {
    if (hasStem(q, word)) canons.forEach((c) => out.add(c));
  }
  return out;
}

function questionKeywords(question: string): string[] {
  return Array.from(new Set(
    question.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4 && !STOPWORDS.has(w)),
  ));
}

// ---------------------------------------------------------------- formatting
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v)).trim();

export function fmtDate(v: unknown): string {
  if (!v) return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  const s = String(v);
  const m = /^\d{4}-\d{2}-\d{2}/.exec(s);
  if (m) return m[0];
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s.slice(0, 10) : d.toISOString().slice(0, 10);
}

const canonOf = (r: LabRow) => normalizeTestTitle(str(r.title)) || 'Unknown';
const isLab = (r: LabRow) => !r.data_type || str(r.data_type) === 'lab_result';
const isAbnormal = (r: LabRow) => ABNORMAL_STATUSES.has(str(r.status).toLowerCase());

// A value printed with a comma, apostrophe or space ("1,25", "1'250",
// "1,250") gets its number spelled out for the model, read with that
// report's own decimal mark; a reading that cannot be settled says so
// instead of letting the model guess.
function numberHint(r: LabRow, style: NumberStyle | null): string {
  const raw = str(r.value);
  if (!/\d[,'’ \u00a0\u202f]\d/.test(raw)) return '';
  const p = parseLabValue(raw, { style, title: str(r.title), unit: str(r.unit) });
  if (p.value == null) return '';
  if (p.alternatives && p.check) return ` [check value: could be ${p.alternatives[0]} or ${p.alternatives[1]}]`;
  return ` (= ${p.value}${p.check ? ', check value' : ''})`;
}

function valueText(r: LabRow, style: NumberStyle | null = null): string {
  let s = str(r.value);
  if (s) s += numberHint(r, style);
  if (s && str(r.unit)) s += ` ${str(r.unit)}`;
  if (str(r.reference_range)) s += ` (ref ${str(r.reference_range)})`;
  if (str(r.status) && str(r.status).toLowerCase() !== 'normal') s += ` [${str(r.status)}]`;
  return s || '(no value)';
}

function rowLine(r: LabRow, withNote = false, style: NumberStyle | null = null): string {
  const d = fmtDate(r.date_recorded) || 'undated';
  let line = `- ${d} ${canonOf(r)}: ${valueText(r, style)}`;
  if (withNote && str(r.notes)) line += ` — ${str(r.notes).slice(0, 160)}`;
  return line;
}

const byDateDesc = (a: LabRow, b: LabRow) => fmtDate(b.date_recorded).localeCompare(fmtDate(a.date_recorded));
const byDateAsc = (a: LabRow, b: LabRow) => -byDateDesc(a, b);

const docName = (d: DocRow) => str(d.ai_suggested_name) || str(d.file_name) || 'Untitled document';
const docCat = (d: DocRow) => str(d.ai_suggested_category) || str(d.document_type);

// ---------------------------------------------------------------- selection
export interface PersonalSelection {
  /** Markdown block to append to the system prompt ('' when she has no records). */
  block: string;
  matchedAnalytes: string[];
  /**
   * The rows this block put in front of the model, for the "From your
   * records" chips (see record-citations.ts). Rows without an id are left out.
   */
  candidates: RecordCandidate[];
  stats: { historyRows: number; docs: number; abnormal: number; baseline: number; omitted: number; tokens: number };
}

export interface SelectOptions {
  question: string | null | undefined;
  /** The previous user turn, so a follow-up ("and since 2022?") keeps its analyte. */
  previousQuestion?: string | null;
  labs: LabRow[];
  docs: DocRow[];
  now?: Date;
  /** Approximate token budget for the whole block (1 token ~ 4 chars). Default 2500. */
  tokenBudget?: number;
  baselineSize?: number;
}

export const estimateTokens = (s: string) => Math.ceil(s.length / 4);

const DOC_INTENT = /\b(document|documents|report|reports|letter|upload|uploaded|scan|befund|bericht|arztbrief|pdf)\b|документ|заключени|выписк|анализ/iu;

export function selectPersonalContext(opts: SelectOptions): PersonalSelection {
  const now = opts.now ?? new Date();
  const budgetChars = (opts.tokenBudget ?? 2500) * 4;
  const baselineSize = opts.baselineSize ?? 10;
  const question = str(opts.question);
  const labs = opts.labs ?? [];
  const docs = opts.docs ?? [];
  const empty: PersonalSelection = { block: '', matchedAnalytes: [], candidates: [], stats: { historyRows: 0, docs: 0, abnormal: 0, baseline: 0, omitted: 0, tokens: 0 } };
  if (labs.length === 0 && docs.length === 0) return empty;

  let analytes = analytesInQuestion(question);
  if (analytes.size === 0 && opts.previousQuestion) analytes = analytesInQuestion(str(opts.previousQuestion));
  const keywords = questionKeywords(question);

  const labRows = labs.filter(isLab);
  // Each report's own decimal mark (stored, or read from its other values).
  const styles = numberStylesByDocument(labs.map((r) => ({ document_id: str(r.document_id), value: r.value, reference_range: r.reference_range, raw_data: r.raw_data })));
  const labLine = (r: LabRow, withNote = false) => rowLine(r, withNote, styles.get(str(r.document_id)) ?? null);
  const otherRows = labs.filter((r) => !isLab(r));

  // 1. Full history of named analytes. A row counts if its canonical title
  //    is a named analyte, or its raw title contains one of the synonyms
  //    (titles the normaliser did not know, e.g. "Ferritin (Serum)").
  const history = new Map<string, LabRow[]>();
  for (const r of labRows) {
    const canon = canonOf(r);
    const title = str(r.title).toLowerCase();
    let hit = analytes.has(canon) ? canon : '';
    if (!hit) {
      for (const a of analytes) {
        if ((ANALYTE_SYNONYMS[a] ?? []).some((t) => t.length >= 3 && hasStem(title, t))) { hit = a; break; }
      }
    }
    if (!hit && keywords.length) {
      // A specific test she names that is not in the synonym table.
      if (keywords.some((k) => hasTerm(title, k))) hit = canon;
    }
    if (hit) {
      const key = hit;
      if (!history.has(key)) history.set(key, []);
      history.get(key)!.push(r);
    }
  }
  const historySet = new Set<LabRow>([...history.values()].flat());

  // 2. Matching documents (name / category / summary), best first.
  const docTerms = [...keywords, ...[...analytes].flatMap((a) => ANALYTE_SYNONYMS[a] ?? [a.toLowerCase()])];
  const scoredDocs = docs.map((d, i) => {
    const name = `${docName(d)} ${docCat(d)}`.toLowerCase();
    const summary = str(d.ai_summary).toLowerCase();
    let score = 0;
    for (const t of new Set(docTerms)) {
      if (t.length < 2) continue;
      if (hasStem(name, t)) score += 3;
      else if (hasStem(summary, t)) score += 1;
    }
    return { d, i, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.i - b.i);
  let matchedDocs = scoredDocs.map((x) => x.d).slice(0, 6);
  if (matchedDocs.length === 0 && DOC_INTENT.test(question)) matchedDocs = docs.slice(0, 3);

  // 3. Recent abnormal values: the latest reading of each test if abnormal,
  //    plus any abnormal reading from the last 12 months.
  const latestByCanon = new Map<string, LabRow>();
  for (const r of [...labRows].sort(byDateDesc)) {
    const c = canonOf(r);
    if (!latestByCanon.has(c)) latestByCanon.set(c, r);
  }
  const yearAgo = new Date(now.getTime() - 365 * 86400_000).toISOString().slice(0, 10);
  const abnormal = [...labRows].sort(byDateDesc).filter((r) =>
    isAbnormal(r) && !historySet.has(r)
    && (latestByCanon.get(canonOf(r)) === r || fmtDate(r.date_recorded) >= yearAgo)).slice(0, 20);
  const abnormalSet = new Set(abnormal);

  // 4. Baseline: latest value of the most recently measured tests.
  const baseline = [...latestByCanon.values()]
    .filter((r) => !historySet.has(r) && !abnormalSet.has(r) && !history.has(canonOf(r)))
    .slice(0, baselineSize);

  // ---- render, highest priority first, within budget
  const out: string[] = [];
  let used = 0;
  let omitted = 0;
  const push = (line: string): boolean => {
    if (used + line.length + 1 > budgetChars) { omitted++; return false; }
    out.push(line); used += line.length + 1; return true;
  };

  // Always-on summary.
  const dates = labs.map((r) => fmtDate(r.date_recorded)).filter(Boolean).sort();
  push('## Your health records (summary)');
  push(`- On file: ${docs.length} document(s), ${labRows.length} lab value(s)`
    + (dates.length ? ` from ${dates[0]} to ${dates[dates.length - 1]}` : '')
    + '. Only the records relevant to this question are listed below; say so if something she asks about is not in them.');
  const listOf = (type: string, n: number) => Array.from(new Set(otherRows
    .filter((r) => str(r.data_type) === type).map((r) => str(r.title)).filter(Boolean))).slice(0, n);
  const conditions = listOf('condition', 10);
  const allergies = listOf('allergy', 8);
  const meds = listOf('medication', 10);
  if (conditions.length) push(`- Conditions on file: ${conditions.join('; ')}`);
  if (allergies.length) push(`- Allergies: ${allergies.join('; ')}`);
  if (meds.length) push(`- Medicines in documents: ${meds.join('; ')}`);
  if (docs.length) push(`- Latest documents: ${docs.slice(0, 5).map((d) => `${docName(d)}${fmtDate(d.uploaded_at) ? ` (${fmtDate(d.uploaded_at)})` : ''}`).join('; ')}`);

  push('');
  push('## Your records relevant to this question');
  let historyRows = 0;
  // Out-of-range values must survive a long history: hold their room back.
  const abnormalReserve = abnormal.length
    ? abnormal.reduce((n, r) => n + labLine(r).length + 1, 0) + 40
    : 0;
  if (history.size) {
    let left = history.size;
    for (const [canon, rows] of history) {
      push(`### ${canon} — full history (${rows.length} value${rows.length === 1 ? '' : 's'}, oldest first)`);
      const sorted = [...rows].sort(byDateAsc);
      // If the histories would blow the budget, each named test gets an
      // equal share; within it the newest values are kept and the reader
      // is told how many older ones were left out.
      const fits = sorted.map((r) => labLine(r, true));
      const room = Math.floor((budgetChars - used - abnormalReserve - 120) / left--) - 50;
      let total = fits.reduce((n, l) => n + l.length + 1, 0);
      let start = 0;
      while (total > room && start < fits.length - 1) { total -= fits[start].length + 1; start++; }
      if (start > 0) { push(`- (${start} older value(s) not shown for space)`); omitted += start; }
      for (const l of fits.slice(start)) if (push(l)) historyRows++;
    }
  } else if (analytes.size) {
    push(`- No values on file for: ${[...analytes].join(', ')}.`);
  }

  let docCount = 0;
  if (matchedDocs.length) {
    push('### Matching documents');
    for (const d of matchedDocs) {
      const head = `- ${docName(d)}${docCat(d) ? ` (${docCat(d)})` : ''}${fmtDate(d.uploaded_at) ? `, ${fmtDate(d.uploaded_at)}` : ''}`;
      const summary = str(d.ai_summary);
      const line = summary ? `${head}\n  Summary: ${summary.slice(0, 700)}` : head;
      if (push(line)) docCount++; else if (push(head)) docCount++;
    }
  }
  if (!history.size && !matchedDocs.length && !analytes.size) push('- Nothing in her records matches this question specifically.');

  let abnormalCount = 0;
  if (abnormal.length) {
    push('');
    push('## Recent out-of-range values');
    for (const r of abnormal) if (push(labLine(r))) abnormalCount++;
  }

  let baselineCount = 0;
  if (baseline.length) {
    push('');
    push('## Recent baseline (latest value per test)');
    for (const r of baseline) if (push(labLine(r))) baselineCount++;
  }

  const block = out.join('\n') + '\n';

  // ---- citation candidates: what the model was shown, by priority
  const candidates: RecordCandidate[] = [];
  const labCandidate = (canon: string, rows: LabRow[], requireValue = false) => {
    const latest = [...rows].sort(byDateDesc).find((r) => str(r.id));
    if (!latest) return;
    const terms = [canon, ...(ANALYTE_SYNONYMS[canon] ?? []).filter((t) => t.length >= 3)];
    candidates.push({
      kind: 'lab',
      id: str(latest.id),
      documentId: str(latest.document_id) || null,
      label: canon,
      date: fmtDate(latest.date_recorded) || null,
      terms,
      count: rows.length,
      ...(requireValue ? { requireValue: rows.map((r) => str(r.value)).filter(Boolean) } : {}),
    });
  };
  for (const [canon, rows] of history) labCandidate(canon, rows);
  const byCanon = (rows: LabRow[]) => {
    const m = new Map<string, LabRow[]>();
    for (const r of rows) { const c = canonOf(r); if (!m.has(c)) m.set(c, []); m.get(c)!.push(r); }
    return m;
  };
  for (const [canon, rows] of byCanon(abnormal)) if (!history.has(canon)) labCandidate(canon, rows);
  for (const [canon, rows] of byCanon(baseline)) if (!history.has(canon)) labCandidate(canon, rows, true);
  for (const d of matchedDocs) {
    const id = str(d.id);
    if (!id) continue;
    const name = docName(d);
    const noExt = name.replace(/\.(pdf|jpe?g|png|heic|docx?|txt)$/i, '').replace(/[_]+/g, ' ').trim();
    const noDate = noExt.replace(/\b(19|20)\d{2}([-./]\d{1,2}([-./]\d{1,2})?)?\b/g, '').replace(/\s+/g, ' ').trim();
    const terms = Array.from(new Set([name, noExt, noDate].map((t) => t.toLowerCase()).filter((t) => t.length >= 6)));
    candidates.push({ kind: 'document', id, documentId: id, label: noExt || name, date: fmtDate(d.uploaded_at) || null, terms });
  }

  return {
    block,
    candidates,
    matchedAnalytes: [...history.keys()],
    stats: { historyRows, docs: docCount, abnormal: abnormalCount, baseline: baselineCount, omitted, tokens: estimateTokens(block) },
  };
}
