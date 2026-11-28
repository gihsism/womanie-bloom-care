import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { assembleChatSystemPrompt, buildChatContext, buildPersonalContextBlock, redactRecordText } from './chat-context';
import { applyChatLimits } from './chat-limits';
import { selectChatEvidence, selectChatEvidenceForTurn } from './research/chat-prompt';
import { DEFAULT_EMBEDDING_MODEL, EMBEDDING_MODELS, modelFile } from './research/embed';
import type { DocRow, LabRow } from './personal-retrieval';

// Ask AI prompt harness (round 13). For 40 everyday questions across the
// nine life stages it assembles exactly the system prompt the chat sends
// (api/ai-doctor-chat.ts: buildChatContext -> selectChatEvidenceForTurn ->
// assembleChatSystemPrompt) for one fixture patient, WITHOUT calling the
// model, and checks what the model would read:
//   - the research sources include the on-topic item(s) for the question;
//   - the personal context fits her stage now (no cycle phase in
//     pregnancy, no "postpartum week" in a new pregnancy, no stale IVF
//     phase), even when the page sends a stale payload;
//   - no personal data beyond what an answer needs (first name only, no
//     surname, email, AHV number, IBAN or database ids);
//   - the prompt stays within a token budget.

const NOW = new Date('2026-11-28T10:00:00Z');
const USER_ID = '7d0c2f4e-1111-4222-8333-944455556666';
const DOC_ID = '0b6e9a4c-aaaa-4bbb-8ccc-ddddeeeeffff';

const lab = (id: number, title: string, value: string, date: string, extra: Partial<LabRow> = {}): LabRow => ({
  id: `lab-row-${id}-9f3a`, data_type: 'lab_result', title, value, unit: '', reference_range: '', status: 'normal',
  date_recorded: date, notes: '', document_id: DOC_ID, ...extra,
});

const LABS: LabRow[] = [
  lab(1, 'Ferritin', '38', '2019-04-02', { unit: 'ng/mL', reference_range: '15-150' }),
  lab(2, 'Ferritin', '24', '2021-03-11', { unit: 'ng/mL', reference_range: '15-150' }),
  lab(3, 'Ferritin', '19', '2022-02-15', { unit: 'ng/mL', reference_range: '15-150' }),
  lab(4, 'Ferritin', '14', '2023-06-20', { unit: 'ng/mL', reference_range: '15-150', status: 'low' }),
  lab(5, 'Ferritin (Serum)', '11', '2024-09-03', { unit: 'ng/mL', reference_range: '15-150', status: 'low' }),
  lab(6, 'Ferritin', '9', '2025-10-01', { unit: 'ng/mL', reference_range: '15-150', status: 'low' }),
  lab(7, 'TSH', '5.9', '2023-06-20', { unit: 'mIU/L', reference_range: '0.4-4.0', status: 'high' }),
  lab(8, 'TSH', '3.1', '2024-09-03', { unit: 'mIU/L', reference_range: '0.4-4.0' }),
  lab(9, 'TSH', '2.2', '2025-10-01', { unit: 'mIU/L', reference_range: '0.4-4.0' }),
  lab(10, 'AMH', '1.4', '2025-10-01', { unit: 'ng/mL', reference_range: '1.0-3.5' }),
  lab(11, 'FSH', '11.2', '2025-10-01', { unit: 'IU/L', reference_range: '3.5-12.5' }),
  lab(12, 'LDL Cholesterol', '4.4', '2025-10-01', { unit: 'mmol/L', reference_range: '<3.0', status: 'high' }),
  lab(13, 'Vitamin D', '42', '2025-10-01', { unit: 'nmol/L', reference_range: '50-125', status: 'low' }),
  lab(14, 'Hemoglobin', '118', '2025-10-01', { unit: 'g/L', reference_range: '120-160', status: 'low' }),
  lab(15, 'Glucose', '5.1', '2025-10-01', { unit: 'mmol/L', reference_range: '3.9-5.6' }),
  { id: 'lab-row-16', data_type: 'condition', title: 'Hashimoto thyroiditis', date_recorded: '2023-06-20' },
  { id: 'lab-row-17', data_type: 'medication', title: 'Levothyroxine', date_recorded: '2023-06-20' },
];

const DOCS: DocRow[] = [
  {
    id: DOC_ID,
    file_name: 'Muster_Lena_Labor_2025.pdf',
    ai_suggested_name: 'Blood test Lena Muster October 2025',
    ai_summary: 'Lab report for Lena Muster (AHV 756.1234.5678.97, lena.muster@example.ch). Low ferritin and haemoglobin, high LDL cholesterol, low vitamin D. Thyroid in range on levothyroxine. Invoice to IBAN CH93 0076 2011 6238 5295 7.',
    ai_suggested_category: 'lab_results',
    uploaded_at: '2025-10-02',
  },
  { id: '1c1c1c1c-2222-4333-8444-555566667777', file_name: 'us.pdf', ai_suggested_name: 'Pelvic ultrasound', ai_summary: 'Normal uterus and ovaries.', ai_suggested_category: 'imaging', uploaded_at: '2025-04-01' },
];

const APTS = [{ scheduled_at: '2026-12-04T09:30:00Z', consultation_type: 'video', duration: 30, doctor_name: 'Anna Keller', doctor_title: 'Dr.', doctor_specialties: ['Gynaecology'] }];
const NOTES = [{ title: 'Iron and thyroid plan', note_type: 'follow-up', created_at: '2025-10-05T08:00:00Z', doctor_name: 'Anna Keller', doctor_title: 'Dr.', content: `Discussed low ferritin with Ms Muster. Recheck in 3 months. ${'Background and plan details. '.repeat(80)}` }];
const MEDS = [{ id: 'med-1', name: 'Levothyroxine', dose: '50 mcg', reminder_times: ['07:00'] }];

// Profile per stage, with the stale columns a real profile keeps after she
// moves on (IVF -> pregnancy keeps ivf_phase; after birth the due date).
const PROFILES: Record<string, Record<string, unknown>> = {
  'pre-menstrual': {},
  'menstrual-cycle': {},
  contraception: {},
  conception: {},
  ivf: { ivf_phase: 'stimulation', ivf_start_date: '2026-11-20' },
  pregnancy: { pregnancy_due_date: '2027-03-28', ivf_phase: 'transfer', ivf_start_date: '2026-06-01' },
  postpartum: { pregnancy_due_date: '2026-10-10', ivf_phase: 'beta' },
  menopause: {},
  'post-menopause': {},
};

const BABY_ID = 'baby-1';
const postpartumRows = {
  lifeBabies: [{ id: BABY_ID, name: 'Mia', birth_date: '2026-10-12' }],
  lifeEvents: [
    { kind: 'feed', baby_id: BABY_ID, occurred_at: '2026-11-28T03:10:00Z', data: { method: 'breast_l' } },
    { kind: 'feed', baby_id: BABY_ID, occurred_at: '2026-11-28T06:00:00Z', data: { method: 'breast_r' } },
  ],
  lifeBirth: { birth_at: '2026-10-12T04:00:00Z', delivery_type: 'vaginal' },
};

// The worst case from the page: a payload computed before her profile
// loaded, so it carries a cycle phase from old period rows and a birth
// date from her last baby whatever her stage is now.
const STALE_PAGE_CONTEXT = {
  age: 34,
  flags: 'TSH 2.2 mIU/L',
  postpartumWeeks: 6,
  cyclePhase: 'late-luteal (cycle day 26 of ~28): PMS window, next period in ~2 days',
  amhSummary: '1.4 ng/mL for ages 30-34 — low normal reserve',
  email: 'lena.muster@example.ch',
};

interface Case {
  stage: string;
  q: string;
  prev?: string;
  /** At least one of these research items must be among the sources (null: known library gap). */
  sources: string[] | null;
  /** When set, the FIRST source must be one of these (round 19: questions that led with an off-topic study). */
  first?: string[];
  /** Analytes whose full history must be in the records block. */
  history?: string[];
}

const CASES: Case[] = [
  { stage: 'pre-menstrual', q: 'What changes should I expect before my first period?', sources: ['pmid-26595586', 'pmid-30064002'] },
  { stage: 'pre-menstrual', q: 'When should girls get the HPV vaccine?', sources: ['gp-bag-humane-papillomaviren-hpv-d8e9aa'] },
  { stage: 'pre-menstrual', q: 'Is it normal to have discharge before my first period?', sources: ['pmid-30064002', 'pmid-26595586'] },
  { stage: 'pre-menstrual', q: 'How do I use a tampon for the first time?', sources: ['gp-nhs-toxic-shock-syndrome-bbfbe9'] },
  { stage: 'menstrual-cycle', q: 'What helps with period cramps?', sources: ['pmid-31538328', 'pmid-37523477', 'pmid-39037764'], first: ['pmid-41031966', 'pmid-39037764', 'pmid-37523477', 'pmid-31538328', 'pmid-40216328'] },
  { stage: 'menstrual-cycle', q: 'Are heavy periods a sign of anaemia?', sources: ['pmid-42425828', 'pmid-27087396'], history: ['Ferritin', 'Hemoglobin'] },
  { stage: 'menstrual-cycle', q: 'How has my ferritin changed over the years?', sources: ['pmid-34028001', 'pmid-42747316'], history: ['Ferritin'] },
  { stage: 'menstrual-cycle', q: 'And since 2022?', prev: 'How has my ferritin changed over the years?', sources: ['pmid-34028001'], history: ['Ferritin'] },
  { stage: 'menstrual-cycle', q: 'Why do I feel bloated before my period?', sources: ['pmid-36612891', 'pmid-40766994'] },
  { stage: 'menstrual-cycle', q: 'Is my TSH normal?', sources: ['pmid-31088853'], history: ['TSH'] },
  { stage: 'contraception', q: 'Does the pill increase blood clot risk?', sources: ['pmid-27793376', 'pmid-29388678'] },
  { stage: 'contraception', q: 'What should I do if I miss a pill?', sources: ['gp-cdc-combined-hormonal-contraceptives-html-41d76f', 'gp-fsrh-fsrh-guideline-combined-hormonal-contrac-4c670a'], first: ['gp-cdc-combined-hormonal-contraceptives-html-41d76f', 'gp-fsrh-fsrh-guideline-combined-hormonal-contrac-4c670a'] },
  { stage: 'contraception', q: 'Can I use contraception after 40?', sources: ['pmid-40838950'] },
  { stage: 'contraception', q: 'How long does the morning-after pill work?', sources: ['pmid-30661244', 'pmid-39701010'] },
  { stage: 'conception', q: 'Does folic acid need to start before pregnancy?', sources: ['gp-blv-ernaehrung-schwangere-und-stillende-d179e9', 'pmid-37526713'], first: ['gp-blv-ernaehrung-schwangere-und-stillende-d179e9', 'pmid-37526713', 'pmid-26662928', 'pmid-29802877', 'pmid-35691683'] },
  { stage: 'conception', q: 'When are my fertile days?', sources: ['pmid-31139458', 'pmid-38106802'] },
  { stage: 'conception', q: 'What does my AMH level mean for my fertility?', sources: ['pmid-35199161', 'pmid-35907969'], first: ['pmid-35199161', 'pmid-35907969', 'pmid-36651193'], history: ['AMH'] },
  { stage: 'conception', q: 'Do ovulation tests work?', sources: ['pmid-31139458'], first: ['pmid-31139458', 'pmid-37709293', 'pmid-38358798', 'pmid-38106802'] },
  { stage: 'ivf', q: 'What are the warning signs of OHSS?', sources: ['pmid-41996998', 'pmid-26597569'] },
  { stage: 'ivf', q: 'Which side effects are normal during stimulation?', sources: ['pmid-41996998'] },
  { stage: 'ivf', q: 'What should I do and avoid after embryo transfer?', sources: ['pmid-42556821', 'pmid-32827168'], first: ['pmid-42556821', 'pmid-35325124'] },
  // Round 19: filled (was a known gap).
  { stage: 'ivf', q: 'How do I read my beta hCG result?', sources: ['pmid-41837133', 'pmid-16311298', 'pmid-23031160'], first: ['pmid-41837133', 'pmid-16311298', 'pmid-23031160'] },
  { stage: 'pregnancy', q: 'Is coffee safe in pregnancy?', sources: ['pmid-26058966', 'pmid-36825339'] },
  { stage: 'pregnancy', q: 'How many cups a day exactly?', prev: 'Is coffee safe in pregnancy?', sources: ['pmid-26058966', 'pmid-26026343'] },
  { stage: 'pregnancy', q: 'Should I get the whooping cough vaccine in pregnancy?', sources: ['gp-bag-schweizerischer-impfplan-bd22fa'] },
  { stage: 'pregnancy', q: 'What is gestational diabetes and how is it tested?', sources: ['gp-sggg-screening-und-management-der-gestationsd-cec2b3'] },
  { stage: 'pregnancy', q: 'Can I eat raw-milk cheese while pregnant?', sources: ['gp-blv-ernaehrung-schwangere-und-stillende-d179e9'] },
  // Round 19: filled (was a known gap): NHS swelling page, sudden swelling as a pre-eclampsia sign.
  { stage: 'pregnancy', q: 'Is swelling in my feet normal now?', sources: ['gp-nhs-swollen-ankles-feet-and-fingers-861db2'], first: ['gp-nhs-swollen-ankles-feet-and-fingers-861db2', 'gp-nhs-pre-eclampsia-2db977'] },
  { stage: 'postpartum', q: 'Is my bleeding after birth normal?', sources: ['pmid-28937571', 'pmid-40188841'], first: ['pmid-28937571', 'pmid-40188841'] },
  { stage: 'postpartum', q: 'How can I tell if it might be postpartum depression?', sources: ['pmid-40566968', 'pmid-40224605'], first: ['pmid-40566968', 'pmid-40224605'] },
  { stage: 'postpartum', q: 'How often should my baby feed overnight?', sources: ['pmid-35548942', 'pmid-36763610'] },
  { stage: 'postpartum', q: 'Can I take ibuprofen while breastfeeding?', sources: ['pmid-30000045'], first: ['pmid-30000045'] },
  { stage: 'menopause', q: 'Natural remedies for hot flashes', sources: ['pmid-37252752'] },
  { stage: 'menopause', q: 'Is HRT safe for me?', sources: ['pmid-35797481', 'pmid-36081216'] },
  { stage: 'menopause', q: 'Does menopause cause joint pain?', sources: ['pmid-33299396', 'pmid-41344380'] },
  { stage: 'menopause', q: 'What does my FSH level mean?', sources: ['pmid-36651193'], history: ['FSH'] },
  { stage: 'post-menopause', q: 'How to prevent osteoporosis after menopause?', sources: ['pmid-36592456'] },
  { stage: 'post-menopause', q: 'Is bleeding after menopause serious?', sources: ['pmid-38901794', 'pmid-39127112'] },
  { stage: 'post-menopause', q: 'Do I still need smear tests after menopause?', sources: ['gp-sggg-97-empfehlungen-fuer-die-gebaermutterhal-200014'] },
  { stage: 'post-menopause', q: 'Is my cholesterol worth worrying about?', sources: ['pmid-33781847', 'pmid-32209279'], history: ['LDL'] },
];

/** System prompt budget: ~12k tokens at ~4 characters a token. */
const PROMPT_BUDGET_CHARS = 48_000;
/** The records block (profile, records, visits, notes, logs, page context). */
const RECORDS_BUDGET_CHARS = 16_000;

const hasModel = existsSync(modelFile(EMBEDDING_MODELS[DEFAULT_EMBEDDING_MODEL], 'onnx/model_quantized.onnx'));

interface Assembled {
  c: Case;
  prompt: string;
  medicalContext: string;
  sourceIds: string[];
}

async function assemble(c: Case): Promise<Assembled> {
  const raw = [
    ...(c.prev ? [{ role: 'user', content: c.prev }, { role: 'assistant', content: 'An earlier answer.' }] : []),
    { role: 'user', content: c.q },
  ];
  const limited = applyChatLimits(raw);
  if (!limited.ok) throw new Error(limited.error);
  const isPostpartum = c.stage === 'postpartum';
  const { medicalContext, userTurnContent, previousUserTurn } = buildChatContext({
    profile: { full_name: 'Lena Muster', life_stage: c.stage, ...PROFILES[c.stage] },
    personalRows: { labs: LABS, docs: DOCS },
    upcomingApts: APTS,
    visibleNotes: NOTES,
    lifeMeds: MEDS,
    lifeEvents: isPostpartum ? postpartumRows.lifeEvents : [],
    lifeBirth: isPostpartum ? postpartumRows.lifeBirth : null,
    lifeBabies: isPostpartum ? postpartumRows.lifeBabies : [],
    personalContext: STALE_PAGE_CONTEXT,
    messages: limited.messages,
    now: NOW,
    clientToday: '2026-11-28',
  });
  const ev = await selectChatEvidenceForTurn(userTurnContent, previousUserTurn, c.stage,
    (q, s) => selectChatEvidence(q, s, { timeoutMs: 30_000 }));
  return { c, prompt: assembleChatSystemPrompt(medicalContext, ev.block), medicalContext, sourceIds: ev.researchItems.map((i) => i.id) };
}

describe('Ask AI prompt harness: 40 questions, 9 stages', () => {
  const results: Assembled[] = [];
  beforeAll(async () => {
    for (const c of CASES) results.push(await assemble(c));
  }, 120_000);

  it('covers 40 questions and every life stage', () => {
    expect(CASES).toHaveLength(40);
    expect(new Set(CASES.map((c) => c.stage)).size).toBe(9);
  });

  it.skipIf(!hasModel)('sources include the on-topic item(s) for each question', () => {
    const misses = results
      .filter((r) => r.c.sources && !r.c.sources.some((id) => r.sourceIds.includes(id)))
      .map((r) => `${r.c.stage} | ${r.c.q} -> ${r.sourceIds.join(', ')}`);
    expect(misses).toEqual([]);
  });

  it('no known library gaps left in the 40 questions', () => {
    expect(CASES.filter((c) => c.sources === null).map((c) => c.q)).toEqual([]);
  });

  // Round 19: the first source is the one the model leans on most. These
  // questions used to lead with an off-topic study (antimalarials for
  // folic acid, IUI timing for ovulation tests, the pill for period pain
  // for a missed pill, AMH after bariatric surgery, IUD pain for cramps,
  // painkiller efficacy after birth for a breastfeeding question,
  // prevention trials for the signs of depression or for normal bleeding
  // after birth, blastocyst vs cleavage stage for what to do after
  // transfer).
  it.skipIf(!hasModel)('the first source is on-topic where it used to be off-topic', () => {
    const wrong = results
      .filter((r) => r.c.first && !r.c.first.includes(r.sourceIds[0]))
      .map((r) => `${r.c.stage} | ${r.c.q} -> ${r.sourceIds[0]}`);
    expect(wrong).toEqual([]);
  });

  it('every question with an expected source gets 1-6 numbered sources', () => {
    for (const r of results.filter((x) => x.c.sources)) {
      expect(r.sourceIds.length, r.c.q).toBeGreaterThan(0);
      expect(r.sourceIds.length, r.c.q).toBeLessThanOrEqual(6);
      expect(r.prompt, r.c.q).toContain('[1] ');
    }
  });

  it('personal context matches her stage now, even from a stale page payload', () => {
    for (const { c, medicalContext: m } of results) {
      const label = `${c.stage} | ${c.q}`;
      const cycleOk = !['pregnancy', 'postpartum', 'pre-menstrual', 'post-menopause'].includes(c.stage);
      expect(/^Cycle: /m.test(m), `${label}: cycle phase`).toBe(cycleOk);
      expect(/Postpartum week/.test(m), `${label}: postpartum week`).toBe(c.stage === 'postpartum');
      expect(/^Pregnancy: due 2027-03-28 \(week 22 \+ 6d, 120 days to go\)/m.test(m), `${label}: pregnancy week`).toBe(c.stage === 'pregnancy');
      expect(/IVF phase/.test(m), `${label}: IVF phase`).toBe(c.stage === 'ivf');
      expect(/## Baby: Mia/.test(m), `${label}: baby log`).toBe(c.stage === 'postpartum');
      expect(m, label).toContain(`Life stage: ${c.stage}`);
      expect(m, label).toContain('Age: 34');
    }
  });

  it('the records hold the full history of the tests the question names', () => {
    for (const { c, medicalContext: m } of results) {
      for (const a of c.history ?? []) expect(m, `${c.q}: ${a}`).toMatch(new RegExp(`### ${a}[^\\n]*full history`));
    }
    const ferritin = results.find((r) => r.c.q === 'And since 2022?')!.medicalContext;
    expect(ferritin).toContain('Ferritin — full history (6 values');
    expect(ferritin).toContain('2019-04-02 Ferritin: 38');
  });

  it('no personal data beyond what an answer needs', () => {
    for (const { c, prompt } of results) {
      const label = `${c.stage} | ${c.q}`;
      expect(prompt, label).toContain('Patient: Lena, Life stage:');
      expect(prompt, label).not.toMatch(/Muster/i);
      expect(prompt, label).not.toContain('756.1234');
      expect(prompt, label).not.toContain('@example.ch');
      expect(prompt, label).not.toContain('CH93');
      expect(prompt, label).not.toContain(USER_ID);
      expect(prompt, label).not.toContain(DOC_ID);
      expect(prompt, label).not.toMatch(/lab-row-/);
    }
  });

  it('stays within the prompt budget, records block delimited once', () => {
    for (const { c, prompt, medicalContext } of results) {
      expect(prompt.length, c.q).toBeLessThan(PROMPT_BUDGET_CHARS);
      expect(medicalContext.length, c.q).toBeLessThan(RECORDS_BUDGET_CHARS);
      expect(prompt.match(/^<patient_records>$/gm), c.q).toHaveLength(1);
      expect(prompt.match(/^<\/patient_records>$/gm), c.q).toHaveLength(1);
      expect(prompt.trimEnd().endsWith('Do not mention this block in the answer.'), c.q).toBe(true);
    }
  });

  it('a long doctor note is shortened', () => {
    const m = results[0].medicalContext;
    expect(m).toContain('(note shortened)');
  });
});

describe('buildPersonalContextBlock', () => {
  it('drops fields it does not know and keeps the stage anchors of her stage only', () => {
    const block = buildPersonalContextBlock(STALE_PAGE_CONTEXT, 'menstrual-cycle');
    expect(block).toContain('Cycle: late-luteal');
    expect(block).not.toContain('Postpartum week');
    expect(block).not.toContain('example.ch');
    // After birth: weeks since birth, and no cycle phase from old periods.
    const pp = buildPersonalContextBlock(STALE_PAGE_CONTEXT, 'postpartum');
    expect(pp).toContain('Postpartum week 6 (42 days since birth)');
    expect(pp).not.toContain('Cycle:');
    // No profile row yet: the page's own suppression decides (as before).
    expect(buildPersonalContextBlock(STALE_PAGE_CONTEXT, null)).toContain('Postpartum week 6');
    expect(buildPersonalContextBlock(STALE_PAGE_CONTEXT, null)).not.toContain('Cycle:');
    expect(buildPersonalContextBlock({ cyclePhase: 'follicular' }, 'pregnancy')).toBe('');
    expect(buildPersonalContextBlock(null, 'pregnancy')).toBe('');
  });
});

describe('redactRecordText', () => {
  it('removes surname, email, AHV number and IBAN, leaves values alone', () => {
    const out = redactRecordText('Lena Muster-Graf, AHV 756.1234.5678.97, lena@x.ch, CH93 0076 2011 6238 5295 7. Ferritin 9 ng/mL (ref 15-150), TSH 2.2', 'Lena Muster-Graf');
    expect(out).toBe('Lena [surname], AHV [insurance number], [email], [IBAN]. Ferritin 9 ng/mL (ref 15-150), TSH 2.2');
  });

  it('leaves the text unchanged without a surname', () => {
    expect(redactRecordText('Lena: Ferritin 9', 'Lena')).toBe('Lena: Ferritin 9');
    expect(redactRecordText('Ferritin 9', null)).toBe('Ferritin 9');
  });
});
