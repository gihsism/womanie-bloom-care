import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getLibrary, selectChatSources, type ResearchItem } from './library';
import { currentDocVectors, HYBRID_SETTINGS } from './hybrid';
import { decodeVector, DEFAULT_EMBEDDING_MODEL, EMBEDDING_MODELS, getEmbedder, modelFile } from './embed';
import { AUDIT_QUESTIONS, scoreAudit } from './search-eval';
import { validateLibraryItem } from './guideline-page';

// Test harness: what retrieval WOULD return if the staged guideline-page
// candidates (staging/guideline-pages.json, written by
// scripts/research/guideline-pages.mjs) were in the library. Off by
// default; run with
//   RESEARCH_STAGED=1 npx vitest run api/_lib/research/staged-retrieval.test.ts
// The staging file is read here only: no app code loads it, so it never
// reaches a serverless function.

const STAGING = join(process.cwd(), 'api', '_lib', 'research', 'staging', 'guideline-pages.json');
const hasModel = existsSync(modelFile(EMBEDDING_MODELS[DEFAULT_EMBEDDING_MODEL], 'onnx/model_quantized.onnx'));
const enabled = process.env.RESEARCH_STAGED === '1' && existsSync(STAGING) && hasModel;

interface Staging {
  items: ResearchItem[];
  embeddings: Record<string, { h: string; s: number; v: string }>;
  embedding: { model: string } | null;
}

describe.skipIf(!enabled)('staged guideline pages: retrieval preview (RESEARCH_STAGED=1)', () => {
  const staging = enabled ? (JSON.parse(readFileSync(STAGING, 'utf8')) as Staging) : null;

  const run = async (questions: { q: string; stage: string }[], withStaged: boolean) => {
    const lib = getLibrary();
    const docs = new Map(currentDocVectors() ?? []);
    if (withStaged) for (const [id, e] of Object.entries(staging!.embeddings)) docs.set(id, decodeVector(e));
    const items = withStaged ? [...lib.items, ...staging!.items] : lib.items;
    const embedder = await getEmbedder(staging!.embedding?.model ?? DEFAULT_EMBEDDING_MODEL);
    const out = [];
    for (const { q, stage } of questions) {
      const [query] = await embedder.embed([q], 'query');
      const ranked = selectChatSources(q, stage, items, lib.topics, { query, docs, ...HYBRID_SETTINGS });
      out.push({ q, stage, ranked });
    }
    return out;
  };

  it('staged items are valid library items with the library embedding model', () => {
    const topics = new Set(getLibrary().topics.map((t) => t.id));
    for (const it of staging!.items) expect(validateLibraryItem(it, topics), it.id).toEqual([]);
    const libModel = JSON.parse(readFileSync(join(process.cwd(), 'api', '_lib', 'research', 'library-embeddings.json'), 'utf8')).model;
    expect(staging!.embedding?.model).toBe(libModel);
  });

  it('prints the top sources for the 3 gap questions, without and with staged items', async () => {
    const gaps = AUDIT_QUESTIONS.filter((a) => a.gap);
    expect(gaps.length).toBe(3);
    const before = await run(gaps, false);
    const after = await run(gaps, true);
    const stagedIds = new Set(staging!.items.map((i) => i.id));
    const fmt = (r: ResearchItem[]) =>
      r.slice(0, 3).map((it, i) => `    ${i + 1}. ${stagedIds.has(it.id) ? '[STAGED] ' : ''}${it.title.slice(0, 90)} (${it.source}, ${it.year})`).join('\n') || '    (no sources)';
    for (let i = 0; i < gaps.length; i++) {
      console.log(`\nQ: ${gaps[i].q}\n  library only:\n${fmt(before[i].ranked)}\n  with staged:\n${fmt(after[i].ranked)}`);
    }
    // Every gap question gets a staged page among its first three sources.
    for (const a of after) expect(a.ranked.slice(0, 3).some((it) => stagedIds.has(it.id)), a.q).toBe(true);
  }, 60_000);

  it('the scored citation-audit questions keep their hand-checked items in the top 3', async () => {
    const scored = AUDIT_QUESTIONS.filter((a) => !a.gap);
    const runs = (await run(scored, true)).map((r, i) => ({ question: scored[i], ranked: r.ranked }));
    const res = scoreAudit(runs);
    console.log(`citation audit with staged items: hit@3 ${res.hit.toFixed(2)} (${res.n} questions); misses: ${res.misses.join(' | ') || 'none'}`);
    expect(res.hit, res.misses.join(' | ')).toBe(1);
  }, 120_000);
});
