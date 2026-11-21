import { describe, it, expect, vi } from 'vitest';
import { KEYWORD_REF, blendScores, getLibrary, searchItems, selectChatSources, semanticStrength, type ResearchItem, type SemanticInput } from './library';
import { HYBRID_SETTINGS, browseItemsHybrid, currentDocVectors, selectChatSourcesHybrid, semanticQuery } from './hybrid';
import { DEFAULT_EMBEDDING_MODEL, EMBEDDING_MODELS, decodeVector, documentText, dot, encodeVector, getDocEmbeddings, normalize, textHash } from './embed';

function item(over: Partial<ResearchItem> & { pmid: string }): ResearchItem {
  return {
    id: `pmid-${over.pmid}`,
    doi: null,
    title: 'Untitled review',
    source: 'Some Journal',
    journal: 'Some Journal',
    organisation: null,
    year: 2020,
    publicationTypes: ['Systematic Review'],
    evidenceLevel: 'systematic review',
    url: `https://pubmed.ncbi.nlm.nih.gov/${over.pmid}/`,
    summary: 'A summary.',
    keyPoints: ['Point one.'],
    certainty: 'not stated',
    lifeStages: ['general'],
    topics: ['misc'],
    tags: ['misc'],
    keywords: ['misc'],
    ...over,
  };
}

const FIX: ResearchItem[] = [
  item({ pmid: '1', title: 'Caffeine in pregnancy', keywords: ['coffee', 'caffeine'], tags: ['caffeine'], lifeStages: ['pregnancy'] }),
  item({ pmid: '2', title: 'Postnatal depression screening', keywords: ['postnatal depression', 'epds'], tags: ['depression'], lifeStages: ['postpartum'] }),
  item({ pmid: '3', title: 'Bone density after menopause', keywords: ['osteoporosis'], tags: ['bone'], lifeStages: ['menopause'] }),
];

// Tiny 3-d "embeddings": each fixture item points along one axis.
const unit = (...v: number[]) => normalize(Float32Array.from(v));
const DOCS = new Map<string, Float32Array>([
  ['pmid-1', unit(1, 0, 0)],
  ['pmid-2', unit(0, 1, 0)],
  ['pmid-3', unit(0, 0, 1)],
]);
const sem = (q: Float32Array, over: Partial<SemanticInput> = {}): SemanticInput => ({
  query: q,
  docs: DOCS,
  weight: 0.5,
  floor: 0.2,
  ceil: 0.4,
  ...over,
});

describe('blending', () => {
  it('maps cosine onto 0-1 between floor and ceil', () => {
    expect(semanticStrength(0.1, 0.2, 0.4)).toBe(0);
    expect(semanticStrength(0.3, 0.2, 0.4)).toBeCloseTo(0.5);
    expect(semanticStrength(0.9, 0.2, 0.4)).toBe(1);
    expect(semanticStrength(0.5, 0.4, 0.4)).toBe(0); // degenerate range
  });

  it('blends in keyword-score units and caps the keyword part at the reference', () => {
    expect(blendScores(10, 0, 0.5, 10)).toBe(5);
    expect(blendScores(0, 1, 0.5, 10)).toBe(5);
    expect(blendScores(20, 1, 0.5, 20)).toBe(20);
    expect(blendScores(40, 0, 0.5, 20)).toBe(10); // capped at 1 x ref
    expect(blendScores(5, 0.5, 0, 10)).toBe(5); // weight 0 = keyword only
    expect(blendScores(5, 0.5, 1, 10)).toBe(5); // weight 1 = semantic only
  });

  it('without semantic input, searchItems is exactly the keyword ranking', () => {
    const a = searchItems(FIX, 'coffee pregnancy', { lifeStage: 'pregnancy' });
    const b = searchItems(FIX, 'coffee pregnancy', { lifeStage: 'pregnancy', semantic: null });
    expect(b).toEqual(a);
    expect(a.map((r) => r.item.pmid)).toEqual(['1']);
  });

  it('adds items the keywords miss when the meaning matches', () => {
    // "crying a lot after birth" shares no keyword with item 2.
    expect(searchItems(FIX, 'crying a lot after birth', {})).toEqual([]);
    const res = searchItems(FIX, 'crying a lot after birth', { semantic: sem(unit(0.1, 1, 0)) });
    expect(res.map((r) => r.item.pmid)).toEqual(['2']);
    // Semantic-only strength 1 at weight 0.5 = half the keyword reference.
    expect(res[0].score).toBeCloseTo((KEYWORD_REF / 2) * 1.1 * (1 + Math.max(0, 10 - (new Date().getFullYear() - 2020)) * 0.005), 1);
  });

  it('a keyword hit that is also semantically close outranks one that is not', () => {
    const q = 'coffee depression';
    const kw = searchItems(FIX, q, {});
    expect(kw.map((r) => r.item.pmid).sort()).toEqual(['1', '2']);
    const res = searchItems(FIX, q, { semantic: sem(unit(0, 1, 0)) });
    expect(res[0].item.pmid).toBe('2');
  });

  it('drops items below the floor that have no keyword hit', () => {
    const res = searchItems(FIX, 'zzz unrelated words', { semantic: sem(unit(1, 0.1, 0), { floor: 0.5, ceil: 0.9 }) });
    expect(res.map((r) => r.item.pmid)).toEqual(['1']);
  });

  it('still applies stage filters and the chat cutoff/minScore', () => {
    const strict = searchItems(FIX, 'bones', { lifeStage: 'pregnancy', strictStage: true, excludeGeneral: true, semantic: sem(unit(0, 0, 1)) });
    expect(strict).toEqual([]);
    const picked = selectChatSources('crying after birth', 'postpartum', FIX, [], sem(unit(0.05, 1, 0.05)));
    expect(picked.map((i) => i.pmid)).toEqual(['2']);
    // Weak semantic similarity alone does not reach the chat's minScore.
    expect(selectChatSources('crying after birth', null, FIX, [], sem(unit(0.2, 1, 0), { floor: 0.9, ceil: 1 }))).toEqual([]);
  });

  it('an empty query never uses the semantic part', () => {
    const a = searchItems(FIX, '', {});
    const b = searchItems(FIX, '', { semantic: sem(unit(1, 0, 0)) });
    expect(b).toEqual(a);
  });
});

describe('fallback to keyword-only', () => {
  const q = 'is it normal to cry a lot two weeks after birth';

  it('returns null (keyword-only) when the embedder throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const s = await semanticQuery(q, { embedQuery: async () => Promise.reject(new Error('model failed to load')), docs: DOCS });
    expect(s).toBeNull();
    warn.mockRestore();
  });

  it('gives up after the timeout and does not wait for a slow model', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = Date.now();
    const s = await semanticQuery(q, {
      embedQuery: () => new Promise((r) => setTimeout(() => r(unit(1, 0, 0)), 2000)),
      docs: DOCS,
      timeoutMs: 50,
    });
    expect(s).toBeNull();
    expect(Date.now() - t).toBeLessThan(1000);
    warn.mockRestore();
  });

  it('returns null without document vectors, for empty queries and for wrong-size vectors', async () => {
    const embedQuery = vi.fn(async () => unit(1, 0, 0));
    expect(await semanticQuery(q, { embedQuery, docs: null })).toBeNull();
    expect(await semanticQuery(q, { embedQuery, docs: new Map() })).toBeNull();
    expect(await semanticQuery('   ', { embedQuery, docs: DOCS })).toBeNull();
    expect(embedQuery).not.toHaveBeenCalled();
    expect(await semanticQuery(q, { embedQuery: async () => unit(1, 0), docs: DOCS })).toBeNull();
    expect(await semanticQuery(q, { embedQuery: async () => Float32Array.from([NaN, 0, 0]), docs: DOCS })).toBeNull();
  });

  it('passes the tuned settings through when it works', async () => {
    const s = await semanticQuery(q, { embedQuery: async () => unit(0, 1, 0), docs: DOCS });
    expect(s).toMatchObject(HYBRID_SETTINGS);
    expect(s?.docs).toBe(DOCS);
  });

  it('the chat gets exactly the keyword sources when embedding fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failing = { embedQuery: async () => Promise.reject(new Error('boom')) };
    for (const [question, stage] of [
      ['can I drink coffee while pregnant', 'pregnancy'],
      ['hot flushes at night what helps', 'menopause'],
      [q, 'postpartum'],
    ] as const) {
      const hybrid = await selectChatSourcesHybrid(question, stage, failing);
      expect(hybrid.map((i) => i.id)).toEqual(selectChatSources(question, stage).map((i) => i.id));
    }
    expect(await selectChatSourcesHybrid('', 'pregnancy', failing)).toEqual([]);
    expect((await browseItemsHybrid({ q: 'coffee' }, failing)).map((i) => i.id)).toEqual(
      (await browseItemsHybrid({ q: 'coffee' }, { embedQuery: failing.embedQuery, docs: null })).map((i) => i.id),
    );
    warn.mockRestore();
  });
});

describe('stored document embeddings', () => {
  it('int8 round trip keeps vectors essentially unchanged', () => {
    const v = normalize(Float32Array.from({ length: 384 }, (_, i) => Math.sin(i * 1.7) + 0.1 * Math.cos(i)));
    expect(dot(decodeVector(encodeVector(v)), v)).toBeGreaterThan(0.9999);
  });

  it('library-embeddings.json covers every library item with the current text', () => {
    const stored = getDocEmbeddings();
    expect(stored).not.toBeNull();
    const { file, vectors } = stored!;
    expect(file.model).toBe(DEFAULT_EMBEDDING_MODEL);
    expect(file.dims).toBe(EMBEDDING_MODELS[DEFAULT_EMBEDDING_MODEL].dims);
    const lib = getLibrary();
    const stale = lib.items.filter((it) => file.items[it.id]?.h !== textHash(documentText(it))).map((it) => it.id);
    // If this fails: run `node scripts/research/embed-library.mjs`.
    expect(stale).toEqual([]);
    expect(currentDocVectors()?.size).toBe(lib.items.length);
    for (const v of vectors.values()) {
      expect(v.length).toBe(file.dims);
      expect(dot(v, v)).toBeCloseTo(1, 4);
    }
  });
});
