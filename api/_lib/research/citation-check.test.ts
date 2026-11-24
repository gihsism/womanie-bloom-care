import { describe, it, expect } from 'vitest';
import { checkCitations, evidenceTexts } from './citation-check';

// Source texts written to mimic library items (summary + key points +
// passages), including the two real failures the citation audit found.

const PAROXETINE = `Effect and safety of paroxetine for vasomotor symptoms: systematic review and meta-analysis
This review pooled randomised trials of low-dose paroxetine (7.5 mg) for hot flushes after menopause. Paroxetine reduced the number of daily hot flushes compared with placebo.
The most common side effects were nausea, dizziness and fatigue, mostly mild.
Low-dose paroxetine 7.5 mg daily reduced hot flush frequency by about 40% from baseline.`;

const GABAPENTIN = `Gabapentin for hot flushes: a systematic review
Gabapentin reduced hot flush frequency compared with placebo in women with and without breast cancer. Doses of 900 to 2400 mg per day were studied.
Dizziness and somnolence were more common with gabapentin than placebo.`;

const FREEZE_ALL = `Ovarian stimulation for freeze-all IVF cycles: a systematic review
This review looked at how ovarian stimulation should be planned when all embryos are frozen and transferred later.
The risk of severe ovarian hyperstimulation syndrome (OHSS) is virtually eliminated in freeze-all cycles, and a GnRH antagonist protocol with a GnRH agonist trigger is preferred.
A freeze-all strategy lowered the risk of OHSS compared with fresh embryo transfer.
Stimulation should aim for 15 to 20 eggs.`;

const FOLIC = `Folic acid supplementation before and in early pregnancy: guideline
Women planning a pregnancy should take a daily folic acid supplement of 400 micrograms from before conception until twelve weeks of pregnancy.
Women at higher risk of neural tube defects should take 5 mg daily.
Folic acid reduced the risk of neural tube defects by around 70%.`;

const CAFFEINE = `Caffeine intake in pregnancy
Women should limit caffeine to 200 mg a day in pregnancy. Higher caffeine intake was linked to a higher risk of low birthweight and miscarriage.`;

const IRON = `Iron deficiency in heavy menstrual bleeding
Ferritin below 15 µg/L confirms iron deficiency. Oral ferrous sulfate 60 to 120 mg of elemental iron on alternate days improved absorption.
Treatment should continue for three months after haemoglobin normalises.`;

const EC = `Emergency contraception: guideline
Ulipristal acetate is effective up to 120 hours after unprotected sex; levonorgestrel is licensed up to 72 hours.
Pregnancy rates were around 1 in 100 with ulipristal.`;

const HRT = `Hormone therapy and breast cancer
Combined estrogen and progestogen therapy increased breast cancer risk when used for more than five years.
Vaginal estrogen did not increase breast cancer risk.`;

const ASPIRIN = `Low-dose aspirin for pre-eclampsia prevention
Aspirin 150 mg at night from 12 weeks reduced preterm pre-eclampsia (RR 0.38).
Aspirin was associated with a small increase in postpartum haemorrhage in women with pre-eclampsia.`;

const src = (...texts: string[]) => new Map(texts.map((t, i) => [i + 1, t]));

describe('checkCitations — real audit failures', () => {
  it('removes a gabapentin side effect cited to a paroxetine source', () => {
    const answer = 'Low-dose paroxetine can ease hot flushes [1]. Gabapentin can cause dizziness and sleepiness [1], so take it at night.';
    const r = checkCitations(answer, src(PAROXETINE));
    expect(r.text).toBe('Low-dose paroxetine can ease hot flushes [1]. Gabapentin can cause dizziness and sleepiness, so take it at night.');
    expect(r.removed).toEqual([{ n: 1, issue: 'drug', token: 'gabapentin' }]);
  });

  it('keeps the right source and drops the wrong one in a group', () => {
    const answer = 'Gabapentin commonly causes dizziness [1][2].';
    const r = checkCitations(answer, src(PAROXETINE, GABAPENTIN));
    expect(r.text).toBe('Gabapentin commonly causes dizziness [2].');
    expect(r.removed.map((x) => x.n)).toEqual([1]);
  });

  it('removes a freeze-all citation when the source says the opposite about OHSS', () => {
    const answer = 'A freeze-all approach increases the risk of OHSS [1], so your clinic will watch you closely.';
    const r = checkCitations(answer, src(FREEZE_ALL));
    expect(r.text).toBe('A freeze-all approach increases the risk of OHSS, so your clinic will watch you closely.');
    expect(r.removed[0]).toMatchObject({ n: 1, issue: 'direction' });
    expect(r.removed[0].token).toMatch(/^up:/);
  });

  it('also catches "raises" against "virtually eliminated"', () => {
    const answer = '- **Freeze-all** raises your chance of OHSS. [1]';
    const r = checkCitations(answer, src(FREEZE_ALL));
    expect(r.text).toBe('- **Freeze-all** raises your chance of OHSS.');
  });
});

describe('checkCitations — numbers', () => {
  it('removes a dose the source does not state', () => {
    const answer = 'Most women only need 800 µg of folic acid a day [1].';
    const r = checkCitations(answer, src(FOLIC));
    expect(r.text).toBe('Most women only need 800 µg of folic acid a day.');
    expect(r.removed).toEqual([{ n: 1, issue: 'number', token: '800 µg' }]);
  });

  it('removes a dose taken from a different drug in the same source', () => {
    const answer = 'Paroxetine 20 mg daily reduces hot flushes [1].';
    expect(checkCitations(answer, src(PAROXETINE)).removed[0]).toMatchObject({ issue: 'number', token: '20 mg' });
  });

  it('keeps unit conversions, word numbers, rounding and ranges', () => {
    const answer = [
      'Take 0.4 mg of folic acid daily until 12 weeks of pregnancy [1].',
      'Some women need 5 milligrams a day [1].',
      'Folic acid cuts neural tube defects by about 70 percent [1].',
      'Keep caffeine under 200mg a day [2].',
      'Oral iron at 60–120 mg on alternate days is absorbed better [3], and ferritin under 15 ng/mL means low iron stores [3].',
      'Carry on for 3 months [3].',
      'Ulipristal works for up to 5 days [4], and the pregnancy rate is about 1% [4].',
      'Aspirin 150 mg from 12 weeks lowered preterm pre-eclampsia by around 62% [5].',
    ].join('\n');
    const r = checkCitations(answer, src(FOLIC, CAFFEINE, IRON, EC, ASPIRIN));
    expect(r.removed).toEqual([]);
    expect(r.text).toBe(answer);
  });

  it('keeps numbers that are the patient\'s own', () => {
    const answer = 'Your ferritin of 9 µg/L is below the 15 µg/L cut-off for iron deficiency [1]. A ferritin of 11 µg/L is low [1].';
    const r = checkCitations(answer, src(IRON), { exemptText: 'Ferritin: 11 µg/L (ref 15-150)' });
    expect(r.removed).toEqual([]);
  });

  it('skips the model\'s own bracketed conversion', () => {
    const answer = 'Low ferritin is below 15 µg/L (15 ng/mL) [1].';
    expect(checkCitations(answer, src(IRON)).removed).toEqual([]);
    const conv = 'Ulipristal works up to 120 hours (5 days) [1].';
    expect(checkCitations(conv, src(EC)).removed).toEqual([]);
  });
});

describe('checkCitations — no false positives on good answers', () => {
  it('accepts synonyms and drug classes', () => {
    const answer = [
      'Taking folate before conception lowers the risk of neural tube defects [1].',
      'Estradiol or another estrogen with a progestogen raises breast cancer risk after five years [2].',
      'Paracetamol is fine; acetaminophen is the same medicine [3].',
    ].join('\n');
    const para = 'Paracetamol (acetaminophen) is the preferred painkiller in pregnancy.';
    expect(checkCitations(answer, src(FOLIC, HRT, para)).removed).toEqual([]);
  });

  it('accepts a paraphrase with the same direction', () => {
    const answer = 'Freezing all embryos (freeze-all) makes OHSS much less likely [1]. Higher caffeine intake is linked to low birthweight [2].';
    expect(checkCitations(answer, src(FREEZE_ALL, CAFFEINE)).removed).toEqual([]);
  });

  it('does not judge negated or two-sided statements', () => {
    const answer = [
      'Vaginal estrogen does not raise breast cancer risk [1].',
      'Combined HRT increases breast cancer risk over time [1].',
      'Aspirin lowers pre-eclampsia risk but slightly increases bleeding after birth [2].',
    ].join('\n');
    expect(checkCitations(answer, src(HRT, ASPIRIN)).removed).toEqual([]);
  });

  it('does not flag a comparison stated the other way round', () => {
    const answer = 'Fresh embryo transfer carries a higher OHSS risk than freeze-all [1].';
    expect(checkCitations(answer, src(FREEZE_ALL)).removed).toEqual([]);
  });

  it('checks each marker against its own clause', () => {
    const answer = 'Paroxetine helps hot flushes [1], and gabapentin is another option [2].';
    expect(checkCitations(answer, src(PAROXETINE, GABAPENTIN)).removed).toEqual([]);
  });

  it('accepts a combined claim cited to two sources that each name one drug', () => {
    const answer = 'Both paroxetine and gabapentin reduce hot flushes compared with placebo [1][2].';
    expect(checkCitations(answer, src(PAROXETINE, GABAPENTIN)).removed).toEqual([]);
  });

  // The next two came from real Haiku answers in a sample audit run, where
  // the judge rated the citation supported / partially supported.
  it('does not read a different outcome of the same intervention as a contradiction', () => {
    const pgt = `Some studies show higher birth rates when testing is paired with transferring a single embryo.
This suggests testing might lower the chance of twins or other multiple pregnancies.`;
    const answer = 'Some studies suggest PGT-A combined with single-embryo transfer may lower the chance of twins [1].';
    expect(checkCitations(answer, src(pgt)).removed).toEqual([]);
  });

  it('keeps a group source that alone covers the non-drug part of a list', () => {
    const dhea = 'DHEA supplements were judged effective for low libido after menopause.';
    const acupuncture = 'Acupuncture-related treatments beat Western medicine alone for depression; evidence certainty was mostly low.';
    const melatonin = 'Melatonin was linked to a small reduction in depression scores in postmenopausal women.';
    const answer = 'Other options such as melatonin, DHEA and acupuncture have been studied, but the evidence is limited [1][2][3].';
    expect(checkCitations(answer, src(dhea, acupuncture, melatonin)).removed).toEqual([]);
  });

  it('treats "poor X raises Y" and "better X lowers Y" as agreeing', () => {
    const sleep = 'Better sleep was associated with fewer symptoms of depression and anxiety after birth.';
    const answer = 'Poor sleep is linked to higher rates of depression and anxiety symptoms after birth [1].';
    expect(checkCitations(answer, src(sleep)).removed).toEqual([]);
  });

  it('accepts a hormone named only to define a combined pill', () => {
    const coc = 'Combined oral contraceptives increase the risk of venous thromboembolism compared with non-use.';
    const answer = 'Combined oral contraceptives (pills containing both oestrogen and progestagen) increase the risk of VTE [1].';
    expect(checkCitations(answer, src(coc)).removed).toEqual([]);
  });

  it('leaves uncited text and unknown numbers alone', () => {
    const answer = 'Gabapentin may help. Talk to your GP about 300 mg doses.';
    expect(checkCitations(answer, src(PAROXETINE))).toEqual({ text: answer, removed: [] });
  });

  it('keeps "[1, 2]" lists and links intact when nothing fails', () => {
    const answer = 'Paroxetine reduces hot flushes [1, 2]. See [the guide](https://example.org).';
    expect(checkCitations(answer, src(PAROXETINE, PAROXETINE)).text).toBe(answer);
  });
});

describe('evidenceTexts', () => {
  it('joins title, summary, key points and that source\'s passages under its number', () => {
    const items = [
      { pmid: '1', title: 'A', summary: 'sum a', keyPoints: ['kp a'] },
      { pmid: '2', title: 'B', summary: 'sum b', keyPoints: [] },
    ];
    const m = evidenceTexts(items, [{ pmid: '2', text: 'passage about gabapentin' }]);
    expect(m.get(1)).toBe('A\nsum a\nkp a');
    expect(m.get(2)).toContain('passage about gabapentin');
  });
});
