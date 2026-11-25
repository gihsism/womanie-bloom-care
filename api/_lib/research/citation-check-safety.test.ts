import { describe, it, expect } from 'vitest';
import { getLibrary } from './library';
import { checkCitations, evidenceTexts } from './citation-check';

// Dose / safety audit of the citation check (Nov 2026). Fifteen tricky
// questions (dosing in pregnancy and breastfeeding, HRT contraindications,
// emergency signs) were run through the chat's retrieval; for each, a fake
// answer with a wrong dose, number, medicine or effect was cited to a source
// the retrieval really returns. The library items are used by id so the test
// does not depend on ranking. Cases marked "was missed" failed before the
// fixes made in this audit. Where the library has no source carrying the
// needed text (a mmHg threshold, a codeine warning), a short source written
// like a library item is used instead.

const lib = getLibrary();
const fromLibrary = (...ids: string[]) =>
  evidenceTexts(ids.map((id) => {
    const it = lib.items.find((x) => x.id === id);
    if (!it) throw new Error(`library item ${id} missing`);
    return it;
  }));
const written = (...texts: string[]) => new Map(texts.map((t, i) => [i + 1, t]));

const FOLIC_USPSTF = 'pmid-28097362'; // 0.4-0.8 mg (400-800 µg) daily
const ASPIRIN_USPSTF = 'pmid-34581729'; // 81 mg after 12 weeks
const VITD_REGIMENS = 'pmid-43012372'; // 600 IU vs 4000 IU
const PARACETAMOL_ASD = 'pmid-42500177';
const NSAID_PREGNANCY = 'pmid-38423229'; // higher risk of birth defects
const SERTRALINE_BF = 'pmid-25589155';
const MHT_VTE = 'pmid-40488293'; // transdermal estrogen not linked to more clots
const MHT_BREAST = 'pmid-41808362'; // MHT linked to a modest increase
const MIGRAINE_COC = 'pmid-27153744'; // 2-4 times the stroke risk
const PPH_PB183 = 'pmid-28937571'; // 1,000 mL within 24 hours
const THYROID_PRETERM = 'pmid-31429897';

const SEVERE_BP = 'Severe hypertension in pregnancy: guideline\nA blood pressure of 160/110 mmHg or more is a hypertensive emergency and should be treated within 30 to 60 minutes.';
const CODEINE_BF = 'Codeine and breastfeeding: safety review\nCodeine is contraindicated in breastfeeding mothers because some women are ultra-rapid metabolisers. Paracetamol and ibuprofen are suitable alternatives.';
const HRT_VTE_WARN = 'HRT after venous thromboembolism: review\nOral HRT is contraindicated in women with a previous VTE. Transdermal estrogen did not raise clot risk.';
// Calls one form usable: a broad "HRT is safe" then keeps its citation
// (the check errs towards keeping; the sentence is only half supported).
const HRT_VTE_GUIDE = 'HRT after venous thromboembolism: guideline\nOral HRT is contraindicated in women with a previous VTE. Transdermal estrogen can be used.';

describe('dose / safety audit: wrong answers lose their citation', () => {
  const cases: { q: string; answer: string; sources: ReadonlyMap<number, string>; issue: string; token: string }[] = [
    // Dosing in pregnancy
    { q: 'What dose of folic acid before pregnancy?', answer: 'Take 4 mg of folic acid a day before pregnancy [1].', sources: fromLibrary(FOLIC_USPSTF), issue: 'number', token: '4 mg' },
    { q: 'Folic acid, wrong conversion (was missed)', answer: 'Take 400 µg (4 mg) of folic acid a day [1].', sources: fromLibrary(FOLIC_USPSTF), issue: 'number', token: '4 mg' },
    { q: 'What aspirin dose prevents pre-eclampsia?', answer: 'Take 150 mg of aspirin a day from 12 weeks [1].', sources: fromLibrary(ASPIRIN_USPSTF), issue: 'number', token: '150 mg' },
    { q: 'When to start aspirin?', answer: 'Start low-dose aspirin 81 mg after 20 weeks [1].', sources: fromLibrary(ASPIRIN_USPSTF), issue: 'number', token: '20 weeks' },
    { q: 'How much vitamin D in pregnancy?', answer: 'Take 10,000 IU of vitamin D a day in pregnancy [1].', sources: fromLibrary(VITD_REGIMENS), issue: 'number', token: '10000 iu' },
    { q: 'How much paracetamol in pregnancy?', answer: 'You can take up to 8 g of paracetamol a day in pregnancy [1].', sources: fromLibrary(PARACETAMOL_ASD), issue: 'number', token: '8 g' },
    { q: 'Paracetamol, advice after "your" (was missed)', answer: 'Ask your doctor first, but you can take 4 g of paracetamol [1].', sources: fromLibrary(PARACETAMOL_ASD), issue: 'number', token: '4 g' },
    { q: 'Is ibuprofen safe in pregnancy?', answer: 'Ibuprofen in early pregnancy lowers the risk of birth defects [1].', sources: fromLibrary(NSAID_PREGNANCY), issue: 'direction', token: 'down:early,pregnancy,birth' },
    { q: 'Levothyroxine dose in pregnancy (was missed)', answer: 'Your doctor will usually increase your levothyroxine dose by 50% [1].', sources: fromLibrary(THYROID_PRETERM), issue: 'number', token: '50%' },
    // Breastfeeding
    { q: 'Is codeine safe while breastfeeding? (was missed: codeine unknown)', answer: 'Codeine is a safe painkiller while breastfeeding [1].', sources: fromLibrary(NSAID_PREGNANCY), issue: 'drug', token: 'codeine' },
    { q: 'Codeine called safe against a warning (was missed)', answer: 'Codeine is safe to take while breastfeeding [1].', sources: written(CODEINE_BF), issue: 'safety', token: 'unsafe:codeine' },
    { q: 'Sertraline dose while breastfeeding?', answer: 'The usual sertraline dose while breastfeeding is 300 mg a day [1].', sources: fromLibrary(SERTRALINE_BF), issue: 'number', token: '300 mg' },
    // HRT contraindications
    { q: 'HRT after a blood clot (was missed: source denies the effect)', answer: 'In women at risk of clots, transdermal estrogen increases the clot risk [1].', sources: fromLibrary(MHT_VTE), issue: 'direction', token: 'not-up:transdermal,estrogen,clot' },
    { q: 'HRT called safe after a clot (was missed)', answer: 'HRT is safe if you have had a blood clot [1].', sources: written(HRT_VTE_WARN), issue: 'safety', token: 'unsafe:hrt' },
    { q: 'HRT and breast cancer (was missed: "MHT")', answer: 'Menopausal hormone therapy lowers breast cancer risk [1].', sources: fromLibrary(MHT_BREAST), issue: 'direction', token: 'down:hrt,breast,cancer' },
    { q: 'Combined pill with migraine (was missed: "2 to 4 times the risk")', answer: 'In women with migraine, the combined pill lowers the risk of stroke [1].', sources: fromLibrary(MIGRAINE_COC), issue: 'direction', token: 'down:combin,pill,strok' },
    // Emergency signs
    { q: 'What blood pressure is an emergency? (was missed: systolic)', answer: 'It is an emergency if your blood pressure is 180/110 mmHg or higher [1].', sources: written(SEVERE_BP), issue: 'number', token: '180/110 mmhg' },
    { q: 'How fast must severe blood pressure be treated?', answer: 'Severe blood pressure should be treated within 4 hours [1].', sources: written(SEVERE_BP), issue: 'number', token: '4 hours' },
    { q: 'How much bleeding after birth is too much?', answer: 'Losing more than 500 mL of blood within 48 hours of birth is a haemorrhage [1].', sources: fromLibrary(PPH_PB183), issue: 'number', token: '500 ml' },
  ];

  for (const c of cases) {
    it(c.q, () => {
      const r = checkCitations(c.answer, c.sources);
      expect(r.removed[0]).toMatchObject({ n: 1, issue: c.issue, token: c.token });
      expect(r.text).not.toMatch(/\[1\]/);
    });
  }
});

describe('dose / safety audit: correct answers keep their citation', () => {
  const keep: [string, string, ReadonlyMap<number, string>][] = [
    ['folic acid range and conversion', 'Take 400 µg (0.4 mg) of folic acid a day, up to 0.8 mg [1].', fromLibrary(FOLIC_USPSTF)],
    ['aspirin dose and timing', 'Low-dose aspirin, 81 mg a day after 12 weeks, is advised for high-risk pregnancies [1].', fromLibrary(ASPIRIN_USPSTF)],
    ['"units" for IU', 'Doses above 600 units a day made little difference to pre-eclampsia [1].', fromLibrary(VITD_REGIMENS)],
    ['a correct mmHg threshold', 'If your blood pressure is 160/110 mmHg or more, it is an emergency [1].', written(SEVERE_BP)],
    ['the patient\'s own reading', 'Your reading of 150/95 mmHg is high [1].', written(SEVERE_BP)],
    ['transdermal estrogen not raising clots', 'Transdermal estrogen was not linked to a higher clot risk in women at risk [1].', fromLibrary(MHT_VTE)],
    ['oral combined HRT raising clots', 'Oral estrogen with a progestogen carried the highest clot risk [1].', fromLibrary(MHT_VTE)],
    ['a medicine the warning source calls suitable', 'Ibuprofen is fine while breastfeeding [1].', written(CODEINE_BF)],
    ['the usable option in a contraindication source', 'Transdermal estrogen can be used after a clot [1].', written(HRT_VTE_GUIDE)],
    ['a study of avoiding caffeine is not a warning', 'Up to about 200 mg of caffeine a day is usually fine [1].', written('Restricted caffeine in pregnancy\nCutting caffeine by about 182 mg a day did not change birthweight. There is not enough evidence to confirm or refute a benefit of avoiding caffeine.')],
    ['PPH definition', 'Losing 1,000 mL of blood or more within 24 hours of birth counts as a postpartum haemorrhage [1].', fromLibrary(PPH_PB183)],
  ];
  for (const [name, answer, sources] of keep) {
    it(name, () => {
      const r = checkCitations(answer, sources);
      expect(r.removed).toEqual([]);
      expect(r.text).toBe(answer);
    });
  }
});
