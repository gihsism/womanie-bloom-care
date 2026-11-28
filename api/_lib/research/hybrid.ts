// Hybrid (keyword + semantic) search over the research library.
//
// The query is embedded on our own server (embed.ts) and compared with
// the precomputed document vectors (library-embeddings.json); the cosine
// is blended with the keyword score inside searchItems (library.ts), which
// still applies the life-stage, evidence, Cochrane and recency boosts and
// the chat's minScore / 0.5 x top / max-6 rules.
//
// Embedding is best-effort: a missing model or embeddings file, a load
// error, a stale file or anything slower than the timeout falls back to
// keyword-only search for that request. It never throws, so it can never
// break the chat. The model keeps loading in the background after a
// timeout, so the next request on the same instance gets it warm.

import {
  browseItems,
  getLibrary,
  searchItems,
  selectChatSources,
  semanticQueryText,
  type ResearchItem,
  type ScoredItem,
  type SearchOptions,
  type SemanticInput,
} from './library.js';
import { DEFAULT_EMBEDDING_MODEL, documentText, getDocEmbeddings, getEmbedder, textHash } from './embed.js';

/**
 * Blend settings, tuned on the eval set in search-eval.ts (see
 * search-eval.test.ts). floor/ceil are all-MiniLM-L6-v2 cosines (question
 * vs title+summary+keyPoints+tags): unrelated items sit around 0.1
 * (90th percentile 0.25), on-topic ones around 0.3-0.5. Chosen from the
 * middle of a plateau rather than the single best grid point: lower
 * floors or higher weights gained ~1 question on hit@3 but started
 * attaching sources to off-topic questions ("my knee hurts after
 * running", "change my password"), which the chat must not do.
 */
export const HYBRID_SETTINGS = { weight: 0.5, floor: 0.2, ceil: 0.4 } as const;

/** Total budget for loading the model (cold) and embedding the query. */
export const EMBED_TIMEOUT_MS = 3000;

export interface SemanticDeps {
  /** Returns the unit query vector; defaults to the vendored model. */
  embedQuery?: (query: string) => Promise<Float32Array>;
  /** Document vectors by item id; defaults to library-embeddings.json. */
  docs?: Map<string, Float32Array> | null;
  timeoutMs?: number;
  settings?: { weight: number; floor: number; ceil: number };
}

let currentDocs: Map<string, Float32Array> | null | undefined;

/**
 * Stored vectors for the items whose text still matches what was
 * embedded. An item edited (or added) without re-running
 * embed-library.mjs simply gets no semantic score, never a wrong one.
 */
export function currentDocVectors(): Map<string, Float32Array> | null {
  if (currentDocs !== undefined) return currentDocs;
  const stored = getDocEmbeddings();
  if (!stored) return (currentDocs = null);
  const out = new Map<string, Float32Array>();
  for (const item of getLibrary().items) {
    const e = stored.file.items[item.id];
    const v = stored.vectors.get(item.id);
    if (e && v && e.h === textHash(documentText(item))) out.set(item.id, v);
  }
  return (currentDocs = out);
}

async function defaultEmbedQuery(query: string): Promise<Float32Array> {
  const embedder = await getEmbedder(getDocEmbeddings()?.file.model ?? DEFAULT_EMBEDDING_MODEL);
  const [v] = await embedder.embed([query], 'query');
  return v;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`embedding timed out after ${ms} ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

let warned = false;

/**
 * The semantic half of a hybrid search, or null (= keyword-only) when
 * anything is unavailable or slow. Never throws.
 */
export async function semanticQuery(query: string, deps: SemanticDeps = {}): Promise<SemanticInput | null> {
  const q = query.trim();
  if (!q) return null;
  try {
    const docs = deps.docs !== undefined ? deps.docs : currentDocVectors();
    if (!docs || docs.size === 0) return null;
    const vec = await withTimeout((deps.embedQuery ?? defaultEmbedQuery)(q.slice(0, 500)), deps.timeoutMs ?? EMBED_TIMEOUT_MS);
    if (!(vec instanceof Float32Array) || vec.length === 0 || !Number.isFinite(vec[0])) return null;
    const first = docs.values().next().value as Float32Array | undefined;
    if (first && first.length !== vec.length) return null;
    return { query: vec, docs, ...(deps.settings ?? HYBRID_SETTINGS) };
  } catch (err) {
    // Log the reason once per instance, never the question itself.
    if (!warned) {
      warned = true;
      console.warn('Research search: semantic part unavailable, using keywords only:', (err as Error)?.message ?? err);
    }
    return null;
  }
}

/** Hybrid searchResearch(); keyword-only if embedding is unavailable. */
export async function searchResearchHybrid(query: string, opts: SearchOptions = {}, deps?: SemanticDeps): Promise<ScoredItem[]> {
  const lib = getLibrary();
  const semantic = await semanticQuery(query, deps);
  return searchItems(lib.items, query, { ...opts, semantic }, lib.topics);
}

/** Hybrid selectChatSources(); keyword-only if embedding is unavailable. */
export async function selectChatSourcesHybrid(
  question: string | null | undefined,
  lifeStage: string | null | undefined,
  deps?: SemanticDeps,
): Promise<ResearchItem[]> {
  if (!question || !question.trim()) return [];
  // Round 20: a lab value in the question is left out of the embedded text.
  const semantic = await semanticQuery(semanticQueryText(question, lifeStage), deps);
  return selectChatSources(question, lifeStage, undefined, undefined, semantic);
}

/** Hybrid browseItems() for the Library page search box. */
export async function browseItemsHybrid(
  opts: { lifeStage?: string | null; topic?: string | null; q?: string | null },
  deps?: SemanticDeps,
): Promise<ResearchItem[]> {
  const q = (opts.q ?? '').trim();
  const semantic = q ? await semanticQuery(q, deps) : null;
  return browseItems({ ...opts, semantic });
}
