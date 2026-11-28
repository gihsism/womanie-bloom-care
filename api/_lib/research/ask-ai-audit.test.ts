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
    // Round 9: the Swiss BFS IVF figures now lead (they say no Swiss rates
    // by age exist); the HFEA rates by age stay among the sources.
    ['What are IVF success rates by age?', 'ivf', HFEA_2024],
  ] as const)('%s -> %s among the sources sent', async (q, stage, id) => {
    expect(await sources(q, stage)).toContain(id);
  }, 30_000);

  it('the missed-pill item does not lead a morning-after pill question', async () => {
    expect((await sources('How does the morning after pill work and until when?', 'contraception'))[0]).not.toBe(CDC_MISSED);
  }, 30_000);
});

// Round 9 (docs/research-gaps.md): weaker matches from round 8 fixed
// (SUBJECT_MISMATCH: cervical-screening titles step back for breast or
// vaccine questions; FIGO no longer tagged heavy-bleeding), plus the Swiss
// cantonal breast-screening programmes and the BFS IVF figures.
const SCS_CANTONS = 'gp-swiss-teilnahme-e165b7';
const BFS_IVF = 'gp-bfs-reproduktive-perinatale-gesundheit-6ec7c0';

describe('Ask AI audit round 9: library data and ranking rules', () => {
  const lib = getLibrary();
  const byId = new Map(lib.items.map((i) => [i.id, i]));
  const text = (id: string) => {
    const it = byId.get(id)!;
    return [it.summary, ...it.keyPoints].join(' ');
  };

  it('the canton item names the 18 programme cantons and the 8 without', () => {
    const t = text(SCS_CANTONS);
    for (const c of ['Aargau', 'Bern', 'Geneva', 'Lucerne', 'Ticino', 'Vaud', 'Basel-Landschaft']) expect(t).toContain(c);
    expect(t).toMatch(/Zurich, Schaffhausen, Zug, Glarus, Schwyz, Uri, Obwalden and Nidwalden had no programme/);
    expect(t).toMatch(/about 20 francs/);
    expect(byId.get(SCS_CANTONS)?.tags).toContain('switzerland');
  });

  it('the BFS item carries the 2024 Swiss figures and says there are no rates by age', () => {
    const t = text(BFS_IVF);
    expect(t).toMatch(/6,533 women/);
    expect(t).toMatch(/2,475 babies/);
    expect(t).toMatch(/do not show success rates by the woman's age/);
    expect(byId.get(BFS_IVF)?.topics).not.toContain('age-fertility');
  });

  it('FIGO System 1 is no longer filed under heavy bleeding', () => {
    expect(byId.get(FIGO_NORMAL)?.topics).not.toContain('heavy-bleeding');
  });

  it('keyword retrieval: the cervical letter steps back for breast and vaccine questions', () => {
    for (const [q, stage] of [
      ['Is there a breast cancer screening programme in my canton?', 'menopause'],
      ['Does insurance cover a mammogram from age 50 in Switzerland?', 'post-menopause'],
      ['Is the HPV vaccine free in Switzerland?', null],
      ['When should girls get the HPV vaccine?', 'pre-menstrual'],
    ] as const) {
      expect(selectChatSources(q, stage).map((i) => i.id), q).not.toContain(SGGG_CERVICAL);
    }
    // ...but still leads its own question.
    expect(selectChatSources('How often should I have a smear test in Switzerland?', null)[0]?.id).toBe(SGGG_CERVICAL);
  });
});

describe.skipIf(!hasModel)('Ask AI audit round 9: sources the chat sends (bundled model)', () => {
  const sources = async (q: string, stage: string | null) =>
    (await selectChatSourcesHybrid(q, stage, { timeoutMs: 20_000 })).map((i) => i.id);

  it.each([
    ['Is there a breast cancer screening programme in my canton?', 'menopause', SCS_CANTONS],
    ['I live in Zurich, can I get a free mammogram?', 'menopause', SCS_CANTONS],
    ['Does insurance cover a mammogram from age 50 in Switzerland?', 'post-menopause', KLV_SCREENING],
    ['What are IVF success rates in Switzerland?', 'ivf', BFS_IVF],
    ['When should girls get the HPV vaccine?', 'pre-menstrual', BAG_HPV],
  ] as const)('%s -> first source %s', async (q, stage, id) => {
    expect((await sources(q, stage))[0]).toBe(id);
  }, 30_000);

  it.each([
    ['When should I start mammograms in Switzerland?', 'post-menopause'],
    ['Does insurance cover a mammogram from age 50 in Switzerland?', 'post-menopause'],
    ['Is there a breast cancer screening programme in my canton?', 'menopause'],
    ['When should girls get the HPV vaccine?', 'pre-menstrual'],
    ['Is the HPV vaccine free in Switzerland?', null],
  ] as const)('%s -> the cervical letter is not sent', async (q, stage) => {
    expect(await sources(q, stage)).not.toContain(SGGG_CERVICAL);
  }, 30_000);

  it('heavy-period questions no longer get the FIGO normal-cycle item', async () => {
    expect(await sources('Why are my periods so heavy?', 'menstrual-cycle')).not.toContain(FIGO_NORMAL);
  }, 30_000);

  it('the cervical letter still leads the smear question', async () => {
    expect((await sources('How often should I have a cervical smear?', null))[0]).toBe(SGGG_CERVICAL);
  }, 30_000);
});

describe('Research round 9: superseded-guideline sweep', () => {
  const lib = getLibrary();
  const byId = new Map(lib.items.map((i) => [i.id, i]));
  const demoted = demotedIds(lib.items);
  const PAIRS: [string, string][] = [
    ['pmid-26334606', 'pmid-35691683'],
    ['pmid-28625286', 'pmid-40216328'],
    ['pmid-29080721', 'pmid-38049282'],
    ['pmid-26637088', 'pmid-39581327'],
    ['pmid-25711406', 'pmid-33529414'],
    ['pmid-29566854', 'pmid-38762806'],
    ['pmid-27235766', 'pmid-38556964'],
    ['pmid-27008889', 'pmid-39652037'],
    ['pmid-30801477', 'pmid-33595252'],
    ['pmid-30575675', 'pmid-32443079'],
    ['pmid-37641884', 'pmid-40717224'],
    ['pmid-26344176', 'pmid-39163015'],
    ['pmid-26389730', 'pmid-33464343'],
    ['pmid-28097362', 'pmid-37526713'],
    ['pmid-28444286', 'pmid-37721605'],
    ['pmid-29710141', 'pmid-38833246'],
    ['pmid-25585505', 'pmid-33280722'],
    ['pmid-30659131', 'pmid-41671440'],
    ['pmid-28937568', 'pmid-32332417'],
    ['pmid-26598775', 'pmid-31940155'],
  ];

  it.each(PAIRS)('%s steps back for the newer %s', (old, newer) => {
    expect(SUPERSEDED[old]).toBe(newer);
    expect(byId.get(newer)!.year).toBeGreaterThan(byId.get(old)!.year);
    expect(demoted.has(old)).toBe(true);
    expect(demoted.has(newer)).toBe(false);
  });

  it('every SUPERSEDED target is in the library and is not itself superseded', () => {
    for (const [old, newer] of Object.entries(SUPERSEDED)) {
      expect(byId.has(old), old).toBe(true);
      expect(byId.has(newer), newer).toBe(true);
      expect(SUPERSEDED[newer], newer).toBeUndefined();
    }
  });

  it('keyword retrieval prefers the current version', () => {
    const ids = (q: string, s: string | null) => selectChatSources(q, s).map((i) => i.id);
    const a = ids('How much folic acid should I take before pregnancy?', 'conception');
    expect(a).toContain('pmid-37526713');
    if (a.includes('pmid-28097362')) expect(a.indexOf('pmid-37526713')).toBeLessThan(a.indexOf('pmid-28097362'));
    const b = ids('Should my blood pressure be checked in pregnancy for pre-eclampsia?', 'pregnancy');
    if (b.includes('pmid-28444286')) expect(b.indexOf('pmid-37721605')).toBeLessThan(b.indexOf('pmid-28444286'));
  });
});

// Round 10 (docs/research-gaps.md): leaking asked without any word about
// an operation; surgery reviews step back behind pelvic-floor training.
const PFMT = ['pmid-32378735', 'pmid-30288727', 'pmid-29271473', 'pmid-38556125', 'pmid-37849316'];
const SLING = 'pmid-31990055';
const SNEEZE = 'I leak a bit of pee when I sneeze since giving birth';
const SURGERY_TITLE = /\b(surg\w*|operat\w*|sling\w*|mesh|repairs?)\b/i;
const titleOf = (id: string) => getLibrary().items.find((i) => i.id === id)?.title ?? '';

describe('Research round 10: pelvic-floor training ahead of surgery reviews', () => {
  const lib = getLibrary();
  const byId = new Map(lib.items.map((i) => [i.id, i]));

  it('the sling review no longer carries the everyday "cough sneeze leak" keyword', () => {
    expect(byId.get(SLING)!.keywords).not.toContain('cough sneeze leak');
    expect(byId.get('pmid-30288727')!.keywords).toContain('leak when I sneeze');
  });

  it('keyword retrieval: no surgery review for the sneeze question, training first', () => {
    const ids = selectChatSources(SNEEZE, 'postpartum').map((i) => i.id);
    expect(PFMT).toContain(ids[0]);
    expect(ids.some((id) => SURGERY_TITLE.test(titleOf(id)))).toBe(false);
    expect(ids.filter((id) => PFMT.includes(id)).length).toBeGreaterThanOrEqual(4);
  });

  it('keyword retrieval: asked about surgery, the sling reviews still come up', () => {
    const ids = selectChatSources('What surgery is there for bladder leaks?', null).map((i) => i.id);
    expect(ids).toContain(SLING);
    expect(ids).toContain('pmid-28756647');
  });
});

describe.skipIf(!hasModel)('Research round 10: sneeze question (bundled model)', () => {
  const sources = async (q: string, stage: string | null) =>
    (await selectChatSourcesHybrid(q, stage, { timeoutMs: 20_000 })).map((i) => i.id);

  it('pelvic-floor training leads and no surgery review is sent', async () => {
    const ids = await sources(SNEEZE, 'postpartum');
    expect(PFMT).toContain(ids[0]);
    expect(ids.some((id) => SURGERY_TITLE.test(titleOf(id)))).toBe(false);
    expect(ids.filter((id) => PFMT.includes(id)).length).toBeGreaterThanOrEqual(3);
  }, 30_000);

  it('the surgery question still gets the sling reviews', async () => {
    expect(await sources('What surgery is there for bladder leaks?', null)).toContain(SLING);
  }, 30_000);
});

// Round 11 (docs/research-gaps.md): 167 new everyday questions. Where the
// first source was off-topic, or a Swiss source existed but was not first,
// the fix is pinned here: five SUBJECT_MISMATCH rules, keywords, and two
// new PubMed items (SMFM #53 on cholestasis of pregnancy, return of
// fertility after contraception).
const BAG_MATERNITY = 'gp-bag-krankenversicherung-leistungen-bei-mutte-0036e3';
const SGGG_GBS = 'gp-sggg-86-prophylaxe-gbs-sepsis-des-neugeborene-52360b';
const FEDLEX_SCREENING = KLV_SCREENING;
const SMFM_ICP = 'pmid-33197417';
const FERTILITY_AFTER = 'pmid-30062044';
const TNBC_RISK = 'pmid-38445713';
const VBAC = ['pmid-40728304', 'pmid-30681543'];

describe('Research round 11: library data and ranking rules', () => {
  const lib = getLibrary();
  const byId = new Map(lib.items.map((i) => [i.id, i]));

  it('the two new items are in, with their sources and no fertility-wide keywords', () => {
    expect(byId.get(SMFM_ICP)!.keyPoints.join(' ')).toMatch(/100 micromol\/L or more: birth offered at 36 weeks/);
    expect(byId.get(SMFM_ICP)!.keywords).toContain('itching on hands and feet');
    expect(byId.get(FERTILITY_AFTER)!.keyPoints.join(' ')).toMatch(/About 83% became pregnant within 12 months/);
    expect(byId.get(FERTILITY_AFTER)!.keywords).not.toContain('trying to conceive');
  });

  it('keyword retrieval: Swiss BLV leads the raw-milk cheese question', () => {
    expect(selectChatSources('Can I eat Rohmilchkäse (raw milk cheese) in pregnancy?', 'pregnancy')[0]?.id).toBe(BLV_PREGNANCY);
  });

  it('keyword retrieval: cervical letter and GBS letter stay out of an STI test question', () => {
    const ids = selectChatSources('Chlamydia test, how often should young women get one?', null).map((i) => i.id);
    expect(ids).toContain('pmid-34292926');
    expect(ids).not.toContain(SGGG_CERVICAL);
    expect(ids).not.toContain(SGGG_GBS);
  });

  it('keyword retrieval: the new items and the VBAC guidance answer their questions', () => {
    expect(selectChatSources('Itching on hands and feet in pregnancy', 'pregnancy')[0]?.id).toBe(SMFM_ICP);
    expect(selectChatSources('How long after stopping the pill can I get pregnant?', 'conception')[0]?.id).toBe(FERTILITY_AFTER);
    expect(VBAC).toContain(selectChatSources('Can I have a vaginal birth after a caesarean?', 'pregnancy')[0]?.id);
  });

  it('the rules leave the questions they are not about alone', () => {
    expect(selectChatSources('How often should I have a cervical smear?', null)[0]?.id).toBe(SGGG_CERVICAL);
    expect(selectChatSources('Does the Krankenkasse pay for a midwife (Hebamme) after birth?', 'postpartum')[0]?.id).toBe(BAG_MATERNITY);
    expect(selectChatSources('What does the Krankenkasse pay in pregnancy?', 'pregnancy')[0]?.id).toBe(BAG_MATERNITY);
    expect(selectChatSources('Does breastfeeding lower breast cancer risk?', null).map((i) => i.id)).toContain(TNBC_RISK);
  });
});

describe.skipIf(!hasModel)('Research round 11: sources the chat sends (bundled model)', () => {
  const sources = async (q: string, stage: string | null) =>
    (await selectChatSourcesHybrid(q, stage, { timeoutMs: 20_000 })).map((i) => i.id);

  it.each([
    ['Can I eat Rohmilchkäse (raw milk cheese) in pregnancy?', 'pregnancy', BLV_PREGNANCY],
    ['Chlamydia test, how often should young women get one?', null, 'pmid-34292926'],
    ['Does the Krankenkasse pay the yearly gynaecology check-up?', null, FEDLEX_SCREENING],
    ['Can I have a vaginal birth after a caesarean?', 'pregnancy', 'pmid-40728304'],
    ['Itching on hands and feet in pregnancy', 'pregnancy', SMFM_ICP],
    ['How long after stopping the pill can I get pregnant?', 'conception', FERTILITY_AFTER],
    ['When will my period come back after birth?', 'postpartum', 'pmid-26457821'],
    ['Can I get pregnant in perimenopause?', 'menopause', 'pmid-40838950'],
    ['Is the pill safe while breastfeeding?', 'postpartum', 'pmid-25793657'],
    ['Does my baby need vitamin D drops?', 'postpartum', 'pmid-33305822'],
  ] as const)('%s -> first source %s', async (q, stage, id) => {
    expect((await sources(q, stage))[0]).toBe(id);
  }, 30_000);

  it('off-topic sources that used to come first are gone', async () => {
    expect(await sources('Is the pill safe while breastfeeding?', 'postpartum')).not.toContain(TNBC_RISK);
    expect(await sources('How long after stopping the pill can I get pregnant?', 'conception')).not.toContain('pmid-35877546');
    const sti = await sources('Chlamydia test, how often should young women get one?', null);
    expect(sti).not.toContain(SGGG_CERVICAL);
    expect(sti).not.toContain(SGGG_GBS);
    expect(await sources('What blood tests check for PCOS?', 'menstrual-cycle')).not.toContain(SGGG_CERVICAL);
  }, 60_000);

  it('the smear and midwife-cover questions keep their Swiss sources first', async () => {
    expect((await sources('How often should I have a cervical smear?', null))[0]).toBe(SGGG_CERVICAL);
    expect((await sources('Does the Krankenkasse pay for a midwife (Hebamme) after birth?', 'postpartum'))[0]).toBe(BAG_MATERNITY);
  }, 60_000);
});

// Round 12 (docs/research-gaps.md): the Swiss gaps of round 11 get official
// sources (BAG fact sheet on fertility-treatment cover, FMedG, the Federal
// Council answer on contraception costs, KVG, EOG, ArG), topics that had
// nothing get PubMed / NHS items (toxic shock syndrome, breech, home birth,
// night cramps, the pill and libido, fertility apps), and four
// SUBJECT_MISMATCH rules keep the law items off health questions.
const BAG_FERTILITY_COVER = 'gp-bag-faktenblatt-20fortpflanzungsmedizingeset-71d92f';
const FMEDG = 'gp-fedlex-de-acd179';
const FC_CONTRACEPTION = 'gp-swiss-geschaeft-4394ba';
const KVG_MEDICINES = 'gp-fedlex-de-650685';
const EOG_MATERNITY = 'gp-fedlex-de-011006';
const ARG_WORK = 'gp-fedlex-de-e2cb60';
const NHS_TSS = 'gp-nhs-toxic-shock-syndrome-bbfbe9';
const TSS_REVIEW = 'pmid-32461307';
const CUP_REVIEW = 'pmid-31324419';
const ECV = 'pmid-25828903';
const HOME_BIRTH = ['pmid-36884026', 'pmid-31709403', 'pmid-28333817'];
const CRAMPS = ['pmid-32956536', 'pmid-34247796', 'pmid-33275278'];
const LIBIDO = ['pmid-31521571', 'pmid-38515302'];
const APPS = ['pmid-38106802', 'pmid-41849976'];

describe('Research round 12: library data', () => {
  const lib = getLibrary();
  const byId = new Map(lib.items.map((i) => [i.id, i]));
  const text = (id: string) => [byId.get(id)!.summary, ...byId.get(id)!.keyPoints].join(' ');

  it('the Swiss items state the rules they were added for', () => {
    expect(text(BAG_FERTILITY_COVER)).toMatch(/12 cycles or one year/);
    expect(text(BAG_FERTILITY_COVER)).toMatch(/Not covered: IVF/);
    expect(text(FMEDG)).toMatch(/up to 5 years, extended on request by up to 5 more \(10 years in total\)/);
    expect(text(FMEDG)).toMatch(/Egg donation, embryo donation and surrogacy are banned/);
    expect(text(FC_CONTRACEPTION)).toMatch(/does not pay for contraceptive pills or IUDs/);
    expect(text(KVG_MEDICINES)).toMatch(/whether a given product is paid depends on whether it is on the list/);
    expect(text(EOG_MATERNITY)).toMatch(/starts on the day of the birth/);
    expect(text(EOG_MATERNITY)).toMatch(/98 days in a row \(14 weeks\), at 80% of average earnings, up to 220 francs/);
    expect(text(ARG_WORK)).toMatch(/No work in the 8 weeks after the birth/);
  });

  it('the law items carry their own law name and the parliament source its publisher', () => {
    expect(byId.get(FMEDG)!.publicationTypes).toEqual(['Swiss federal law (FMedG)']);
    expect(byId.get(FC_CONTRACEPTION)!.source).toBe('Swiss Parliament');
    for (const id of [BAG_FERTILITY_COVER, FMEDG, FC_CONTRACEPTION, KVG_MEDICINES, EOG_MATERNITY, ARG_WORK]) expect(byId.get(id)!.tags).toContain('switzerland');
    expect(byId.get(NHS_TSS)!.tags).not.toContain('switzerland');
  });

  it('the new PubMed items are in, hedged to their grading', () => {
    expect(byId.get(ECV)!.certainty).toBe('very low');
    expect(text(ECV)).toMatch(/very low-certainty evidence/);
    expect(text('pmid-32956536')).toMatch(/probably makes little or no difference/);
    for (const id of [TSS_REVIEW, CUP_REVIEW, ...HOME_BIRTH, ...CRAMPS, ...LIBIDO, ...APPS]) expect(byId.has(id)).toBe(true);
  });
});

describe('Research round 12: keyword retrieval and ranking rules', () => {
  const first = (q: string, stage: string | null) => selectChatSources(q, stage)[0]?.id;
  const ids = (q: string, stage: string | null) => selectChatSources(q, stage).map((i) => i.id);

  it.each([
    ['Does the Krankenkasse pay fertility tests in Switzerland?', 'conception', BAG_FERTILITY_COVER],
    ['Does the Krankenkasse pay for IVF in Switzerland?', 'ivf', BAG_FERTILITY_COVER],
    ['Is the copper IUD paid by the Krankenkasse?', 'contraception', FC_CONTRACEPTION],
    ['Does the Krankenkasse pay for HRT?', 'menopause', KVG_MEDICINES],
    ['Is egg freezing legal in Switzerland and how long can eggs be stored?', 'ivf', FMEDG],
    ['Is egg donation allowed in Switzerland?', 'ivf', FMEDG],
    ['When does maternity leave start in Switzerland?', 'pregnancy', EOG_MATERNITY],
    ['Can I work night shifts while pregnant?', 'pregnancy', ARG_WORK],
    ['Is it safe for teenagers to sleep with a tampon?', 'pre-menstrual', NHS_TSS],
    ['Breech baby at 34 weeks, what are my options?', 'pregnancy', ECV],
    ['Are fertility apps reliable for avoiding or getting pregnant?', 'conception', 'pmid-38106802'],
  ] as const)('%s -> first source %s', (q, stage, id) => {
    expect(first(q, stage)).toBe(id);
  });

  it('topics that had nothing get an on-topic first source', () => {
    expect([NHS_TSS, TSS_REVIEW]).toContain(first('Toxic shock syndrome from tampons, how rare is it?', 'menstrual-cycle'));
    expect(HOME_BIRTH).toContain(first('Is a home birth safe?', 'pregnancy'));
    expect(CRAMPS).toContain(first('Should I take magnesium for cramps at night?', null));
    expect(LIBIDO).toContain(first('Does the pill cause low libido?', 'contraception'));
  });

  it('the law items step back from health questions without a legal, insurance or work word', () => {
    expect(first('How does age affect egg freezing success?', 'ivf')).not.toBe(FMEDG);
    expect(ids('Can I exercise during IVF stimulation?', 'ivf')).not.toContain(BAG_FERTILITY_COVER);
    expect(first('Does the Pille danach (morning after pill) need a prescription in Switzerland?', 'contraception')).not.toBe(FC_CONTRACEPTION);
    expect(ids('How long can I stay on HRT?', 'menopause')).not.toContain(KVG_MEDICINES);
    expect(ids('How many ultrasounds are covered in pregnancy in Switzerland?', 'pregnancy')).not.toContain(EOG_MATERNITY);
  });
});

describe.skipIf(!hasModel)('Research round 12: sources the chat sends (bundled model)', () => {
  const sources = async (q: string, stage: string | null) =>
    (await selectChatSourcesHybrid(q, stage, { timeoutMs: 20_000 })).map((i) => i.id);

  it.each([
    ['Does the Krankenkasse pay fertility tests in Switzerland?', 'conception', BAG_FERTILITY_COVER],
    ['Does the Krankenkasse pay for IVF in Switzerland?', 'ivf', BAG_FERTILITY_COVER],
    ['Is the copper IUD paid by the Krankenkasse?', 'contraception', FC_CONTRACEPTION],
    ['Does the Krankenkasse pay for HRT?', 'menopause', KVG_MEDICINES],
    ['Is egg freezing legal in Switzerland and how long can eggs be stored?', 'ivf', FMEDG],
    ['Is egg donation allowed in Switzerland?', 'ivf', FMEDG],
    ['When does maternity leave start in Switzerland?', 'pregnancy', EOG_MATERNITY],
    ['Toxic shock syndrome from tampons, how rare is it?', 'menstrual-cycle', NHS_TSS],
    ['Is it safe for teenagers to sleep with a tampon?', 'pre-menstrual', NHS_TSS],
    ['Breech baby at 34 weeks, what are my options?', 'pregnancy', ECV],
    ['Is a home birth safe?', 'pregnancy', 'pmid-36884026'],
    ['Should I take magnesium for cramps at night?', null, 'pmid-32956536'],
    ['Does the pill cause low libido?', 'contraception', 'pmid-31521571'],
    ['Are fertility apps reliable for avoiding or getting pregnant?', 'conception', 'pmid-38106802'],
  ] as const)('%s -> first source %s', async (q, stage, id) => {
    expect((await sources(q, stage))[0]).toBe(id);
  }, 30_000);

  it('the law items stay off the health questions and the check-up question keeps its source', async () => {
    expect((await sources('How does age affect egg freezing success?', 'ivf'))[0]).not.toBe(FMEDG);
    expect(await sources('Can I exercise during IVF stimulation?', 'ivf')).not.toContain(BAG_FERTILITY_COVER);
    expect(await sources('Do ovulation tests work?', 'conception')).not.toContain(BAG_FERTILITY_COVER);
    expect((await sources('Does the Pille danach (morning after pill) need a prescription in Switzerland?', 'contraception'))[0]).not.toBe(FC_CONTRACEPTION);
    expect((await sources('Does the Krankenkasse pay the yearly gynaecology check-up?', null))[0]).toBe(FEDLEX_SCREENING);
    expect(await sources('Are fertility apps reliable for avoiding or getting pregnant?', 'conception')).not.toContain('pmid-33890288');
  }, 90_000);
});

// Round 13 (docs/research-gaps.md): the last 114 exposed PubMed items
// content-checked, off-topic fillers in the round-11 question set fixed
// (app, breast, thyroid and cancer-related SUBJECT_MISMATCH rules; app,
// ovulation and breastfeeding keywords; the asthma vitamin D review no
// longer tagged as baby vitamin D drops).
describe('Research round 13: library data', () => {
  const lib = getLibrary();
  const byId = new Map(lib.items.map((i) => [i.id, i]));
  const text = (id: string) => [byId.get(id)!.summary, ...byId.get(id)!.keyPoints].join(' ');

  it('summary fixes from the content check stay in', () => {
    expect(byId.get('pmid-27444983')!.certainty).toBe('not stated');
    expect(byId.get('pmid-39514962')!.certainty).toBe('not stated');
    expect(text('pmid-35587030')).toMatch(/probably/);
    expect(text('pmid-40238039')).toMatch(/linked to a higher risk/);
    expect(text('pmid-38110714')).toMatch(/in 21 young egg donors/);
    expect(text('pmid-41308919')).toMatch(/The guideline says/);
  });

  it('metadata fixes', () => {
    expect(byId.get('pmid-41849976')!.lifeStages).toContain('conception');
    expect(byId.get('pmid-36744416')!.lifeStages).toEqual(['general']);
    expect(byId.get('pmid-36744416')!.keywords).not.toContain('vitamin d drops');
    expect(byId.get('pmid-29863806')!.lifeStages).toContain('post-menopause');
  });
});

describe('Research round 13: keyword retrieval and ranking rules', () => {
  const ids = (q: string, stage: string | null) => selectChatSources(q, stage).map((i) => i.id);

  it('the fertility-apps question gets only app items', () => {
    expect(ids('Are fertility apps reliable for avoiding or getting pregnant?', 'conception').slice(0, 2)).toEqual(['pmid-38106802', 'pmid-41849976']);
  });

  it('ovulation timing questions reach the timing and ovulation-kit items', () => {
    expect(ids('How do I know when I ovulate?', 'conception').slice(0, 2)).toEqual(['pmid-37709293', 'pmid-31139458']);
    expect(ids('Best time to have sex to get pregnant', 'conception').slice(0, 2)).toEqual(['pmid-37709293', 'pmid-31139458']);
  });

  it('off-topic fillers step back', () => {
    expect(ids('Sore breasts before period every month', 'menstrual-cycle')).not.toContain('pmid-26172878');
    expect(ids('Joint pain in menopause, is it hormonal?', 'menopause')).not.toContain('pmid-36099656');
    expect(ids('Joint pain in menopause, is it hormonal?', 'menopause')).toContain('pmid-33299396');
    expect(ids('Does my baby need vitamin D drops?', 'postpartum')).not.toContain('pmid-36744416');
    expect(ids('Thyroid problems after giving birth', 'postpartum')).not.toContain('pmid-35613728');
  });

  it('the rules leave related questions alone', () => {
    expect(ids('Can thyroid antibodies cause miscarriage?', 'conception')).toContain('pmid-41176277');
    expect(ids('Breast lump, what should I do?', null)[0]).toBe('pmid-37236740');
    expect(ids('Is vaginal estrogen safe long term?', 'post-menopause')).toContain('pmid-39521301');
    expect(ids('Do period tracking apps work?', 'menstrual-cycle')[0]).toBe('pmid-38358798');
  });
});

describe.skipIf(!hasModel)('Research round 13: sources the chat sends (bundled model)', () => {
  const sources = async (q: string, stage: string | null) =>
    (await selectChatSourcesHybrid(q, stage, { timeoutMs: 20_000 })).map((i) => i.id);

  it('fertility apps: places 2 and 3 are the app review and fertility awareness, no antioxidant reviews', async () => {
    const s = await sources('Are fertility apps reliable for avoiding or getting pregnant?', 'conception');
    expect(s.slice(0, 3)).toEqual(['pmid-38106802', 'pmid-41849976', 'pmid-30095777']);
    for (const id of ['pmid-35506389', 'pmid-32851663', 'pmid-33914901']) expect(s).not.toContain(id);
  }, 30_000);

  it('fillers fixed in the round-11 question set', async () => {
    expect((await sources('How do I know when I ovulate?', 'conception')).slice(0, 2)).toEqual(['pmid-37709293', 'pmid-31139458']);
    expect((await sources('Best time to have sex to get pregnant', 'conception')).slice(0, 2)).toEqual(['pmid-37709293', 'pmid-31139458']);
    expect((await sources('Joint pain in menopause, is it hormonal?', 'menopause')).slice(0, 3)).toEqual(['pmid-41574523', 'pmid-41344380', 'pmid-33299396']);
    // Round 14: the two postpartum thyroiditis reviews now lead; iodine and ATA 2026 follow.
    expect((await sources('Thyroid problems after giving birth', 'postpartum')).slice(0, 4)).toEqual(['pmid-30844908', 'pmid-22443972', 'pmid-28260263', 'pmid-42219800']);
    expect((await sources('Can I get pregnant while breastfeeding?', 'postpartum')).slice(0, 2)).toEqual(['pmid-26457821', 'pmid-35716805']);
    expect(await sources('Does my baby need vitamin D drops?', 'postpartum')).not.toContain('pmid-36744416');
    expect((await sources('Thinning hair after menopause', 'post-menopause')).slice(0, 2)).toEqual(['pmid-27225981', 'pmid-29863806']);
    expect(await sources('Sore breasts before period every month', 'menstrual-cycle')).not.toContain('pmid-26172878');
  }, 120_000);
});

// Round 14 (docs/research-gaps.md): the four weak topics of round 13 get
// sources that answer them (NHS breast pain, NHS breast check, NHS ovarian
// cancer symptoms, two postpartum thyroiditis reviews, two breast pain
// reviews, a symptom review and the USPSTF screening statement), and two
// SUBJECT_MISMATCH rules keep them off questions without a cancer or
// breast word.
const NHS_BREAST_PAIN = 'gp-nhs-breast-pain-10c702';
const NHS_BREAST_CHECK = 'gp-nhs-how-to-check-your-breasts-or-chest-7925ce';
const NHS_OVARIAN = 'gp-nhs-symptoms-97b430';
const PPT = ['pmid-30844908', 'pmid-22443972'];
const BREAST_PAIN_REVIEWS = ['pmid-32138883', 'pmid-26541567'];
const OVARIAN_SYMPTOMS = 'pmid-26541098';
const USPSTF_OVARIAN = 'pmid-29450531';

describe('Research round 14: library data', () => {
  const lib = getLibrary();
  const byId = new Map(lib.items.map((i) => [i.id, i]));
  const text = (id: string) => [byId.get(id)!.summary, ...byId.get(id)!.keyPoints].join(' ');

  it('the NHS items state what they were added for', () => {
    expect(text(NHS_BREAST_PAIN)).toMatch(/up to two weeks before a period/);
    expect(text(NHS_BREAST_PAIN)).toMatch(/unlikely to be a sign of breast cancer/);
    expect(text(NHS_BREAST_CHECK)).toMatch(/common for breasts to be different sizes/);
    expect(text(NHS_OVARIAN)).toMatch(/12 or more times a month/);
    for (const id of [NHS_BREAST_PAIN, NHS_BREAST_CHECK, NHS_OVARIAN]) {
      expect(byId.get(id)!.source).toBe('NHS');
      expect(byId.get(id)!.page?.summariser).toBe('hand-written');
      expect(byId.get(id)!.tags).not.toContain('switzerland');
    }
  });

  it('the new PubMed items are in, with the figures of their abstracts', () => {
    expect(text(PPT[0])).toMatch(/about 5% of women/);
    expect(text(PPT[1])).toMatch(/1 to 3 months/);
    expect(text(PPT[1])).toMatch(/up to 6 months/);
    expect(text(OVARIAN_SYMPTOMS)).toMatch(/about 63%/);
    expect(byId.get(USPSTF_OVARIAN)!.certainty).toBe('moderate');
    expect(text(USPSTF_OVARIAN)).toMatch(/recommends against screening/);
    for (const id of [...PPT, ...BREAST_PAIN_REVIEWS, OVARIAN_SYMPTOMS]) expect(byId.get(id)!.certainty).toBe('not stated');
  });
});

describe('Research round 14: keyword retrieval and ranking rules', () => {
  const first = (q: string, stage: string | null) => selectChatSources(q, stage)[0]?.id;
  const ids = (q: string, stage: string | null) => selectChatSources(q, stage).map((i) => i.id);

  it.each([
    ['Sore breasts before period every month', 'menstrual-cycle', NHS_BREAST_PAIN],
    ['Is cyclical breast pain normal?', 'menstrual-cycle', NHS_BREAST_PAIN],
    ['One breast is bigger than the other, is that normal?', null, NHS_BREAST_CHECK],
    ['One breast growing faster than the other', 'pre-menstrual', NHS_BREAST_CHECK],
    ['Thyroid problems after giving birth', 'postpartum', PPT[0]],
    ['What is postpartum thyroiditis?', 'postpartum', PPT[0]],
    ['Bloating all the time, could it be ovarian cancer?', 'menopause', NHS_OVARIAN],
    ['Is there a screening test for ovarian cancer?', null, USPSTF_OVARIAN],
  ] as const)('%s (%s) -> first source %s', (q, stage, id) => {
    expect(first(q, stage)).toBe(id);
  });

  it('the new items stay off questions without a cancer or breast word', () => {
    for (const id of [NHS_OVARIAN, OVARIAN_SYMPTOMS, USPSTF_OVARIAN]) expect(ids('What are the warning signs of OHSS?', 'ivf')).not.toContain(id);
    for (const id of [NHS_BREAST_PAIN, NHS_BREAST_CHECK]) expect(ids('My daughter is 15 and has not had her period yet, should we see a doctor?', 'pre-menstrual')).not.toContain(id);
    expect(ids('Breast pain while breastfeeding, is it mastitis?', 'postpartum')).not.toContain(NHS_BREAST_CHECK);
  });

  it('related questions keep their sources', () => {
    expect(ids('Breast lump, what should I do?', null)[0]).toBe('pmid-37236740');
    expect(ids('What are the warning signs of OHSS?', 'ivf')[0]).toBe('pmid-41996998');
  });
});

describe.skipIf(!hasModel)('Research round 14: sources the chat sends (bundled model)', () => {
  const sources = async (q: string, stage: string | null) =>
    (await selectChatSourcesHybrid(q, stage, { timeoutMs: 20_000 })).map((i) => i.id);

  it.each([
    ['Sore breasts before period every month', 'menstrual-cycle', NHS_BREAST_PAIN],
    ['Why do my breasts hurt before my period?', null, NHS_BREAST_PAIN],
    ['Is cyclical breast pain normal?', 'menstrual-cycle', NHS_BREAST_PAIN],
    ['One breast is bigger than the other, is that normal?', null, NHS_BREAST_CHECK],
    ['One breast growing faster than the other', 'pre-menstrual', NHS_BREAST_CHECK],
    ['My breasts are uneven sizes, should I worry?', 'menstrual-cycle', NHS_BREAST_CHECK],
    ['What is postpartum thyroiditis?', 'postpartum', PPT[0]],
    ['Feeling anxious and losing weight a few months after birth, could it be my thyroid?', 'postpartum', PPT[0]],
    ['Bloating all the time, could it be ovarian cancer?', 'menopause', NHS_OVARIAN],
    ['Is there a screening test for ovarian cancer?', null, USPSTF_OVARIAN],
  ] as const)('%s (%s) -> first source %s', async (q, stage, id) => {
    expect((await sources(q, stage))[0]).toBe(id);
  }, 30_000);

  it('ovarian cancer warning signs: the symptom review and NHS lead; OHSS and late periods unchanged', async () => {
    expect((await sources('What are the warning signs of ovarian cancer?', null)).slice(0, 2).sort()).toEqual([OVARIAN_SYMPTOMS, NHS_OVARIAN].sort());
    expect(await sources('What are the warning signs of OHSS?', 'ivf')).toEqual(['pmid-41996998', 'pmid-26597569', 'pmid-27577848', 'pmid-28111738']);
    const late = await sources('My daughter is 15 and has not had her period yet, should we see a doctor?', 'pre-menstrual');
    for (const id of [NHS_BREAST_PAIN, NHS_BREAST_CHECK]) expect(late).not.toContain(id);
  }, 90_000);
});

// Round 14: 150 unchecked items picked by risk (numbers, doses, "safe",
// "recommend", "should", medicines in pregnancy or breastfeeding) checked
// against their abstracts. These pin the most serious fixes.
describe('Research round 14: risk-ranked content check', () => {
  const lib = getLibrary();
  const byId = new Map(lib.items.map((i) => [i.id, i]));
  const text = (id: string) => [byId.get(id)!.summary, ...byId.get(id)!.keyPoints].join(' ');

  it('figures and advice not in the abstract are gone', () => {
    expect(text('pmid-26637088')).not.toMatch(/4-8%|2\.3 planned caesareans|safely have a vaginal birth/);
    expect(text('pmid-39891165')).not.toMatch(/World Health Organization/);
    expect(text('pmid-38018434')).not.toMatch(/200 mg/);
  });

  it('results the summaries had left out or overstated are corrected', () => {
    expect(text('pmid-41640554')).toMatch(/zinc was linked to higher/);
    expect(text('pmid-26144877')).toMatch(/probably reduced newborn tetanus deaths/);
    expect(byId.get('pmid-26113232')!.summary).toMatch(/no clear difference/);
  });

  it('certainty labels the abstracts never gave are "not stated"', () => {
    for (const id of ['pmid-32619725', 'pmid-41596408', 'pmid-35636626', 'pmid-28390010', 'pmid-37788418']) expect(byId.get(id)!.certainty).toBe('not stated');
  });
});

// Round 15: the next 150 unchecked items with one risk word (mostly
// "safe", "should" or a medicine in pregnancy next to a number) checked
// against their abstracts. These pin the most serious fixes.
describe('Research round 15: one-risk-word content check', () => {
  const lib = getLibrary();
  const byId = new Map(lib.items.map((i) => [i.id, i]));
  const text = (id: string) => [byId.get(id)!.summary, ...byId.get(id)!.keyPoints].join(' ');

  it('overstated results are hedged or corrected', () => {
    expect(text('pmid-31200970')).not.toMatch(/clearly raised/);
    expect(text('pmid-30287313')).not.toMatch(/negative effect on male fertility was found/);
    expect(text('pmid-38140841')).not.toMatch(/worked whether done on its own/);
    expect(text('pmid-38593643')).not.toMatch(/The programs appeared to be safe/);
    expect(text('pmid-37581900')).toMatch(/linked to fewer clinical and ongoing pregnancies/);
  });

  it('"as effective" where the abstract found no clear difference', () => {
    expect(text('pmid-28205208')).not.toMatch(/about as effective as breastfeeding/);
    expect(byId.get('pmid-29909264')!.summary).toMatch(/no clear difference/);
  });

  it('certainty labels the abstracts never gave are "not stated"', () => {
    for (const id of ['pmid-37881498', 'pmid-37922258', 'pmid-29286987', 'pmid-40639456', 'pmid-37708365', 'pmid-33608901', 'pmid-32200197', 'pmid-34755503', 'pmid-27244847']) expect(byId.get(id)!.certainty).toBe('not stated');
  });
});

// Round 16: the remaining one-risk-word items (mostly "should" or
// "recommend" alone) and the first 100 plain-number items, pregnancy,
// breastfeeding, medicine and lab topics first, checked against abstracts.
describe('Research round 16: one-risk-word and plain-number content check', () => {
  const lib = getLibrary();
  const byId = new Map(lib.items.map((i) => [i.id, i]));
  const text = (id: string) => [byId.get(id)!.summary, ...byId.get(id)!.keyPoints].join(' ');

  it('wrong or overstated results are corrected', () => {
    expect(byId.get('pmid-33773630')!.summary).toMatch(/17-OHPC injections showed a similar trend/);
    expect(byId.get('pmid-35665911')!.summary).not.toMatch(/similar number of false alarms in most studies/);
    expect(byId.get('pmid-33368142')!.summary).not.toMatch(/received a single course/);
    expect(text('pmid-29376559')).not.toMatch(/\) gave small-to-moderate|activity gave small-to-moderate/);
    expect(text('pmid-34559424')).toMatch(/may get pain relief/);
    expect(text('pmid-34488087')).toMatch(/twice the odds/);
  });

  it('"similar" / "did not lower" where the abstract found no clear difference', () => {
    for (const id of ['pmid-31709403', 'pmid-26036214', 'pmid-34432115', 'pmid-27827818', 'pmid-39461793', 'pmid-34247796', 'pmid-36987390']) expect(text(id)).toMatch(/no clear (difference|reduction)/);
    expect(text('pmid-31709403')).not.toMatch(/about the same/);
    expect(text('pmid-34247796')).not.toMatch(/did not lower/);
  });

  it('facts not in the abstract are removed', () => {
    expect(text('pmid-32332417')).not.toMatch(/Committee Opinion 721/);
    expect(text('pmid-41671440')).not.toMatch(/Version 3\.2019/);
  });

  it('certainty labels the abstracts never gave are "not stated"', () => {
    for (const id of ['pmid-34521386', 'pmid-38766683', 'pmid-35042510', 'pmid-30529576', 'pmid-34928300', 'pmid-32968801', 'pmid-28647726', 'pmid-30920314', 'pmid-31801099', 'pmid-38902658']) expect(byId.get(id)!.certainty).toBe('not stated');
  });
});
