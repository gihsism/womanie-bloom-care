import { describe, it, expect } from 'vitest';
import {
  approx,
  computeMenopauseInsight,
  medicineEvents,
  medicinePriority,
  shortDate,
  startDate,
  stopDate,
  type SignalInput,
} from './menopauseInsights';

// Local noon, so day arithmetic never trips on time zones.
const NOW = new Date(2026, 10, 26, 12, 0, 0); // 26 Nov 2026
const dayAgo = (n: number) => {
  const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** One row per day for days [from, to) ago, built by fn(daysAgo). */
function rows(from: number, to: number, fn: (ago: number) => Partial<SignalInput> | null): SignalInput[] {
  const out: SignalInput[] = [];
  for (let a = from; a < to; a++) {
    const r = fn(a);
    if (r) out.push({ signal_date: dayAgo(a), ...r });
  }
  return out;
}

const hot = (n: number, extra = '') => ({ notes: `Hot flashes: ${n}${extra}` });
const metric = (i: ReturnType<typeof computeMenopauseInsight>, key: string) => i.metrics.find(m => m.key === key)!;

describe('helpers', () => {
  it('approx rounds whole numbers from 2 up and halves below', () => {
    expect(approx(5.2, 'count')).toBe('~5');
    expect(approx(1.7, 'count')).toBe('~1.5');
    expect(approx(0.3, 'count')).toBe('~0.5');
    expect(approx(6.8, 'hours')).toBe('~7');
    expect(approx(6.3, 'hours')).toBe('~6.5');
  });
  it('shortDate is "3 Oct"', () => {
    expect(shortDate(new Date(2026, 9, 3))).toBe('3 Oct');
  });
  it('classifies hormone, other menopause and other medicines', () => {
    expect(medicinePriority('HRT')).toBe(0);
    expect(medicinePriority('Estradiol gel')).toBe(0);
    expect(medicinePriority('Oestrogel')).toBe(0);
    expect(medicinePriority('Utrogestan 100 mg')).toBe(0);
    expect(medicinePriority('Veoza')).toBe(1);
    expect(medicinePriority('Vitamin D')).toBe(2);
  });
});

describe('medicine dates', () => {
  it('a medicine without an end date is still being taken', () => {
    const m = { name: 'HRT', started_on: dayAgo(30), active: true };
    expect(stopDate(m)).toBeNull();
    expect(startDate(m)?.getDate()).toBe(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 30).getDate());
  });
  it('a stopped medicine uses stopped_on, else the last update', () => {
    expect(stopDate({ name: 'HRT', active: false, stopped_on: dayAgo(5), updated_at: dayAgo(1) })?.getTime())
      .toBe(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 5).getTime());
    expect(stopDate({ name: 'HRT', active: false, updated_at: `${dayAgo(2)}T09:00:00.000Z` })).not.toBeNull();
  });
  it('falls back to created_at when started_on is missing', () => {
    expect(startDate({ name: 'HRT', created_at: `${dayAgo(10)}T08:00:00Z` })).not.toBeNull();
    expect(startDate({ name: 'HRT' })).toBeNull();
  });
  it('lists events inside the window, hormone first', () => {
    const ev = medicineEvents([
      { name: 'Vitamin D', started_on: dayAgo(20) },
      { name: 'HRT patch', started_on: dayAgo(40) },
      { name: 'Old', started_on: dayAgo(400) },
    ], NOW);
    expect(ev.map(e => e.name)).toEqual(['HRT patch', 'Vitamin D']);
  });
});

describe('computeMenopauseInsight', () => {
  it('no logs: confidence none, no claims', () => {
    const i = computeMenopauseInsight([], [], NOW);
    expect(i.confidence).toBe('none');
    expect(i.loggedDays).toBe(0);
    expect(i.summary).toEqual([]);
    expect(i.metrics.every(m => m.sentence === null)).toBe(true);
    expect(i.metrics[0].weekly).toHaveLength(12);
  });

  it('sparse logs: low confidence, a note, and no from -> to claims', () => {
    const signals = [...rows(60, 63, () => hot(6)), ...rows(1, 4, () => hot(1))];
    const i = computeMenopauseInsight(signals, [{ name: 'HRT', started_on: dayAgo(30) }], NOW);
    expect(i.confidence).toBe('low');
    expect(i.confidenceNote).toMatch(/Only 6 days logged/);
    expect(i.summary).toEqual([]);
    expect(i.event).toBeNull();
    expect(metric(i, 'hot_flushes').before).toBeNull();
    // The weekly bars still show what she logged.
    expect(metric(i, 'hot_flushes').weekly.filter(v => v != null)).toHaveLength(2);
  });

  it('links a drop in hot flushes to an HRT start date (no end date)', () => {
    const start = 40; // started 40 days ago, still taking it
    const signals = rows(0, 84, a => (a % 2 === 0 ? hot(a >= start ? 5 : 2) : null));
    const i = computeMenopauseInsight(signals, [{ name: 'HRT', started_on: dayAgo(start), active: true }], NOW);
    expect(i.confidence).toBe('high');
    expect(i.event?.kind).toBe('start');
    const h = metric(i, 'hot_flushes');
    expect(h.kind).toBe('count');
    expect(h.before).toBe(5);
    expect(h.after).toBe(2);
    expect(h.direction).toBe('down');
    expect(h.improved).toBe(true);
    expect(i.summary[0]).toBe(`Hot flushes down from ~5 to ~2 a day since you started HRT on ${shortDate(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - start))}.`);
    expect(i.caveat).toMatch(/can't show that the medicine caused/);
  });

  it('links to a stop date when a hormone medicine was stopped', () => {
    const stop = 30;
    const signals = rows(0, 84, a => hot(a >= stop ? 1 : 4));
    const i = computeMenopauseInsight(signals, [{ name: 'Estradiol patch', started_on: dayAgo(300), active: false, stopped_on: dayAgo(stop) }], NOW);
    expect(i.event?.kind).toBe('stop');
    expect(i.summary[0]).toMatch(/^Hot flushes up from ~1 to ~4 a day since you stopped Estradiol patch on /);
    expect(metric(i, 'hot_flushes').improved).toBe(false);
  });

  it('no medicines: compares earlier weeks with the last 4', () => {
    const signals = rows(0, 84, a => ({ notes: `Hot flashes: ${a >= 28 ? 6 : 3}. Sleep: ${a >= 28 ? 5.5 : 7}h` }));
    const i = computeMenopauseInsight(signals, [], NOW);
    expect(i.event).toBeNull();
    expect(i.caveat).toBeNull();
    expect(i.summary).toContain('Hot flushes down from ~6 to ~3 a day over the last 12 weeks.');
    expect(i.summary).toContain('Sleep up from ~5.5 to ~7 hours a night over the last 12 weeks.');
    expect(metric(i, 'sleep').improved).toBe(true);
  });

  it('a medicine started too recently is not used as the anchor', () => {
    const signals = rows(0, 84, () => hot(3));
    const i = computeMenopauseInsight(signals, [{ name: 'HRT', started_on: dayAgo(3) }], NOW);
    expect(i.event).toBeNull();
    expect(metric(i, 'hot_flushes').direction).toBe('steady');
    expect(i.summary[0]).toBe('Hot flushes about the same, ~3 a day over the last 12 weeks.');
  });

  it('prefers a hormone medicine over a vitamin started later', () => {
    const signals = rows(0, 84, a => hot(a >= 50 ? 6 : 2));
    const i = computeMenopauseInsight(signals, [
      { name: 'Vitamin D', started_on: dayAgo(20) },
      { name: 'Femoston', started_on: dayAgo(50) },
    ], NOW);
    expect(i.event?.name).toBe('Femoston');
  });

  it('counts symptom tags as days a week: night sweats, joint pain, low mood', () => {
    const signals = rows(0, 84, a => ({
      symptoms: a >= 28 ? ['Night sweats', 'Joint pain'] : (a % 7 === 0 ? ['Night sweats'] : ['Fatigue']),
      mood: a >= 28 ? ['calm'] : ['anxious'],
    }));
    const i = computeMenopauseInsight(signals, [], NOW);
    const ns = metric(i, 'night_sweats');
    expect(ns.kind).toBe('perWeek');
    expect(ns.before).toBe(7);
    expect(ns.after).toBe(1);
    expect(ns.sentence).toBe('Night sweats down from ~7 to ~1 night a week over the last 12 weeks.');
    expect(metric(i, 'joint_pain').sentence).toBe('Joint pain down from ~7 to ~0 days a week over the last 12 weeks.');
    expect(metric(i, 'mood').direction).toBe('up');
    expect(metric(i, 'mood').improved).toBe(false);
    // No sleep data at all: no sentence for it.
    expect(metric(i, 'sleep').sentence).toBeNull();
    expect(i.summary).toHaveLength(3);
  });

  it('uses the "Hot flashes" tag as days a week when no counts were typed', () => {
    const signals = rows(0, 84, a => ({ symptoms: a < 28 || a % 2 === 0 ? ['Hot flashes'] : ['Headache'] }));
    const h = metric(computeMenopauseInsight(signals, [], NOW), 'hot_flushes');
    expect(h.kind).toBe('perWeek');
    expect(h.before).toBe(3.5);
    expect(h.after).toBe(7);
  });

  it('poor-sleep nights from quality ratings when no hours were logged', () => {
    const signals = rows(0, 84, a => ({ notes: `Sleep quality: ${a >= 28 ? 1 : 4}/5` }));
    const s = metric(computeMenopauseInsight(signals, [], NOW), 'sleep');
    expect(s.label).toBe('Poor-sleep nights');
    expect(s.direction).toBe('down');
    expect(s.improved).toBe(true);
  });

  it('ignores rows outside the window, unreadable dates and empty rows', () => {
    const signals: SignalInput[] = [
      { signal_date: dayAgo(200), notes: 'Hot flashes: 9' },
      { signal_date: 'not a date', notes: 'Hot flashes: 9' },
      { signal_date: dayAgo(-2), notes: 'Hot flashes: 9' },
      { signal_date: dayAgo(1), notes: '', symptoms: [], mood: null },
      { signal_date: dayAgo(2), notes: 'Hot flashes: 4' },
    ];
    const i = computeMenopauseInsight(signals, [], NOW);
    expect(i.loggedDays).toBe(1);
  });

  it('medium confidence between 10 and 29 logged days', () => {
    const signals = rows(0, 84, a => (a % 4 === 0 ? hot(3) : null)); // 21 days
    const i = computeMenopauseInsight(signals, [], NOW);
    expect(i.confidence).toBe('medium');
    expect(i.confidenceNote).toMatch(/21 logged days across 12 weeks/);
  });

  it('accepts symptoms stored as a JSON string', () => {
    const signals = rows(0, 84, () => ({ symptoms: '["Joint pain"]' }));
    expect(metric(computeMenopauseInsight(signals, [], NOW), 'joint_pain').after).toBe(7);
  });

  it('later summary sentences say "since then" instead of repeating the medicine', () => {
    const start = 40;
    const signals = rows(0, 84, a => ({ notes: `Hot flashes: ${a >= start ? 6 : 2}. Sleep: ${a >= start ? 5 : 7}h` }));
    const i = computeMenopauseInsight(signals, [{ name: 'HRT', started_on: dayAgo(start) }], NOW);
    expect(i.summary[0]).toMatch(/since you started HRT on/);
    expect(i.summary[1]).toBe('Sleep up from ~5 to ~7 hours a night since then.');
  });
});
