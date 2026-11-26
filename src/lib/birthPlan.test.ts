import { describe, it, expect } from 'vitest';
import {
  BIRTH_PLAN_SECTIONS, EMPTY_PLAN, NOTE_MAX, birthPlanVisible, isPlanEmpty, parsePlan,
  planProgress, planStatusLine, planSummary, setNote, toggleChoice,
} from './birthPlan';

describe('birthPlan', () => {
  it('shows from week 28 only', () => {
    expect(birthPlanVisible(27)).toBe(false);
    expect(birthPlanVisible(28)).toBe(true);
    expect(birthPlanVisible(null)).toBe(false);
  });

  it('covers the agreed sections with Swiss places', () => {
    expect(BIRTH_PLAN_SECTIONS.map(s => s.id)).toEqual(
      ['place', 'companions', 'pain', 'positions', 'interventions', 'first-hour', 'feeding', 'special'],
    );
    const place = BIRTH_PLAN_SECTIONS[0].options.map(o => o.label).join(' ');
    expect(place).toMatch(/Geburtshaus/);
    expect(place).toMatch(/Spital/);
    expect(place).toMatch(/Hebamme/);
  });

  it('every option id is unique within its section', () => {
    for (const s of BIRTH_PLAN_SECTIONS) {
      expect(new Set(s.options.map(o => o.id)).size).toBe(s.options.length);
    }
  });

  it('options read as wishes, never as orders', () => {
    for (const s of BIRTH_PLAN_SECTIONS) {
      for (const o of s.options) expect(o.label).not.toMatch(/\b(I refuse|I demand|do not|never|must)\b/i);
    }
  });

  it('toggles a choice on and off and keeps catalogue order', () => {
    let p = toggleChoice(EMPTY_PLAN, 'pain', 'epidural');
    p = toggleChoice(p, 'pain', 'natural');
    expect(p.choices.pain).toEqual(['natural', 'epidural']);
    p = toggleChoice(p, 'pain', 'natural');
    p = toggleChoice(p, 'pain', 'epidural');
    expect(p.choices.pain).toBeUndefined();
    expect(EMPTY_PLAN.choices).toEqual({});
  });

  it('ignores unknown options', () => {
    expect(toggleChoice(EMPTY_PLAN, 'pain', 'nope')).toBe(EMPTY_PLAN);
  });

  it('sets, clips and clears notes', () => {
    let p = setNote(EMPTY_PLAN, 'special', 'x'.repeat(NOTE_MAX + 50));
    expect(p.notes.special).toHaveLength(NOTE_MAX);
    p = setNote(p, 'special', '   ');
    expect(p.notes.special).toBeUndefined();
  });

  it('parses stored plans defensively', () => {
    expect(parsePlan(null)).toEqual(EMPTY_PLAN);
    expect(parsePlan('not json')).toEqual(EMPTY_PLAN);
    const p = parsePlan(JSON.stringify({ choices: { pain: ['epidural', 'bogus'], hacked: ['x'] }, notes: { place: 'Spital Zollikerberg', feeding: 5 } }));
    expect(p.choices).toEqual({ pain: ['epidural'] });
    expect(p.notes).toEqual({ place: 'Spital Zollikerberg' });
  });

  it('counts progress and builds a summary of filled sections only', () => {
    expect(isPlanEmpty(EMPTY_PLAN)).toBe(true);
    expect(planStatusLine(EMPTY_PLAN)).toBe('Not started');
    let p = toggleChoice(EMPTY_PLAN, 'place', 'geburtshaus');
    p = setNote(p, 'feeding', 'Breastfed my first');
    expect(planProgress(p)).toEqual({ done: 2, total: 8 });
    expect(planStatusLine(p)).toBe('2 of 8 sections');
    const s = planSummary(p);
    expect(s.map(x => x.id)).toEqual(['place', 'feeding']);
    expect(s[0].wishes).toEqual(['Birth centre (Geburtshaus)']);
    expect(s[1]).toMatchObject({ wishes: [], note: 'Breastfed my first' });
  });
});
