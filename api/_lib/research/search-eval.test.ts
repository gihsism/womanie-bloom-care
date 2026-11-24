import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { getLibrary, selectChatSources } from './library';
import { semanticQuery, selectChatSourcesHybrid } from './hybrid';
import { DEFAULT_EMBEDDING_MODEL, EMBEDDING_MODELS, modelFile } from './embed';
import { DRUG_PREGNANCY_QUESTIONS, EVAL_QUESTIONS, scoreRuns } from './search-eval';

// Retrieval quality on everyday patient questions (search-eval.ts).
// Numbers at the time of writing (34 questions, 307 items):
//   keyword-only  hit@3 0.59  hit@6 0.62
//   hybrid        hit@3 0.88  hit@6 0.91
// The floors below sit a little under those so a library rebuild can move
// them slightly without failing CI, while a real regression still fails.

const keywordRuns = () => EVAL_QUESTIONS.map((question) => ({ question, ranked: selectChatSources(question.q, question.stage) }));

describe('search eval: keyword-only (runs everywhere)', () => {
  it('every expected topic exists in the library', () => {
    const ids = new Set(getLibrary().topics.map((t) => t.id));
    const missing = [...EVAL_QUESTIONS, ...DRUG_PREGNANCY_QUESTIONS].flatMap((q) => q.topics).filter((t) => !ids.has(t));
    expect(missing).toEqual([]);
  });

  it('keyword search keeps its baseline', () => {
    const r = scoreRuns(keywordRuns());
    expect(r.n).toBeGreaterThanOrEqual(25);
    expect(r.hitAt3).toBeGreaterThanOrEqual(0.5);
    expect(r.hitAt6).toBeGreaterThanOrEqual(0.55);
  });
});

const spec = EMBEDDING_MODELS[DEFAULT_EMBEDDING_MODEL];
const hasModel = existsSync(modelFile(spec, 'onnx/model_quantized.onnx'));

describe.skipIf(!hasModel)('search eval: hybrid with the bundled model', () => {
  it('loads the model and embeds a question', async () => {
    const s = await semanticQuery('can I drink coffee while pregnant', { timeoutMs: 20_000 });
    expect(s).not.toBeNull();
    expect(s!.query.length).toBe(spec.dims);
  }, 30_000);

  it('hybrid beats keyword-only on hit@3 and hit@6', async () => {
    const deps = { timeoutMs: 20_000 };
    const runs = [];
    for (const question of EVAL_QUESTIONS) {
      runs.push({ question, ranked: await selectChatSourcesHybrid(question.q, question.stage, deps) });
    }
    const hybrid = scoreRuns(runs);
    const keyword = scoreRuns(keywordRuns());
    console.log(
      `search eval (${hybrid.n} questions): keyword hit@3 ${keyword.hitAt3.toFixed(2)} hit@6 ${keyword.hitAt6.toFixed(2)} | ` +
        `hybrid hit@3 ${hybrid.hitAt3.toFixed(2)} hit@6 ${hybrid.hitAt6.toFixed(2)}`,
    );
    expect(hybrid.hitAt3).toBeGreaterThanOrEqual(keyword.hitAt3);
    expect(hybrid.hitAt6).toBeGreaterThanOrEqual(keyword.hitAt6);
    expect(hybrid.hitAt3).toBeGreaterThanOrEqual(0.8);
    expect(hybrid.hitAt6).toBeGreaterThanOrEqual(0.85);
  }, 60_000);

  // Floors at today's level (3 of 5 at hit@3 and hit@6: both paracetamol
  // questions miss, see DRUG_PREGNANCY_QUESTIONS); raise them when the
  // ranking is fixed. A drop below means a drug + pregnancy regression.
  it('medicine + pregnancy questions find the drug-specific studies', async () => {
    const runs = [];
    for (const question of DRUG_PREGNANCY_QUESTIONS) {
      runs.push({ question, ranked: await selectChatSourcesHybrid(question.q, question.stage, { timeoutMs: 20_000 }) });
    }
    const r = scoreRuns(runs);
    console.log(`drug + pregnancy eval: hybrid hit@3 ${r.hitAt3.toFixed(2)} hit@6 ${r.hitAt6.toFixed(2)}; misses@3: ${r.misses3.join(' | ')}`);
    expect(r.hitAt3).toBeGreaterThanOrEqual(0.6);
    expect(r.hitAt6).toBeGreaterThanOrEqual(0.6);
  }, 60_000);

  it('does not attach sources to questions the library cannot answer', async () => {
    for (const [q, stage] of [
      ['how do I change my password', null],
      ["what's the weather like tomorrow", null],
      ['recommend a good pizza place near me', null],
      ['help me write an email to my boss', null],
      ['my laptop keeps freezing', 'pregnancy'],
    ] as const) {
      expect(await selectChatSourcesHybrid(q, stage, { timeoutMs: 20_000 }), q).toEqual([]);
    }
  }, 60_000);
});
