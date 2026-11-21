// Full-text passages for the research library.
//
// fulltext-chunks.json / fulltext-index.json are written by
// scripts/research/fulltext.mjs: openly licensed (CC0, CC BY, CC BY-SA)
// articles from the PMC Open Access subset, split into ~800-1200 character
// passages per section. Only a minority of library items have one; every
// function here degrades to "nothing" for the rest (and when the files are
// missing), so callers can use it unconditionally.
//
// Typical use in the chat, after the sources are chosen:
//   const passages = bestPassages(userQuestion, chosenSources.map(s => s.pmid), 3);
//   prompt += formatPassagesForPrompt(passages);
// and in the UI next to a source:
//   const a = fulltextAttribution(pmid); // { label: 'Full text · CC BY', pmcUrl, ... }
//
// Ranking is keyword BM25 over passages. RE-RANK HOOK: the local embedding
// model (library.ts hybrid search) can re-rank with bestPassagesReranked():
// it takes ~4k BM25 candidates and hands them to a reranker callback, e.g.
// cosine(queryEmbedding, embed(passage.text)).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface FulltextChunk {
  /** `${pmid}#${n}`, n = 1..chunks in reading order */
  id: string;
  pmid: string;
  pmcid: string;
  /** Canonical (Abstract, Introduction, Methods, Results, Discussion, Conclusions, ...) or the article's own heading */
  section: string;
  text: string;
  /** 'CC0' | 'CC BY' | 'CC BY-SA' */
  licence: string;
}

export interface FulltextIndexEntry {
  pmcid: string;
  version: number;
  licence: string;
  licenceUrl: string;
  /** https://pmc.ncbi.nlm.nih.gov/articles/PMC.../ */
  pmcUrl: string;
  title: string;
  /** "Surname AB, Surname CD, et al." for the CC BY attribution */
  credit: string;
  /** Ready-made UI label, e.g. "Full text · CC BY" */
  label: string;
  hasBody: boolean;
  chunks: number;
  sections: string[];
}

export interface FulltextIndex {
  version: number;
  generatedAt: string;
  source: string;
  acknowledgement: string;
  licencesAllowed: string[];
  pruned: string | null;
  items: Record<string, FulltextIndexEntry>;
}

export interface Passage extends FulltextChunk {
  score: number;
}

export interface FulltextAttribution {
  pmid: string;
  pmcid: string;
  licence: string;
  licenceUrl: string;
  pmcUrl: string;
  label: string;
  /** "Papola D, Miguel C, et al. Title. Full text from PubMed Central, CC BY." */
  text: string;
}

// ------------------------------------------------------------ tokens ----

const STOP = new Set(
  ('a an and are as at be been but by can could do does for from had has have how i if in into is it its may me might ' +
    'my no not of on or our should so than that the their them then there these they this to was we were what when ' +
    'which while who why will with would you your about after also any before between both did during each more most ' +
    'other over same some such only very just than too under up out off again further once here all am being having ' +
    'study studies patient patients women woman people use used using')
    .split(' '),
);

/** Lower-case word tokens without stop words, lightly stemmed (plural/-ing/-ed). */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/)) {
    if (raw.length < 2 || STOP.has(raw)) continue;
    out.push(stem(raw));
  }
  return out;
}

function stem(w: string): string {
  if (/^\d+$/.test(w) || w.length <= 3) return w;
  // British/American spelling (anaemia/anemia, oestrogen/estrogen, foetal/fetal)
  // and the pregnant/pregnancy family; applied to query and passages alike.
  w = w.replace(/(?<=.)ae|oe(?=[a-z])/g, 'e');
  if (w.startsWith('pregnan')) return 'pregnan';
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (w.endsWith('ing') && w.length > 5) return w.slice(0, -3);
  if (w.endsWith('ed') && w.length > 4) return w.slice(0, -2);
  if (w.endsWith('es') && /(ss|x|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) return w.slice(0, -1);
  if (w.endsWith('e') && w.length > 4) return w.slice(0, -1); // reduce/reduced/reducing -> reduc
  return w;
}

// ------------------------------------------------------------- store ----

/** Mild preference for the sections that answer "what did they find". */
const SECTION_BOOST: Record<string, number> = {
  Conclusions: 1.2,
  Recommendations: 1.2,
  'Plain language summary': 1.15,
  Results: 1.1,
  Abstract: 1.1,
  Discussion: 1.05,
  Methods: 0.85,
};

export interface BestPassagesOptions {
  /** Max passages from one study, so 2-4 passages spread over the chosen studies (default 2). */
  perStudy?: number;
  /** Passages scoring below this are dropped (default: any positive score). */
  minScore?: number;
}

export interface FulltextStore {
  chunksForPmids(pmids: string[]): FulltextChunk[];
  bestPassages(query: string, pmids: string[], k?: number, opts?: BestPassagesOptions): Passage[];
  hasFulltext(pmid: string): boolean;
  attribution(pmid: string): FulltextAttribution | null;
  index: FulltextIndex;
}

const BM25_K1 = 1.2;
const BM25_B = 0.75;

/** Builds a store over in-memory data. Pure: used by the lazy default store and by tests. */
export function createFulltextStore(chunks: FulltextChunk[], index?: Partial<FulltextIndex>): FulltextStore {
  const fullIndex: FulltextIndex = {
    version: 1,
    generatedAt: '',
    source: '',
    acknowledgement: '',
    licencesAllowed: [],
    pruned: null,
    items: {},
    ...index,
  };
  const byPmid = new Map<string, FulltextChunk[]>();
  for (const c of chunks) {
    const list = byPmid.get(c.pmid);
    if (list) list.push(c);
    else byPmid.set(c.pmid, [c]);
  }

  // Corpus statistics are computed once, on the first ranking call.
  let stats: { df: Map<string, number>; tf: Map<string, Map<string, number>>; len: Map<string, number>; avg: number } | null = null;
  const corpus = () => {
    if (stats) return stats;
    const df = new Map<string, number>();
    const tf = new Map<string, Map<string, number>>();
    const len = new Map<string, number>();
    let total = 0;
    for (const c of chunks) {
      const toks = tokenize(c.text);
      const counts = new Map<string, number>();
      for (const t of toks) counts.set(t, (counts.get(t) || 0) + 1);
      for (const t of counts.keys()) df.set(t, (df.get(t) || 0) + 1);
      tf.set(c.id, counts);
      len.set(c.id, toks.length);
      total += toks.length;
    }
    stats = { df, tf, len, avg: chunks.length ? total / chunks.length : 1 };
    return stats;
  };

  const chunksForPmids = (pmids: string[]) => pmids.flatMap((p) => byPmid.get(String(p)) || []);

  const bestPassages = (query: string, pmids: string[], k = 3, opts: BestPassagesOptions = {}): Passage[] => {
    const candidates = chunksForPmids([...new Set(pmids.map(String))]);
    const terms = [...new Set(tokenize(query))];
    if (!candidates.length || !terms.length || k <= 0) return [];
    const { df, tf, len, avg } = corpus();
    const N = chunks.length;
    const scored: Passage[] = [];
    for (const c of candidates) {
      const counts = tf.get(c.id);
      const dl = len.get(c.id) || 0;
      let score = 0;
      for (const t of terms) {
        const f = counts?.get(t) || 0;
        if (!f) continue;
        const n = df.get(t) || 0;
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        score += (idf * f * (BM25_K1 + 1)) / (f + BM25_K1 * (1 - BM25_B + (BM25_B * dl) / avg));
      }
      score *= SECTION_BOOST[c.section] ?? (/recommend|conclusion|summary/i.test(c.section) ? 1.15 : 1);
      if (score > (opts.minScore ?? 0)) scored.push({ ...c, score: Math.round(score * 1000) / 1000 });
    }
    scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const perStudy = opts.perStudy ?? 2;
    const taken = new Map<string, number>();
    const out: Passage[] = [];
    for (const p of scored) {
      const n = taken.get(p.pmid) || 0;
      if (n >= perStudy) continue;
      taken.set(p.pmid, n + 1);
      out.push(p);
      if (out.length >= k) break;
    }
    return out;
  };

  const attribution = (pmid: string): FulltextAttribution | null => {
    const e = fullIndex.items[String(pmid)];
    if (!e) return null;
    const credit = e.credit ? `${e.credit} ` : '';
    const title = e.title ? `${e.title.replace(/\.$/, '')}. ` : '';
    return {
      pmid: String(pmid),
      pmcid: e.pmcid,
      licence: e.licence,
      licenceUrl: e.licenceUrl,
      pmcUrl: e.pmcUrl,
      label: e.label || `Full text · ${e.licence}`,
      text: `${credit}${title}Full text from PubMed Central (${e.pmcid}), ${e.licence}.`,
    };
  };

  return {
    chunksForPmids,
    bestPassages,
    hasFulltext: (pmid) => byPmid.has(String(pmid)),
    attribution,
    index: fullIndex,
  };
}

// ------------------------------------------------------ default store ----

function readJson<T>(file: string): T | null {
  // Same lookup as library.ts: next to this module (bundled function), then
  // from the repo root (vitest / vercel dev).
  for (const read of [
    () => readFileSync(new URL(`./${file}`, import.meta.url), 'utf8'),
    () => readFileSync(join(process.cwd(), 'api', '_lib', 'research', file), 'utf8'),
  ]) {
    try {
      return JSON.parse(read()) as T;
    } catch {
      /* try the next location */
    }
  }
  return null;
}

let defaultStore: FulltextStore | null = null;

/** Loads fulltext-chunks.json + fulltext-index.json on first use (empty store if absent). */
export function getFulltextStore(): FulltextStore {
  if (!defaultStore) {
    const chunks = readJson<FulltextChunk[]>('fulltext-chunks.json') || [];
    const index = readJson<FulltextIndex>('fulltext-index.json') || undefined;
    defaultStore = createFulltextStore(chunks, index);
  }
  return defaultStore;
}

/** For tests: replace (or with no argument, reset) the lazily loaded store. */
export function setFulltextStoreForTests(store: FulltextStore | null): void {
  defaultStore = store;
}

/** All passages of the given studies, in reading order. */
export function chunksForPmids(pmids: string[]): FulltextChunk[] {
  return getFulltextStore().chunksForPmids(pmids);
}

/** The k passages (default 3) from the chosen studies that best match the query (BM25, max 2 per study). */
export function bestPassages(query: string, pmids: string[], k = 3, opts?: BestPassagesOptions): Passage[] {
  return getFulltextStore().bestPassages(query, pmids, k, opts);
}

export function hasFulltext(pmid: string): boolean {
  return getFulltextStore().hasFulltext(pmid);
}

/** "Full text · CC BY" + PMC link + credit line for the UI, or null when the item has no reusable full text. */
export function fulltextAttribution(pmid: string): FulltextAttribution | null {
  return getFulltextStore().attribution(pmid);
}

/**
 * RE-RANK HOOK for the embeddings model: BM25 picks a wide candidate set
 * (k * candidateFactor, perStudy relaxed), the reranker returns a score per
 * candidate (higher = better), and the top k are kept, again max perStudy
 * per study. With no reranker this equals bestPassages().
 */
export async function bestPassagesReranked(
  query: string,
  pmids: string[],
  k = 3,
  rerank?: (query: string, candidates: Passage[]) => Promise<number[]> | number[],
  opts: BestPassagesOptions & { candidateFactor?: number } = {},
): Promise<Passage[]> {
  if (!rerank) return bestPassages(query, pmids, k, opts);
  const candidates = bestPassages(query, pmids, k * (opts.candidateFactor ?? 4), {
    ...opts,
    perStudy: (opts.perStudy ?? 2) * 3,
  });
  if (!candidates.length) return [];
  const scores = await rerank(query, candidates);
  const ranked = candidates
    .map((p, i) => ({ ...p, score: Number.isFinite(scores[i]) ? scores[i] : -Infinity }))
    .sort((a, b) => b.score - a.score);
  const perStudy = opts.perStudy ?? 2;
  const taken = new Map<string, number>();
  const out: Passage[] = [];
  for (const p of ranked) {
    const n = taken.get(p.pmid) || 0;
    if (n >= perStudy) continue;
    taken.set(p.pmid, n + 1);
    out.push(p);
    if (out.length >= k) break;
  }
  return out;
}

/**
 * Passages as a prompt block. `sourceNumber` maps a PMID to the [n] the
 * chat already uses for that source, so the model cites the passage with
 * the same number.
 */
export function formatPassagesForPrompt(passages: Passage[], sourceNumber?: (pmid: string) => number | undefined): string {
  if (!passages.length) return '';
  const lines = passages.map((p) => {
    const n = sourceNumber?.(p.pmid);
    const tag = n ? `[${n}]` : `PMID ${p.pmid}`;
    return `${tag} (full text, ${p.section}, ${p.licence}):\n"""${p.text}"""`;
  });
  return `Full-text passages from the selected studies (quote or paraphrase only what they say):\n\n${lines.join('\n\n')}\n`;
}
