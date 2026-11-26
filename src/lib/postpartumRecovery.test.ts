import { describe, it, expect } from 'vitest';
import {
  CHECK_ITEMS, RED_FLAGS, URGENT_MESSAGE, assessCheckin, entryForWeek, inCheckinWindow, isComplete,
  parseCheckins, recoveryTrend, upsertCheckin, weekPostpartum, type CheckinEntry,
} from './postpartumRecovery';

const ok = { bleeding: 'light', pain: 'mild', wound: 'healing', pelvic: 'fine', sleep: 'ok', mood: 'ok' } as const;
const entry = (week: number, answers: CheckinEntry['answers'] = ok, redFlags: CheckinEntry['redFlags'] = []): CheckinEntry =>
  ({ week, date: '2026-11-01', answers, redFlags });

describe('postpartum recovery check-in', () => {
  it('counts weeks after birth from week 1', () => {
    const birth = new Date(2026, 10, 1);
    expect(weekPostpartum(birth, new Date(2026, 10, 1, 18))).toBe(1);
    expect(weekPostpartum(birth, new Date(2026, 10, 7))).toBe(1);
    expect(weekPostpartum(birth, new Date(2026, 10, 8))).toBe(2);
    expect(weekPostpartum(birth, new Date(2026, 9, 30))).toBeNull();
    expect(weekPostpartum(null)).toBeNull();
  });

  it('is offered for the first 12 weeks only', () => {
    const birth = new Date(2026, 0, 1);
    expect(inCheckinWindow(birth, new Date(2026, 2, 25))).toBe(true); // day 83 -> week 12
    expect(inCheckinWindow(birth, new Date(2026, 2, 26))).toBe(false); // day 84 -> week 13
  });

  it('covers the six areas', () => {
    expect(CHECK_ITEMS.map(i => i.id)).toEqual(['bleeding', 'pain', 'wound', 'pelvic', 'sleep', 'mood']);
  });

  it('lists the NHS red flags', () => {
    const text = RED_FLAGS.map(f => f.label).join(' ');
    for (const word of [/pad in an hour/, /38/, /swollen/, /Chest pain/, /harming yourself/]) expect(text).toMatch(word);
    expect(URGENT_MESSAGE).toMatch(/144/);
  });

  it('all expected answers -> ok', () => {
    expect(assessCheckin(entry(1))).toMatchObject({ level: 'ok', urgent: [], talk: [], watch: [], suggestEpds: false });
  });

  it('any red flag -> urgent, whatever the answers', () => {
    const a = assessCheckin(entry(2, ok, ['leg']));
    expect(a.level).toBe('urgent');
    expect(a.urgent).toEqual(['leg']);
  });

  it('heavy bleeding and self-harm answers are red flags on their own', () => {
    const a = assessCheckin(entry(1, { ...ok, bleeding: 'heavy', mood: 'self-harm' }));
    expect(a.level).toBe('urgent');
    expect(a.urgent).toEqual(['heavy-bleeding', 'self-harm']);
    expect(a.selfHarm).toBe(true);
    expect(a.suggestEpds).toBe(true);
  });

  it('dedupes a flag ticked and answered', () => {
    expect(assessCheckin(entry(1, { ...ok, bleeding: 'heavy' }, ['heavy-bleeding'])).urgent).toEqual(['heavy-bleeding']);
  });

  it('sorts concerns into talk and watch, and points low mood at the EPDS', () => {
    const a = assessCheckin(entry(3, { ...ok, wound: 'infected', sleep: 'tired', mood: 'up-down' }));
    expect(a.level).toBe('talk');
    expect(a.talk).toEqual(['wound']);
    expect(a.watch).toEqual(['sleep', 'mood']);
    expect(a.suggestEpds).toBe(true);
  });

  it('knows when all six are answered', () => {
    expect(isComplete(ok)).toBe(true);
    expect(isComplete({ ...ok, mood: undefined })).toBe(false);
  });

  it('parses stored check-ins defensively, one per week', () => {
    expect(parseCheckins('nope')).toEqual([]);
    expect(parseCheckins({})).toEqual([]);
    const list = parseCheckins(JSON.stringify([
      entry(3),
      { week: 1, date: '2026-10-01', answers: { bleeding: 'period', pain: 'zzz' }, redFlags: ['fever', 'bogus'] },
      { week: 0, date: '2026-10-01', answers: {} },
      { week: 2, date: 'bad', answers: {} },
      { ...entry(3), answers: { ...ok, pain: 'worse' } },
    ]));
    expect(list.map(e => e.week)).toEqual([1, 3]);
    expect(list[0].answers).toEqual({ bleeding: 'period' });
    expect(list[0].redFlags).toEqual(['fever']);
    expect(list[1].answers.pain).toBe('worse');
  });

  it('upserts by week', () => {
    let list = upsertCheckin([], entry(2));
    list = upsertCheckin(list, entry(1));
    list = upsertCheckin(list, entry(2, { ...ok, pain: 'worse' }));
    expect(list.map(e => e.week)).toEqual([1, 2]);
    expect(entryForWeek(list, 2)?.answers.pain).toBe('worse');
    expect(entryForWeek(list, 5)).toBeNull();
  });

  it('builds a week-by-week trend with gaps and direction', () => {
    const list = [
      entry(1, { ...ok, bleeding: 'period', sleep: 'cannot' }),
      entry(3, { ...ok, bleeding: 'light', sleep: 'cannot', pain: 'worse' }),
    ];
    const t = recoveryTrend(list);
    const bleeding = t.find(x => x.item === 'bleeding')!;
    expect(bleeding.points).toEqual([{ week: 1, score: 1 }, { week: 2, score: null }, { week: 3, score: 0 }]);
    expect(bleeding.direction).toBe('better');
    expect(t.find(x => x.item === 'sleep')!.direction).toBe('same');
    expect(t.find(x => x.item === 'pain')!.direction).toBe('worse');
    expect(recoveryTrend([entry(1)])[0].direction).toBeNull();
  });
});
