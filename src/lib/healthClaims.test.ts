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
    expect(t).toMatch(/weeks 18 to 24 shows the baby is RhD positive/);
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

  it('holds the SGGG anti-D (68) and GBS (86) letters as hand-written summaries', () => {
    const antiD = byPrefix('gp-sggg-empfehlungen-zur-anti-d');
    const gbs = byPrefix('gp-sggg-86-prophylaxe-gbs');
    for (const it of [antiD, gbs]) {
      expect(it.page?.summariser).toBe('hand-written');
      expect(it.page?.chunks).toBe(0);
    }
    expect(antiD.summary).toMatch(/between weeks 18 and 24/);
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
