import { describe, it, expect } from 'vitest';
import { buildLifeContext } from './life-context';

const now = new Date('2026-11-14T12:00:00Z');
const h = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3600_000).toISOString();

describe('buildLifeContext', () => {
  it('returns empty string when nothing is logged', () => {
    expect(buildLifeContext({ now, medications: [], events: [], birth: null, babies: [] })).toBe('');
  });

  it('summarises medicines with doses in the last 7 days', () => {
    const out = buildLifeContext({
      now,
      medications: [{ id: 'm1', name: 'Iron', dose: '100 mg', reminder_times: ['08:00'] }],
      events: [
        { kind: 'med_dose', occurred_at: h(2), data: { medication_id: 'm1' } },
        { kind: 'med_dose', occurred_at: h(26), data: JSON.stringify({ medication_id: 'm1' }) },
      ],
      birth: null, babies: [],
    });
    expect(out).toContain('Iron 100 mg, reminders 08:00; taken 2 time(s)');
  });

  it('summarises a baby: feeds, nappies, sleep, growth', () => {
    const baby = { id: 'b1', name: 'Mia', birth_date: '2026-11-01' };
    const ev = (kind: string, hoursAgo: number, data: object, endedMin?: number) => ({
      kind, baby_id: 'b1', occurred_at: h(hoursAgo), data,
      ended_at: endedMin ? new Date(Date.parse(h(hoursAgo)) + endedMin * 60000).toISOString() : null,
    });
    const out = buildLifeContext({
      now, medications: [], birth: null, babies: [baby],
      events: [
        ev('feed', 1, { method: 'breast_l' }, 15), ev('feed', 4, { method: 'breast_r' }, 12), ev('feed', 7, { method: 'bottle', ml: 90 }),
        ev('nappy', 2, { type: 'wet' }), ev('nappy', 5, { type: 'both' }),
        ev('baby_sleep', 3, {}, 90),
        ev('baby_growth', 48, { weight_g: 3600 }),
      ],
    });
    expect(out).toContain('## Baby: Mia (born 2026-11-01)');
    expect(out).toContain('Last 24h feeds: 3 (left 1, right 1, bottle 1, 90 ml), average gap 3h, longest 3h');
    expect(out).toContain('Last 24h nappies: 2 wet, 1 dirty');
    expect(out).toContain('Last 24h sleep: 1h 30m over 1 sleeps');
    expect(out).toContain('3600 g');
  });

  it('includes birth record and labour medicines', () => {
    const out = buildLifeContext({
      now, medications: [], babies: [],
      birth: { birth_at: '2026-11-01T14:20:00Z', delivery_type: 'Vaginal birth', pain_relief: ['Epidural'], birth_weight_g: 3350, apgar_1: 8, apgar_5: 9 },
      events: [{ kind: 'labour_med', occurred_at: '2026-11-01T09:30:00Z', data: { name: 'Oxytocin', dose: null } }],
    });
    expect(out).toContain('born 2026-11-01 14:20 UTC; Vaginal birth; pain relief: Epidural; birth weight 3350 g; Apgar 8/9');
    expect(out).toContain('Medicines during labour: Oxytocin at 2026-11-01 09:30');
  });

  it('summarises recent contractions and ignores old ones', () => {
    const c = (hoursAgo: number) => ({ kind: 'contraction', occurred_at: h(hoursAgo), ended_at: new Date(Date.parse(h(hoursAgo)) + 60000).toISOString(), data: {} });
    const out = buildLifeContext({ now, medications: [], birth: null, babies: [], events: [c(0.1), c(0.2), c(100)] });
    expect(out).toContain('Contractions timed: 2, average length 60 s, average start-to-start 6m');
  });
});
