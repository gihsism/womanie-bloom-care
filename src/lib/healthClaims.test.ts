import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Research round 5 (docs/research-gaps.md): numeric health claims checked
// against free official sources. These tests pin the decided wording so an
// older figure cannot slip back in.

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
const D = 'src/components/dashboard/';

describe('vitamin D: the current BLV table (800 IU over 65, not from 60)', () => {
  const files = [
    `${D}MenopauseNutrition.tsx`,
    `${D}MenopauseDashboard.tsx`,
    `${D}PersonalizedInsights.tsx`,
    'api/analyze-document.ts',
  ];

  it('no screen or prompt says 800 IU from 60', () => {
    for (const f of files) {
      const s = read(f);
      expect(s, f).not.toMatch(/800 IU[^.;'"]{0,20}(from|over|ab) (age )?60/);
      expect(s, f).toMatch(/800 IU[^.;'"]{0,20}(from 66|over 65)/);
    }
  });

  it('the AI lab-reading prompt gives the BLV amounts', () => {
    expect(read('api/analyze-document.ts')).toContain('Everyday amount 600 IU/day (800 IU over 65, BLV)');
  });

  it('no flat "most adults need 1000-4000 IU" advice', () => {
    expect(read(`${D}PersonalizedInsights.tsx`)).not.toMatch(/1000-4000 IU/);
  });

  it('the Swiss reference-values library item says over 65', () => {
    const lib = JSON.parse(read('api/_lib/research/library.json')) as { items: Array<{ id: string; keyPoints: string[] }> };
    const blv = lib.items.find(i => i.id.startsWith('gp-blv-naehrstoffzufuhr'))!;
    expect(blv.keyPoints.join(' ')).toMatch(/over 65: calcium 1000 to 1200 mg a day, vitamin D 20 micrograms \(800 IU\)/);
  });
});

describe('pregnancy screens: Swiss BLV brochure (August 2025) and other free sources', () => {
  const nutrition = read(`${D}PregnancyNutrition.tsx`);

  it('caffeine, alcohol and fish limits follow the BLV brochure', () => {
    expect(nutrition).not.toMatch(/1 large coffee/);
    expect(nutrition).toMatch(/1 to 2 cups of coffee or up to 4 cups of black or green tea/);
    expect(nutrition).toMatch(/200 mg a day/);
    expect(nutrition).toMatch(/no shark, swordfish or marlin; fresh or tinned tuna at most once a week/);
    expect(nutrition).toMatch(/Alcohol: none in pregnancy/);
  });

  it('vitamin D, drinks and energy use the Swiss amounts', () => {
    expect(nutrition).not.toMatch(/600–2000 IU|1000-2000 IU/);
    expect(nutrition).toMatch(/600 IU\/day as drops/);
    expect(nutrition).not.toMatch(/2\.3 ?L/);
    expect(nutrition).toMatch(/1\.5–2 L of drinks/);
    expect(nutrition).toMatch(/250 extra kcal a day from month 4 and about 500 from month 7/);
  });

  it('exercise minutes and positions are sourced and softened', () => {
    const ex = read(`${D}PregnancyExercise.tsx`);
    expect(ex).toMatch(/150 minutes of moderate activity a week/);
    expect(ex).toMatch(/30 minutes a day/);
    expect(ex).not.toMatch(/Stop supine/);
    expect(ex).not.toMatch(/most evidence-backed labour-prep/);
  });

  it('weight-gain ranges are the IOM 2009 ones (same in the BLV brochure)', () => {
    const w = read(`${D}PregnancyWeightTracker.tsx`);
    expect(w).toContain('totalKg: [12.5, 18]');
    expect(w).toContain('totalKg: [11.5, 16]');
    expect(w).toContain('totalKg: [7, 11.5]');
    expect(w).toContain('totalKg: [5, 9]');
    expect(w).toMatch(/BLV brochure \(2025\)\s+uses the same ranges/);
  });

  it('week notes: side sleeping from 28 weeks (either side), Swiss anti-D timing', () => {
    const t = read(`${D}PregnancyTracker.tsx`);
    expect(t).not.toMatch(/left side from now on/);
    expect(t).toMatch(/from 28 weeks the advice is to go to sleep on your side, left or right/);
    expect(t).toMatch(/weeks 16 to 24 shows the baby is RhD positive/);
  });
});

describe('postpartum screens', () => {
  it('heavy bleeding uses the CDC warning sign (pad in an hour, clots bigger than an egg) and asks for help now', () => {
    const dash = read(`${D}PostpartumDashboard.tsx`);
    expect(dash).not.toMatch(/golf/);
    expect(dash).toMatch(/clots bigger than an\s+egg/);
    expect(dash).toMatch(/get medical help now/);
    expect(read(`${D}PostpartumLochiaCard.tsx`)).not.toMatch(/activity\s+overdone/);
  });

  it('bleeding duration is "several weeks, often 4 to 6", not a hard 4-6 weeks', () => {
    expect(read(`${D}PostpartumLochiaCard.tsx`)).toMatch(/often 4 to 6, sometimes longer/);
    expect(read(`${D}PostpartumDashboard.tsx`)).toMatch(/several weeks, often 4 to 6/);
  });

  it('return to exercise follows the NHS (no fixed week-2 rule; high impact after the 6-week check)', () => {
    const pf = read(`${D}PostpartumPelvicFloor.tsx`);
    expect(pf).not.toMatch(/usually week 2 for vaginal delivery/);
    expect(pf).toMatch(/as soon as you feel up to it/);
    expect(pf).toMatch(/6-week check before running/);
    expect(pf).toMatch(/7 days after the bleeding stops before swimming/);
  });

  it('nutrition amounts: no unsourced 2.5-3 L, 1.5 g/kg protein or 1000-1300 mg calcium', () => {
    const n = read(`${D}PostpartumNutrition.tsx`) + read(`${D}PostpartumDashboard.tsx`);
    expect(n).not.toMatch(/2\.5–3 L/);
    expect(n).not.toMatch(/1\.5 g\/kg/);
    expect(n).not.toMatch(/1000–1300 mg/);
    expect(n).toMatch(/at least 2 L/i);
  });
});

describe('research library: Swiss pregnancy sources', () => {
  const lib = JSON.parse(read('api/_lib/research/library.json')) as {
    items: Array<{ id: string; url: string; summary: string; keyPoints: string[]; page?: { summariser: string; chunks: number } }>;
  };
  const byPrefix = (p: string) => lib.items.find(i => i.id.startsWith(p))!;

  it('holds the SGGG anti-D (94, replaces 68) and GBS (86) letters as hand-written summaries', () => {
    const antiD = byPrefix('gp-sggg-94-empfehlungen-zur-anti-d');
    expect(lib.items.some(i => i.id.startsWith('gp-sggg-empfehlungen-zur-anti-d'))).toBe(false);
    const gbs = byPrefix('gp-sggg-86-prophylaxe-gbs');
    for (const it of [antiD, gbs]) {
      expect(it.page?.summariser).toBe('hand-written');
      expect(it.page?.chunks).toBe(0);
    }
    expect(antiD.summary).toMatch(/between weeks 16 and 24/);
    expect(antiD.url).toMatch(/^https:\/\/www\.sggg\.ch\//);
    expect(gbs.summary).toMatch(/weeks 35 to 37/);
  });

  it('the BLV pregnancy item carries the brochure figures the screens cite', () => {
    const k = byPrefix('gp-blv-ernaehrung-schwangere').keyPoints.join(' ');
    expect(k).toMatch(/1 to 2 cups of coffee or 4 cups of black or green tea/);
    expect(k).toMatch(/tinned tuna and imported pike at most once a week/);
    expect(k).toMatch(/11\.5 to 16 kg/);
    expect(k).toMatch(/30 minutes a day/);
  });
});

// Research round 6: cycle, contraception, IVF and first-period screens.
describe('screening tracker: Swiss cervical and breast screening (round 8)', () => {
  const t = read(`${D}ScreeningTracker.tsx`);
  it('cervical screening follows SGGG letter 97 and KLV Art. 12e, not the US co-test schedule', () => {
    expect(t).toMatch(/every 3 years from 21 to 70/);
    expect(t).toMatch(/both together is not recommended \(SGGG 2026\)/);
    expect(t).toMatch(/not for an HPV test used for screening \(KLV Art\. 12e\)/);
    expect(t).not.toMatch(/Pap \+ HPV co-test/);
  });
  it('programme mammograms: no deductible, co-payment remains', () => {
    expect(t).toMatch(/no deductible, the co-payment still applies/);
  });
});

describe('cycle screens: FIGO ranges everywhere, PMS evidence not overstated', () => {
  it('cycle length is judged against FIGO 24-38 days in the overview and the doctor trends', () => {
    expect(read('src/lib/healthOverview.ts')).toMatch(/CYCLE_RANGE = \{ low: 24, high: 38 \}/);
    expect(read('src/lib/patientTrends.ts')).toMatch(/p\.value < 24 \|\| p\.value > 38/);
    expect(read('src/components/doctor/patient/PatientTrends.tsx')).toContain('refBand={[24, 38]}');
  });

  it('no "magnesium = strongest evidence" for PMS; calcium named (ACOG)', () => {
    for (const f of [`${D}CyclePhaseNutrition.tsx`, `${D}PMSForecastCard.tsx`]) {
      const s = read(f);
      expect(s, f).not.toMatch(/strongest/i);
      expect(s, f).toMatch(/calcium[^']*better evidence[^']*PMS/i);
    }
    expect(read(`${D}CyclePhaseNutrition.tsx`)).not.toMatch(/most evidence-backed/);
  });

  it('heavy-flow card uses the NHS signs, not "heavy for more than 2-3 days"', () => {
    const s = read(`${D}PeriodFlowCard.tsx`);
    expect(s).not.toMatch(/2–3 days/);
    expect(s).toMatch(/every 1–2 hours/);
    expect(s).toMatch(/more than 7 days/);
  });
});

describe('first-period screen: ACOG adolescent ranges', () => {
  const s = read(`${D}PreMenstrualDashboard.tsx`);
  it('teen cycles 21-45 days, periods up to 7 days', () => {
    expect(s).not.toMatch(/every 21–35 days/);
    expect(s).toMatch(/every 21–45 days/);
  });
  it('when to see a doctor: no period by 15 or 3 years after breast growth, bleeding before 8', () => {
    expect(s).toMatch(/no period\s+by 15 \(or 3 years after your breasts started to grow\)/);
    expect(s).toMatch(/bleeding before\s+age 8/);
    expect(s).not.toMatch(/after a\s+year of regular periods/);
  });
  it('sleep follows AASM by age', () => {
    expect(s).toMatch(/9–12 hours of sleep up to age 12 and 8–10 hours as a teenager/);
  });
});

describe('contraception screen', () => {
  const s = read(`${D}ContraceptionDashboard.tsx`);
  it('device durations: implant 3 years, hormonal IUD 3/5/8, copper 5-10 (not 12)', () => {
    expect(s).toMatch(/schedule: 'Every 3 years', description: 'Small rod under the skin of the arm, licensed for 3 years\.'/);
    expect(s).toMatch(/3, 5 or 8 years depending on the type/);
    expect(s).toMatch(/schedule: 'Every 5-10 years'/);
    expect(s).not.toMatch(/up to 12 years|3-5 years/);
  });
  it('medicine interactions: enzyme inducers, not "antibiotics" in general (FSRH)', () => {
    expect(s).not.toMatch(/\(antibiotics, St\. John's Wort\)/);
    expect(s).toMatch(/rifampicin, some epilepsy medicines and St John's wort\. Most antibiotics do not\./);
  });
  it('shows ring-out / patch-off rules and what the effectiveness range means', () => {
    expect(s).toContain('RING_OUT_RULE');
    expect(s).toContain('PATCH_OFF_RULE');
    expect(s).toContain('EFFECTIVENESS_NOTE');
  });
});

describe('IVF screens', () => {
  const n = read(`${D}IVFNutrition.tsx`);
  const p = read(`${D}ivfPhases.ts`);
  it('no protein g/kg targets, no 30 ng/mL vitamin D target, no 2.5-3 L water', () => {
    expect(n).not.toMatch(/g\/kg/);
    expect(n).not.toMatch(/30\+ ng\/mL/);
    expect(n).not.toMatch(/2\.5–3 L/);
  });
  it('OHSS warning signs say to call the clinic straight away', () => {
    for (const s of [n, p]) expect(s).toMatch(/Call your clinic straight away[^']*shortness of breath: these can be signs of OHSS/);
  });
  it('no CoQ10 advice, no "fast from midnight", single embryo is the usual', () => {
    expect(p).not.toMatch(/CoQ10|Fast from midnight|One or two embryos|painless/);
    expect(p).toMatch(/Usually one embryo/);
  });
});

// Research round 7: the AI lab-reading prompt (api/analyze-document.ts)
// keeps only figures that a library source states, and the lab's own
// reference range decides the status (same rule as api/_lib/lab-flags.ts).
describe('AI lab-reading prompt: only sourced figures, lab range wins', () => {
  const src = read('api/analyze-document.ts');
  const start = src.indexOf('export const STATIC_RULES = `');
  const rules = src.slice(start, src.indexOf('`;', start));

  it('the lab range decides the status, never a figure from the prompt', () => {
    expect(rules).toMatch(/Status comes from the LAB'S OWN REFERENCE RANGE/);
    expect(rules).toMatch(/Never call a value abnormal when it is inside the lab's printed range/);
    expect(rules).toMatch(/critical = only when the lab or the doctor marks/);
    expect(rules).toMatch(/Do not use any other number from memory as a cut-off/);
  });

  it('unsourced cut-offs are gone', () => {
    for (const old of [
      '0.1-2.5', // old trimester TSH (ATA 2011)
      '25.8', // trimester ferritin
      'IL-6 >', 'LH/FSH ratio', 'DHEA-S/cortisol', '>86 ng/dL', 'Day 3 FSH', 'Mean ~276',
      '<1.0 optimal', 'Fasting insulin >20', 'Lp(a): <75', 'ApoB: <80', 'CTX', 'Cushing',
      'HbS 20-45%', 'Tennessee', 'discontinue combined', 'aspirin + LMWH', "= Hashimoto's",
    ]) expect(rules, old).not.toContain(old);
  });

  it('every number in the reference figures belongs to a sourced figure', () => {
    const block = rules.slice(rules.indexOf('═══ REFERENCE FIGURES'), rules.indexOf('═══ HOW TO READ'));
    const nums = new Set(block.match(/\d+(?:[.,]\d+)?/g));
    const allowed = new Set([
      '1', '2', '3', '4', // rule numbers
      '11', '110', '2025', // FIGO anaemia in pregnancy
      '30', '2021', // Cochrane ferritin
      '75', '24', '28', '5.1', '92', '10.0', '180', '8.5', '153', '81', // SGGG letter 81
      '20', '50', '29', '25', '2018', '600', '800', '65', '4,000', // vitamin D review + BLV
    ]);
    for (const n of nums) expect(allowed.has(n), n).toBe(true);
  });

  it('notes name who to ask and never give doses or diagnoses', () => {
    expect(rules).toMatch(/never a diagnosis/);
    expect(rules).toMatch(/doctor or gynaecologist, midwife, or pharmacist/);
    expect(rules).toMatch(/Never say how much of a medicine or supplement to take/);
  });
});

// Research round 10: static text sweep of numbers with units in src/
// (docs/research-gaps.md). Removed claims are checked on the code with
// comments stripped, since the comments name what was removed and why.
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('round 10: unsourced numbers in lab insights and cycle cards', () => {
  const pi = code(`${D}PersonalizedInsights.tsx`);

  it('no fixed recheck intervals, TSH target or recovery promise in the app voice', () => {
    expect(pi).not.toMatch(/every 4-6 weeks/);
    expect(pi).not.toMatch(/every 6-8 weeks/);
    expect(pi).not.toMatch(/keep TSH below 2\.5/);
    expect(pi).not.toMatch(/levothyroxine\) is likely needed/);
    expect(pi).not.toMatch(/within 4-8 weeks/);
    expect(pi).not.toMatch(/likely causing significant fatigue/);
    expect(pi).not.toMatch(/weekly from 32 weeks/);
    expect(pi).toMatch(/tell you how often to repeat the blood test/);
  });

  it('AMH is read against the lab range, not a fixed "low threshold"', () => {
    expect(pi).not.toMatch(/low threshold of 1\.1/);
    expect(pi).toMatch(/compare it with your lab's range/);
  });

  it('folic acid 400 µg keeps its source', () => {
    expect(read(`${D}PersonalizedInsights.tsx`)).toMatch(/USPSTF 2023 \(library pmid-37526713/);
  });

  it('pregnancy lab card carries no unused cut-offs (no 30 ng/mL vitamin D, no 95 mg/dL)', () => {
    const s = code(`${D}PregnancyLabInsights.tsx`);
    expect(s).not.toMatch(/idealLabel|criticalBelow/);
    expect(s).not.toMatch(/30 ng\/mL|95 mg\/dL/);
  });

  it('cycle cards: no magnesium tip, no fixed surge length, no "5-7 days before your blood test"', () => {
    expect(code(`${D}CyclePhaseExercise.tsx`)).not.toMatch(/magnesium/i);
    expect(code(`${D}LHSurgeCard.tsx`)).not.toMatch(/12-24 hours/);
    const cu = code(`${D}CycleUpdateSuggestions.tsx`);
    expect(cu).not.toMatch(/5-7 days before your blood test/);
    expect(cu).not.toMatch(/24-48 hours/);
    expect(cu).toMatch(/One result cannot pin the exact day/);
  });

  it('due-date notes: WHO birth size, no "5% on the due date"', () => {
    const t = code(`${D}PregnancyTracker.tsx`);
    expect(t).not.toMatch(/3\.4 kg|2\.5-4\.3 kg|about 5% of babies/);
    expect(t).toMatch(/3\.2 to 3\.3 kg \(WHO growth standards\)/);
  });
});
