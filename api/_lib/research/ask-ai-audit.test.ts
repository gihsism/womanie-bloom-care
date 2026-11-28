import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { demotedIds, getLibrary, selectChatSources, SUPERSEDED, SWISS_SOURCE_FACTOR } from './library';
import { selectChatSourcesHybrid } from './hybrid';
import { DEFAULT_EMBEDDING_MODEL, EMBEDDING_MODELS, modelFile } from './embed';

// Ask AI answer audit, research round 7 (docs/research-gaps.md): which
// library items the chat sends for everyday questions, run offline with
// the bundled model. These pin the fixes: Swiss sources first where one
// exists, the current guideline ahead of the replaced one, and the items
// that answer the question among the sources sent.

const BAG_VACCINES = 'gp-bag-schweizerischer-impfplan-bd22fa';
const BAG_HPV = 'gp-bag-humane-papillomaviren-hpv-d8e9aa';
const BLV_PREGNANCY = 'gp-blv-ernaehrung-schwangere-und-stillende-d179e9';
const SGGG_GDM = 'gp-sggg-screening-und-management-der-gestationsd-cec2b3';

describe('Ask AI audit round 7: library data and ranking rules', () => {
  const lib = getLibrary();
  const byId = new Map(lib.items.map((i) => [i.id, i]));

  it('the 2023 ACP osteoporosis guideline is in and the 2017 version steps back', () => {
    expect(byId.get('pmid-36592456')?.year).toBe(2023);
    expect(SUPERSEDED['pmid-28492856']).toBe('pmid-36592456');
    expect(demotedIds(lib.items).has('pmid-28492856')).toBe(true);
  });

  it('the BAG HPV item is a hand-written Swiss summary with the BAG ages and doses', () => {
    const it = byId.get(BAG_HPV)!;
    expect(it.tags).toContain('switzerland');
    expect(it.keyPoints.join(' ')).toMatch(/11 to 14/);
    expect(it.keyPoints.join(' ')).toMatch(/15 to 26/);
    expect(it.keyPoints.join(' ')).toMatch(/two injections six months apart/);
  });

  it('Swiss items get a modest lift only', () => {
    expect(SWISS_SOURCE_FACTOR).toBeGreaterThan(1);
    expect(SWISS_SOURCE_FACTOR).toBeLessThanOrEqual(1.25);
  });

  it('keyword retrieval: Swiss items do not take over unrelated questions', () => {
    for (const [q, stage] of [
      ['Is coffee safe in pregnancy?', 'pregnancy'],
      ['How often should I have a cervical smear?', null],
      ['Does the pill increase blood clot risk?', 'contraception'],
      ['What are the warning signs of OHSS?', 'ivf'],
    ] as const) {
      expect(selectChatSources(q, stage)[0]?.id ?? '', q).toMatch(/^pmid-/);
    }
  });
});

const hasModel = existsSync(modelFile(EMBEDDING_MODELS[DEFAULT_EMBEDDING_MODEL], 'onnx/model_quantized.onnx'));

describe.skipIf(!hasModel)('Ask AI audit round 7: sources the chat sends (bundled model)', () => {
  const sources = async (q: string, stage: string | null) =>
    (await selectChatSourcesHybrid(q, stage, { timeoutMs: 20_000 })).map((i) => i.id);

  it.each([
    ['Should I get the whooping cough vaccine in pregnancy?', 'pregnancy', BAG_VACCINES],
    ['What is gestational diabetes and how is it tested?', 'pregnancy', SGGG_GDM],
    ['When should girls get the HPV vaccine?', 'pre-menstrual', BAG_HPV],
    ['How to prevent osteoporosis after menopause?', 'post-menopause', 'pmid-36592456'],
  ] as const)('%s -> first source %s', async (q, stage, id) => {
    expect((await sources(q, stage))[0]).toBe(id);
  }, 30_000);

  it.each([
    ['Does folic acid need to start before pregnancy?', 'conception', BLV_PREGNANCY],
    ['Natural remedies for hot flashes', 'menopause', 'pmid-37252752'], // NAMS 2023: herbal remedies not recommended
    ['Can I use contraception after 40?', 'contraception', 'pmid-40838950'],
  ] as const)('%s -> %s among the sources sent', async (q, stage, id) => {
    expect(await sources(q, stage)).toContain(id);
  }, 30_000);

  it('the replaced 2017 ACP guideline is not sent next to the 2023 one', async () => {
    expect(await sources('How to prevent osteoporosis after menopause?', 'post-menopause')).not.toContain('pmid-28492856');
  }, 30_000);

  it('the Swiss lift needs a subject word, not just "pregnant"', async () => {
    // Before the subject-word rule the vaccination schedule rode in on "pregnant".
    expect(await sources('Can I eat soft cheese when pregnant?', 'pregnancy')).not.toContain(BAG_VACCINES);
  }, 30_000);

  it('the HPV vaccine item does not answer a smear-test question', async () => {
    expect(await sources('How often should I have a cervical smear?', null)).not.toContain(BAG_HPV);
  }, 30_000);
});
