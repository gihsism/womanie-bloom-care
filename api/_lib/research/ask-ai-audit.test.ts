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
      // Round 8: the smear question now has its own Swiss source (SGGG
      // letter 97), so it is no longer an "unrelated" question here.
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

// Round 8 (docs/research-gaps.md): the round-7 open topics now have
// sources: FSRH / CDC for missed pills, migraine with aura and typical-use
// effectiveness, FIGO for normal cycle length, thyroid and amenorrhoea
// reviews, postpartum running consensus, HFEA birth rates by age, and the
// Swiss cervical (SGGG letter 97) and breast screening (KLV Art. 12e) rules.
const FSRH_CHC = 'gp-fsrh-fsrh-guideline-combined-hormonal-contrac-4c670a';
const CDC_MISSED = 'gp-cdc-combined-hormonal-contraceptives-html-41d76f';
const FIGO_NORMAL = 'gp-figo-ijgo-14946-96b114';
const HFEA_2024 = 'gp-hfea-fertility-treatment-2024-trends-and-figu-7b731e';
const SGGG_CERVICAL = 'gp-sggg-97-empfehlungen-fuer-die-gebaermutterhal-200014';
const KLV_SCREENING = 'gp-fedlex-de-2ed90a';

describe('Ask AI audit round 8: library data', () => {
  const lib = getLibrary();
  const byId = new Map(lib.items.map((i) => [i.id, i]));
  const text = (id: string) => {
    const it = byId.get(id)!;
    return [it.summary, ...it.keyPoints].join(' ');
  };

  it('the new hand-written sources carry the figures the answers need', () => {
    expect(text(FSRH_CHC)).toMatch(/about 0\.3% .*about 9%/);
    expect(text(FSRH_CHC)).toMatch(/UKMEC 4/);
    expect(text(CDC_MISSED)).toMatch(/7 hormone pills in a row/);
    expect(text(FIGO_NORMAL)).toMatch(/24 to 38 days/);
    expect(text(HFEA_2024)).toMatch(/38% for women aged 18 to 34/);
    expect(text(SGGG_CERVICAL)).toMatch(/every 3 years from age 21 to 70/);
    expect(text(KLV_SCREENING)).toMatch(/every two years from the 50th birthday/);
  });

  it('only the Swiss items are tagged switzerland (no Swiss lift for FSRH, CDC, HFEA, FIGO)', () => {
    for (const id of [SGGG_CERVICAL, KLV_SCREENING]) expect(byId.get(id)?.tags).toContain('switzerland');
    for (const id of [FSRH_CHC, CDC_MISSED, FIGO_NORMAL, HFEA_2024]) expect(byId.get(id)?.tags).not.toContain('switzerland');
  });

  it('SGGG anti-D letter 94 replaced letter 68', () => {
    expect(lib.items.some((i) => i.id.startsWith('gp-sggg-empfehlungen-zur-anti-d'))).toBe(false);
    expect(lib.items.find((i) => i.id.startsWith('gp-sggg-94-'))?.year).toBe(2026);
  });

  it('new PubMed items are in', () => {
    for (const p of ['31482137', '20938101', '33613678', '38148108', '38191239', '31259490', '33687345', '28245088', '27018154', '29086160', '43058720', '21558332'])
      expect(byId.has(`pmid-${p}`), p).toBe(true);
  });
});

describe.skipIf(!hasModel)('Ask AI audit round 8: sources the chat sends (bundled model)', () => {
  const sources = async (q: string, stage: string | null) =>
    (await selectChatSourcesHybrid(q, stage, { timeoutMs: 20_000 })).map((i) => i.id);

  it.each([
    ['I forgot to take my pill yesterday, what should I do?', 'contraception', CDC_MISSED],
    ['What should I do if I forget a pill?', 'contraception', CDC_MISSED],
    ['How effective is the pill with typical use?', 'contraception', FSRH_CHC],
    ['What is a normal cycle length?', 'menstrual-cycle', FIGO_NORMAL],
    ['What are IVF success rates by age?', 'ivf', HFEA_2024],
    ['When can I start running again after giving birth?', 'postpartum', 'pmid-38148108'],
    ['How often should I have a smear test in Switzerland?', null, SGGG_CERVICAL],
    ['Does insurance cover a mammogram from age 50 in Switzerland?', 'post-menopause', KLV_SCREENING],
  ] as const)('%s -> first source %s', async (q, stage, id) => {
    expect((await sources(q, stage))[0]).toBe(id);
  }, 30_000);

  it.each([
    ['Can I take the combined pill if I have migraine with aura?', 'contraception', FSRH_CHC],
    ['Can I take the combined pill if I have migraine with aura?', 'contraception', 'pmid-29086160'],
    ['Which contraception is the most effective in real life?', 'contraception', 'pmid-28245088'],
    ['Can thyroid problems affect my period?', 'menstrual-cycle', 'pmid-20938101'],
    ['My daughter is 15 and has not had her period yet, should we see a doctor?', 'pre-menstrual', 'pmid-33687345'],
    ['Does Swiss health insurance pay for the HPV test?', null, KLV_SCREENING],
  ] as const)('%s -> %s among the sources sent', async (q, stage, id) => {
    expect(await sources(q, stage)).toContain(id);
  }, 30_000);

  it('the missed-pill item does not lead a morning-after pill question', async () => {
    expect((await sources('How does the morning after pill work and until when?', 'contraception'))[0]).not.toBe(CDC_MISSED);
  }, 30_000);
});
