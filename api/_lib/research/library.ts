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
    'result results help good bad better best normal mean means explain okay'
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
};

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

function expandQuery(tokens: string[]): { token: string; weight: number }[] {
  const out = new Map<string, number>();
  for (const t of tokens) {
    out.set(t, Math.max(out.get(t) ?? 0, 1));
    for (const syn of SYNONYMS[t] ?? []) {
      const s = stem(syn);
      if (!out.has(s)) out.set(s, 0.7);
    }
  }
  return [...out].map(([token, weight]) => ({ token, weight }));
}

interface IndexedItem {
  item: ResearchItem;
  strong: Set<string>; // keywords, tags, topic ids/labels
  topic: Set<string>; // our curated topic labels: high precision
  title: Set<string>;
  body: Set<string>;
  phrases: string[]; // multi-word keywords/tags, lowercased
}

const indexCache = new WeakMap<ResearchItem[], IndexedItem[]>();

function indexItems(items: ResearchItem[], topics: ResearchTopic[]): IndexedItem[] {
  const hit = indexCache.get(items);
  if (hit) return hit;
  const topicLabel = new Map(topics.map((t) => [t.id, t.label]));
  const idx = items.map((item) => {
    const topicText = item.topics.map((t) => `${t.replace(/-/g, ' ')} ${topicLabel.get(t) ?? ''}`).join(' ');
    return {
      item,
      strong: new Set(tokenize([...item.keywords, ...item.tags, topicText].join(' '))),
      topic: new Set(tokenize(topicText)),
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
}

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

const EVIDENCE_BOOST: Record<EvidenceLevel, number> = { guideline: 1.25, 'systematic review': 1.1, study: 1 };
// Cochrane reviews are the most rigorous reviews in the library.
const COCHRANE_BOOST = 1.1;

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
 * factor, x evidence boost, with a small recency nudge.
 */
export function searchItems(
  items: ResearchItem[],
  query: string,
  opts: SearchOptions = {},
  topics: ResearchTopic[] = [],
): ScoredItem[] {
  const stage = normalizeLifeStage(opts.lifeStage);
  const qTokens = tokenize(query);
  const expanded = expandQuery(qTokens);
  const qLower = ` ${query.toLowerCase().replace(/[^a-z0-9 -]+/g, ' ').replace(/\s+/g, ' ')} `;
  const nowYear = new Date().getFullYear();
  const results: ScoredItem[] = [];
  const sem = query.trim() ? opts.semantic ?? null : null;
  const candidates: { it: IndexedItem; base: number; strength: number }[] = [];

  for (const it of indexItems(items, topics)) {
    if (opts.topic && !it.item.topics.includes(opts.topic)) continue;
    if (!stageAllowed(it.item, stage, opts)) continue;

    let raw = 0;
    const matched = new Set<string>();
    for (const { token, weight } of expanded) {
      let s = 0;
      if (it.strong.has(token)) s = it.topic.has(token) ? 4 : 3;
      else if (it.title.has(token)) s = 2;
      else if (it.body.has(token)) s = 1;
      if (s > 0) {
        raw += s * weight;
        matched.add(token);
      }
    }
    for (const p of it.phrases) if (qLower.includes(` ${p} `)) raw += 2;

    const coverage = qTokens.length
      ? qTokens.filter((t) => matched.has(t) || (SYNONYMS[t] ?? []).some((s) => matched.has(stem(s)))).length / qTokens.length
      : 1;
    const base = qTokens.length ? raw * (0.4 + 0.6 * coverage) : 1;
    if (sem) {
      const doc = sem.docs.get(it.item.id);
      const strength = doc ? semanticStrength(dotProduct(sem.query, doc), sem.floor, sem.ceil) : 0;
      if (raw === 0 && strength === 0) continue;
      candidates.push({ it, base: raw === 0 ? 0 : base, strength });
      continue;
    }
    if (qTokens.length > 0 && raw === 0) continue;
    candidates.push({ it, base, strength: 0 });
  }

  // Hybrid: normalise the keyword part against the best keyword match of
  // this query (at least KEYWORD_REF) and blend in the semantic strength.
  const ref = sem ? Math.max(KEYWORD_REF, ...candidates.map((c) => c.base)) : 0;
  for (const { it, base: kwBase, strength } of candidates) {
    const base = sem ? blendScores(kwBase, strength, sem.weight, ref) : kwBase;
    const recency = 1 + Math.max(0, 10 - (nowYear - it.item.year)) * 0.005;
    const cochrane = /cochrane/i.test(it.item.journal) ? COCHRANE_BOOST : 1;
    const score = base * stageFactor(it.item, stage) * EVIDENCE_BOOST[it.item.evidenceLevel] * cochrane * recency;
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
  const ranked = searchItems(lib.items, question.slice(0, 500), { lifeStage, minScore: 5, semantic }, lib.topics);
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

/** System-prompt block listing the numbered sources and citation rules. */
export function buildSourcesPrompt(items: ResearchItem[]): string {
  if (items.length === 0) {
    return `\n\n## Research sources\nNo items from the Womanie research library matched this question. Do not cite any sources or use bracketed numbers. If you give general health information, say it is general and suggest checking with a doctor or midwife.`;
  }
  const blocks = items.map((it, i) => {
    const certainty = it.certainty && it.certainty !== 'not stated' ? `; certainty of evidence: ${it.certainty}` : '';
    return `[${i + 1}] ${it.title} — ${it.source}, ${it.year} (${it.evidenceLevel}${certainty})
Finding: ${it.summary}
Key points: ${it.keyPoints.join(' | ')}`;
  });
  return `\n\n## Research sources
These are summaries of published research from the Womanie research library (clinical guidelines and systematic reviews from PubMed), chosen for this question. Each one lists what the research actually found; check that text before citing it:

${blocks.join('\n\n')}

Rules for using these sources:
- Cite only sources you actually used: put a source's number in square brackets, e.g. [1] or [1][3], only after a sentence or clause that its Finding, Key points or passage directly support. The source must say the specific thing your sentence says, not just be about the same topic.
- Before each citation, check the sentence against that source's text. Never carry a dose, amount, percentage, risk figure, duration, age or population over from a source unless it matches exactly what the source states (for example, do not cite a source that studied 300 mg next to a sentence about 200 mg). If the numbers differ, either use the source's own figure or drop the citation.
- Put each number straight after the words its source supports. Anything you add after the number in the same sentence (advice such as "so it is worth seeing your GP", your own explanation, or a point from another source) does not get that number. Example: "Untreated period pain can turn into long-term pain [1], so it is worth getting checked."
- Name the subject in every cited sentence (the medicine, test or treatment), never just "it" or "this", and keep the source's population and certainty for that finding (for example "in copper-coil users", "low-certainty evidence"). Never make a finding sound stronger or more general than the source.
- If no source above supports a claim, state it without a citation as general information, or say the evidence here is limited. Never attach a nearby source just to give a sentence a number.
- Fewer, accurate citations are better than many loose ones. It is fine to cite only one or two sources, or none.
- Never cite anything that is not in this list, never use a number that is not listed above, never invent studies, numbers or guidelines, and never use bracketed numbers for anything else.
- If the sources are uncertain, low-certainty, conflicting or do not quite answer the question, say so plainly.
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
