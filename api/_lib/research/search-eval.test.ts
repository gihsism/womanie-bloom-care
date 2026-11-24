import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { getLibrary, selectChatSources } from './library';
import { semanticQuery, selectChatSourcesHybrid } from './hybrid';
import { DEFAULT_EMBEDDING_MODEL, EMBEDDING_MODELS, modelFile } from './embed';
import { DRUG_PREGNANCY_QUESTIONS, EVAL_QUESTIONS, MIXED_MEDICINE_QUESTIONS, scoreRuns, type EvalQuestion } from './search-eval';

// Retrieval quality on everyday patient questions (search-eval.ts).
// Numbers at the time of writing (34 questions, 307 items):
//   keyword-only  hit@3 0.59  hit@6 0.62
//   hybrid        hit@3 0.88  hit@6 0.91
// Nov 2026 (34 questions, 2,493 items), after the named-medicine ranking fix:
//   keyword-only  hit@3 0.88  hit@6 0.88
//   hybrid        hit@3 0.94  hit@6 0.94
// The hybrid floors sit just under today's level: losing one question
// fails CI.

const keywordRuns = () => EVAL_QUESTIONS.map((question) => ({ question, ranked: selectChatSources(question.q, question.stage) }));

describe('search eval: keyword-only (runs everywhere)', () => {
  it('every expected topic exists in the library', () => {
    const ids = new Set(getLibrary().topics.map((t) => t.id));
    const missing = [...EVAL_QUESTIONS, ...DRUG_PREGNANCY_QUESTIONS, ...MIXED_MEDICINE_QUESTIONS].flatMap((q) => q.topics).filter((t) => !ids.has(t));
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
    expect(hybrid.hitAt3).toBeGreaterThanOrEqual(0.9);
    expect(hybrid.hitAt6).toBeGreaterThanOrEqual(0.93);
  }, 60_000);

  const runSet = async (questions: EvalQuestion[]) => {
    const runs = [];
    for (const question of questions) {
      runs.push({ question, ranked: await selectChatSourcesHybrid(question.q, question.stage, { timeoutMs: 20_000 }) });
    }
    return scoreRuns(runs);
  };

  // Was 3 of 5 (both paracetamol questions missed) until topic-label
  // examples stopped counting as strong matches and a named medicine in the
  // title started to outrank a shared topic. Every question must hit now.
  it('medicine + pregnancy questions find the drug-specific studies', async () => {
    const r = await runSet(DRUG_PREGNANCY_QUESTIONS);
    console.log(`drug + pregnancy eval: hybrid hit@3 ${r.hitAt3.toFixed(2)} hit@6 ${r.hitAt6.toFixed(2)}; misses@3: ${r.misses3.join(' | ')}`);
    expect(r.hitAt3).toBe(1);
    expect(r.hitAt6).toBe(1);
  }, 60_000);

  // Sertraline + breastfeeding, iron tablets, HRT + breast cancer,
  // metformin + PCOS, folic acid dose (was 3 of 5 at hit@3 before the fix).
  it('mixed named-medicine questions find studies about that medicine', async () => {
    const r = await runSet(MIXED_MEDICINE_QUESTIONS);
    console.log(`mixed medicine eval: hybrid hit@3 ${r.hitAt3.toFixed(2)} hit@6 ${r.hitAt6.toFixed(2)}; misses@3: ${r.misses3.join(' | ')}`);
    expect(r.hitAt3).toBe(1);
    expect(r.hitAt6).toBe(1);
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
