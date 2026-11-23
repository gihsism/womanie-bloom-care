import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { actionsFor } from './todayActions';
import { LIFE_STAGES } from './lifeStage';
import { todayItems, primaryActionFor, moreFor } from './todayItems';

const labels = (m: string, w: number | null = null) => actionsFor(m, w).map(a => a.label);

describe('actionsFor (dashboard quick-log row)', () => {
  it('pregnancy shows kick count from week 28 and contractions from week 36', () => {
    expect(labels('pregnancy', 20)).not.toContain('Kick count');
    expect(labels('pregnancy', 30)).toContain('Kick count');
    expect(labels('pregnancy', 30)).not.toContain('Contractions');
    expect(labels('pregnancy', 37)[0]).toBe('Contractions');
  });
  it('never shows more than four buttons', () => {
    for (const w of [10, 30, 34, 38]) expect(actionsFor('pregnancy', w).length).toBeLessThanOrEqual(4);
  });
  it('postpartum opens the baby tracker on the right tab', () => {
    const a = actionsFor('postpartum', null);
    expect(a.find(x => x.label === 'Feed')?.target).toBe('/dashboard/baby?tab=feed');
    expect(a.find(x => x.label === 'Nappy')?.target).toBe('/dashboard/baby?tab=nappy');
  });
  it('every stage offers medicines', () => {
    for (const m of ['menstrual-cycle', 'conception', 'pre-menstrual', 'pregnancy', 'postpartum', 'menopause', 'post-menopause', 'ivf', 'contraception']) {
      expect(labels(m, 30)).toContain('Medicines');
    }
  });

  it('never scrolls Home: every target is the Log sheet or a route', () => {
    for (const m of LIFE_STAGES) for (const w of [10, 30, 38]) {
      for (const a of actionsFor(m, w)) expect(a.target).toMatch(/^(sheet:log|\/dashboard\/)/);
    }
  });
});

// Every /dashboard/stage#anchor that Home links to (quick-log chips, the
// primary button, "More for <stage>", Today rows) must exist on the stage
// page itself or inside the tracker it renders.
describe('stage-page anchors resolve', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
  const stagePage = read('../pages/dashboard/StagePage.tsx');
  const owners = stagePage + read('../components/dashboard/PregnancyTracker.tsx');
  const targets = new Set<string>();
  for (const m of LIFE_STAGES) for (const w of [10, 30, 34, 38]) {
    for (const a of actionsFor(m, w)) targets.add(a.target);
    targets.add(primaryActionFor(m, { weeksPregnant: w }).target);
    for (const r of moreFor(m, { weeksPregnant: w })) targets.add(r.target);
    for (const i of todayItems(m, { periodDaysUntil: 5 })) targets.add(i.target);
  }
  const anchors = [...targets].filter(t => t.startsWith('/dashboard/stage#')).map(t => t.split('#')[1]);

  it('collects the anchors', () => {
    expect(anchors.length).toBeGreaterThan(8);
  });
  it.each([...new Set(anchors)])('#%s exists on /dashboard/stage', (id) => {
    expect(owners).toMatch(new RegExp(`id="${id}"`));
  });
});
