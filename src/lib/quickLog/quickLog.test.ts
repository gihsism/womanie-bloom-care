import { describe, it, expect } from 'vitest';
import { LIFE_STAGES } from '@/lib/lifeStage';
import { EMPTY_ROW, type DailyRow, getSegment, hotFlushCount, hotFlushEdit, moodEdit, segmentEdit, setSegment, splitNotes, symptomEdit } from './daily';
import { MAX_TILES, tilesFor, type Tile } from './tiles';
import { EMPTY_STATE, badgeFor, kicksTodayCount, loggedRows, tapKey, type QuickLogState } from './state';

// The Log sheet's symptom and mood lists (DailyLogging): a tile may only
// write a value the sheet itself offers, so both always agree.
const SHEET_SYMPTOMS = ['Cramps', 'Headache', 'Bloating', 'Breast tenderness', 'Back pain', 'Fatigue', 'Nausea', 'Acne', 'Insomnia', 'Cravings', 'Dizziness', 'Hot flashes', 'Joint pain', 'Anxiety'];
const SHEET_MOODS = ['happy', 'calm', 'neutral', 'sad', 'irritable', 'anxious', 'loving', 'tired'];
const SHEET_SEGMENTS: Record<string, string[]> = {
  Intercourse: ['no', 'yes-protected', 'yes-unprotected'],
  'LH test': ['not-tested', 'positive', 'negative'],
};

describe('daily row edits (same format as the Log sheet)', () => {
  it('keeps decimals whole when splitting notes', () => {
    expect(splitNotes('BBT: 36.6°C. Sleep: 7.5h. felt fine')).toEqual(['BBT: 36.6°C', 'Sleep: 7.5h', 'felt fine']);
  });

  it('sets, replaces and removes one segment, leaving the rest', () => {
    const n = 'BBT: 36.6°C. my note';
    const withPill = setSegment(n, 'Pill', 'on-time');
    expect(withPill).toBe('BBT: 36.6°C. Pill: on-time. my note');
    expect(getSegment(withPill, 'Pill')).toBe('on-time');
    expect(setSegment(withPill, 'Pill', 'missed')).toBe('BBT: 36.6°C. Pill: missed. my note');
    expect(setSegment(withPill, 'Pill', null)).toBe(n);
  });

  it('a symptom tap adds once and Undo removes only that symptom', () => {
    const e = symptomEdit('Cramps');
    const r = e.apply({ ...EMPTY_ROW, symptoms: ['Headache'] });
    expect(r.symptoms).toEqual(['Headache', 'Cramps']);
    expect(e.already(r)).toBe(true);
    // something else logged in between survives the undo
    expect(e.revert({ ...r, symptoms: [...r.symptoms!, 'Acne'] }).symptoms).toEqual(['Headache', 'Acne']);
    expect(e.revert({ ...EMPTY_ROW, symptoms: ['Cramps'] }).symptoms).toBeNull();
  });

  it('mood and segment edits undo to what was there before', () => {
    const m = moodEdit('sad');
    expect(m.revert(m.apply(EMPTY_ROW)).mood).toBeNull();
    const s = segmentEdit('Pill', 'missed');
    const after = s.apply({ ...EMPTY_ROW, notes: 'Pill: late' });
    expect(getSegment(after.notes, 'Pill')).toBe('missed');
    expect(s.revert(after).notes).toBe('Pill: late');
  });

  it('hot flushes count up per tap and down on Undo', () => {
    let r: DailyRow = { ...EMPTY_ROW, notes: 'Sleep: 6h' };
    r = hotFlushEdit.apply(r); r = hotFlushEdit.apply(r);
    expect(hotFlushCount(r)).toBe(2);
    expect(r.notes).toContain('Sleep: 6h');
    r = hotFlushEdit.revert(hotFlushEdit.revert(r));
    expect(r.notes).toBe('Sleep: 6h');
  });
});

describe('tiles per stage', () => {
  const all = (t: Tile[]) => t.map(x => x.label);

  it.each(LIFE_STAGES)('%s: 4-6 tiles, short labels, unique ids, only stored kinds of entry', (mode) => {
    const tiles = tilesFor(mode, { weeksPregnant: 30, hasBaby: true, meds: [{ id: 'm1', name: 'Progesterone', dose: null, times_per_day: 2 }] });
    expect(tiles.length).toBeGreaterThanOrEqual(4);
    expect(tiles.length).toBeLessThanOrEqual(MAX_TILES);
    expect(new Set(tiles.map(t => t.id)).size).toBe(tiles.length);
    for (const t of tiles) {
      expect(t.label.split(' ').length).toBeLessThanOrEqual(2);
      const a = t.action;
      if (a.kind === 'symptom') expect(SHEET_SYMPTOMS).toContain(a.value);
      if (a.kind === 'mood') expect(SHEET_MOODS).toContain(a.value);
      if (a.kind === 'choice') for (const o of a.options) expect(SHEET_SEGMENTS[a.segment]).toContain(o.value);
      expect(t.details).toBeTruthy();
    }
  });

  it('matches the idea-4 mock for pregnancy (week 30) and period tracking', () => {
    expect(all(tilesFor('pregnancy', { weeksPregnant: 30 }))).toEqual(['Kick', 'Contraction', 'Nausea', 'Back pain', 'Weight', 'Note']);
    expect(all(tilesFor('menstrual-cycle'))).toEqual(['Period', 'Spotting', 'Cramps', 'Headache', 'Low mood', 'Sex']);
  });

  it('early pregnancy has no kick or contraction tile', () => {
    expect(all(tilesFor('pregnancy', { weeksPregnant: 12 }))).not.toContain('Kick');
  });

  it('after birth: feeds as left/right timers, bottle, nappies, sleep — or "Add baby" first', () => {
    expect(all(tilesFor('postpartum', { hasBaby: true }))).toEqual(['Left', 'Right', 'Bottle', 'Wet', 'Dirty', 'Sleep']);
    expect(all(tilesFor('postpartum', { hasBaby: false }))[0]).toBe('Add baby');
  });

  it('IVF shows today\'s medicines as a dose checklist', () => {
    const t = tilesFor('ivf', { meds: [{ id: 'a', name: 'Gonal-f', dose: null, times_per_day: 1 }] });
    expect(t[0]).toMatchObject({ label: 'Gonal-f', action: { kind: 'dose', medicationId: 'a', perDay: 1 } });
    expect(all(tilesFor('ivf'))[0]).toBe('Add medicine');
  });

  it('contraception: pill tiles only for a daily pill', () => {
    expect(all(tilesFor('contraception'))).toContain('Pill taken');
    expect(all(tilesFor('contraception', { dailyPill: false }))).not.toContain('Pill taken');
  });
});

describe('badges and the Today rows', () => {
  const now = new Date(2026, 10, 24, 11, 0);
  const at = (h: number, m: number) => new Date(2026, 10, 24, h, m).toISOString();
  const state: QuickLogState = {
    ...EMPTY_STATE,
    row: { symptoms: ['Back pain'], mood: ['sad'], notes: 'Hot flashes: 3' },
    taps: { [tapKey.symptom('Back pain')]: at(7, 30), [tapKey.segment('Hot flashes')]: at(10, 5) },
    kickSession: { startedAt: new Date(at(9, 0)).getTime(), taps: [1, 2, 3].map(i => new Date(at(9, i)).getTime()) },
    events: [
      { id: 'k', kind: 'kick_session', occurred_at: at(6, 0), ended_at: at(6, 20), data: { count: 10 } },
      { id: 'n1', kind: 'nappy', occurred_at: at(8, 0), ended_at: null, data: { type: 'both' } },
      { id: 'd1', kind: 'med_dose', occurred_at: at(8, 5), ended_at: null, data: { medication_id: 'm1', name: 'Progesterone' } },
    ],
    running: { contraction: new Date(at(10, 59)).getTime() },
  };

  it('counts kicks across saved sessions and the one in progress', () => {
    expect(kicksTodayCount(state, now)).toBe(13);
  });

  it('gives count, tick, timer and dose badges', () => {
    const [kick, contraction, , backPain] = tilesFor('pregnancy', { weeksPregnant: 30 });
    expect(badgeFor(kick, state, now)).toEqual({ count: '13' });
    expect(badgeFor(contraction, state, now).runningSince).toBeDefined();
    expect(badgeFor(backPain, state, now)).toEqual({ done: true });
    const [flush] = tilesFor('menopause');
    expect(badgeFor(flush, state, now)).toEqual({ count: '3' });
    const wet = tilesFor('postpartum', { hasBaby: true }).find(t => t.id === 'wet')!;
    expect(badgeFor(wet, state, now)).toEqual({ count: '1' }); // 'both' counts as wet
    const [dose] = tilesFor('ivf', { meds: [{ id: 'm1', name: 'Progesterone', dose: null, times_per_day: 2 }] });
    expect(badgeFor(dose, state, now)).toEqual({ count: '1/2', done: false });
  });

  it('lists what was logged today with times, newest first', () => {
    const rows = loggedRows(state, now);
    expect(rows.map(r => r.label)).toEqual(expect.arrayContaining(['Kicks · 13 so far', 'Back pain', 'Mood: low', 'Hot flushes · 3', 'Progesterone taken']));
    const times = rows.filter(r => r.time).map(r => r.time!.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(rows.find(r => r.label === 'Back pain')!.time!.getHours()).toBe(7);
    // logged in the sheet: no tap time, listed last
    expect(rows[rows.length - 1].label).toBe('Mood: low');
  });
});
