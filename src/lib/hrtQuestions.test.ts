import { describe, it, expect } from 'vitest';
import { computeMenopauseInsight, type SignalInput } from './menopauseInsights';
import {
  frequentSymptoms,
  hrtStatus,
  joinList,
  mergeIntoVisitList,
  suggestHrtQuestions,
  MAX_HRT_QUESTIONS,
  MIN_HRT_QUESTIONS,
} from './hrtQuestions';
import { MAX_QUESTIONS } from './visitQuestions';

const NOW = new Date(2026, 10, 26, 12, 0, 0);
const dayAgo = (n: number) => {
  const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
function rows(from: number, to: number, fn: (ago: number) => Partial<SignalInput>): SignalInput[] {
  const out: SignalInput[] = [];
  for (let a = from; a < to; a++) out.push({ signal_date: dayAgo(a), ...fn(a) });
  return out;
}

// Words that would turn a question into advice or a diagnosis.
const ADVICE = /\b(you should|you need to|start taking|stop taking|you have|diagnos|recommend)\b/i;

function check(qs: Array<{ id: string; text: string }>) {
  expect(qs.length).toBeGreaterThanOrEqual(MIN_HRT_QUESTIONS);
  expect(qs.length).toBeLessThanOrEqual(MAX_HRT_QUESTIONS);
  expect(new Set(qs.map(q => q.id)).size).toBe(qs.length);
  for (const q of qs) {
    expect(q.id.startsWith('hrt:')).toBe(true);
    expect(q.text.trim().endsWith('?')).toBe(true);
    expect(q.text).not.toMatch(ADVICE);
    expect(q.text.length).toBeLessThanOrEqual(300);
  }
}

const vasomotor = rows(0, 84, () => ({ notes: 'Hot flashes: 5. Sleep: 5h', symptoms: ['Night sweats'] }));

describe('joinList', () => {
  it('joins with commas and "and"', () => {
    expect(joinList([])).toBe('');
    expect(joinList(['a'])).toBe('a');
    expect(joinList(['a', 'b', 'c'])).toBe('a, b and c');
  });
});

describe('frequentSymptoms', () => {
  it('names what she logs often, including short sleep', () => {
    const i = computeMenopauseInsight(vasomotor, [], NOW);
    expect(frequentSymptoms(i)).toEqual(['hot_flushes', 'night_sweats', 'sleep']);
  });
  it('nothing logged: nothing named', () => {
    expect(frequentSymptoms(computeMenopauseInsight([], [], NOW))).toEqual([]);
  });
});

describe('hrtStatus', () => {
  it('no medicines -> none; vitamins alone -> none', () => {
    expect(hrtStatus([], NOW).kind).toBe('none');
    expect(hrtStatus([{ name: 'Vitamin D', started_on: dayAgo(10) }], NOW).kind).toBe('none');
  });
  it('an HRT medicine without an end date is current', () => {
    const s = hrtStatus([{ name: 'HRT', started_on: dayAgo(30), active: true }], NOW);
    expect(s.kind).toBe('current');
  });
  it('a stopped HRT medicine is stopped; a current one wins over a stopped one', () => {
    expect(hrtStatus([{ name: 'Estradiol', active: false, stopped_on: dayAgo(5) }], NOW).kind).toBe('stopped');
    expect(hrtStatus([
      { name: 'Estradiol', active: false, stopped_on: dayAgo(5) },
      { name: 'Oestrogel', started_on: dayAgo(4), active: true },
    ], NOW)).toMatchObject({ kind: 'current', name: 'Oestrogel' });
  });
});

describe('suggestHrtQuestions', () => {
  it('no medicines, frequent symptoms: names them and asks about options with and without hormones', () => {
    const i = computeMenopauseInsight(vasomotor, [], NOW);
    const qs = suggestHrtQuestions({ insight: i, medications: [], stage: 'menopause', now: NOW });
    check(qs);
    expect(qs[0].text).toMatch(/hot flushes, night sweats and poor sleep/);
    expect(qs[0].text).toMatch(/perimenopause or menopause/);
    expect(qs.some(q => q.id === 'hrt:benefits')).toBe(true);
    expect(qs.some(q => q.id === 'hrt:history')).toBe(true);
  });

  it('sparse logs: still 3-5 neutral questions, none naming symptoms', () => {
    const i = computeMenopauseInsight(rows(0, 2, () => ({ notes: 'Hot flashes: 3' })), [], NOW);
    const qs = suggestHrtQuestions({ insight: i, medications: [], stage: 'menopause', now: NOW });
    check(qs);
    expect(qs.map(q => q.text).join(' ')).not.toMatch(/I have been logging/);
  });

  it('no logs at all: still the minimum number of questions', () => {
    const qs = suggestHrtQuestions({ insight: computeMenopauseInsight([], [], NOW), medications: [], stage: 'post-menopause', now: NOW });
    check(qs);
  });

  it('on HRT without an end date: asks how to review it, names the start date', () => {
    const meds = [{ name: 'HRT', started_on: dayAgo(40), active: true }];
    const signals = rows(0, 84, a => ({ notes: `Hot flashes: ${a >= 40 ? 5 : 1}` }));
    const i = computeMenopauseInsight(signals, meds, NOW);
    const qs = suggestHrtQuestions({ insight: i, medications: meds, stage: 'menopause', now: NOW });
    check(qs);
    expect(qs[0].id).toBe('hrt:review');
    expect(qs[0].text).toMatch(/^I started HRT on \d{1,2} [A-Z][a-z]{2}\./);
    expect(qs.some(q => q.id === 'hrt:benefits')).toBe(false);
  });

  it('on HRT and hot flushes not better: asks whether that is expected', () => {
    const meds = [{ name: 'Estradiol patch', started_on: dayAgo(40), active: true }];
    const signals = rows(0, 84, () => ({ notes: 'Hot flashes: 5' }));
    const i = computeMenopauseInsight(signals, meds, NOW);
    const qs = suggestHrtQuestions({ insight: i, medications: meds, stage: 'menopause', now: NOW });
    expect(qs.find(q => q.id === 'hrt:still')?.text).toMatch(/not changed much since I started/);
  });

  it('stopped HRT: asks what to watch for', () => {
    const meds = [{ name: 'Femoston', started_on: dayAgo(300), active: false, stopped_on: dayAgo(20) }];
    const qs = suggestHrtQuestions({ insight: computeMenopauseInsight(vasomotor, meds, NOW), medications: meds, stage: 'menopause', now: NOW });
    check(qs);
    expect(qs[0].text).toMatch(/^I stopped Femoston on /);
  });

  it('age 60+ adds the timing question; joint pain adds its own', () => {
    const signals = rows(0, 84, () => ({ symptoms: ['Joint pain'] }));
    const qs = suggestHrtQuestions({ insight: computeMenopauseInsight(signals, [], NOW), medications: [], stage: 'post-menopause', age: 63, now: NOW });
    check(qs);
    expect(qs.map(q => q.id)).toEqual(expect.arrayContaining(['hrt:joints']));
    const qs2 = suggestHrtQuestions({ insight: computeMenopauseInsight([], [], NOW), medications: [], stage: 'post-menopause', age: 63, now: NOW });
    expect(qs2.map(q => q.id)).toContain('hrt:timing');
  });
});

describe('mergeIntoVisitList', () => {
  it('adds new questions, skips ones already there, keeps her ticks', () => {
    const existing = [
      { id: 'own:1', text: 'My own question?', asked: true },
      { id: 'x', text: 'What are the possible benefits and risks of HRT for someone with my age and health history?', asked: false },
    ];
    const { list, added } = mergeIntoVisitList(existing, [
      { id: 'hrt:benefits', text: 'What are the possible benefits and risks of HRT for someone with my age and health history?' },
      { id: 'hrt:history', text: 'History?' },
    ]);
    expect(added).toBe(1);
    expect(list).toHaveLength(3);
    expect(list[0].asked).toBe(true);
    expect(list[2]).toEqual({ id: 'hrt:history', text: 'History?', asked: false });
  });
  it('adding twice changes nothing the second time', () => {
    const s = [{ id: 'hrt:a', text: 'A?' }];
    const first = mergeIntoVisitList([], s);
    const second = mergeIntoVisitList(first.list, s);
    expect(second.added).toBe(0);
    expect(second.list).toEqual(first.list);
  });
  it('respects the 20-question cap', () => {
    const full = Array.from({ length: MAX_QUESTIONS }, (_, i) => ({ id: `q${i}`, text: `Q${i}?`, asked: false }));
    expect(mergeIntoVisitList(full, [{ id: 'hrt:a', text: 'A?' }]).added).toBe(0);
  });
});
