import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PREGNANCY_SCHEDULE, SCHEDULE_ASK_LINE, SWISS_CHECKUPS_LINE, doneCount, glucoseTestInPregnancy, scheduleStatus,
} from './pregnancySchedule';

const item = (key: string) => PREGNANCY_SCHEDULE.find(i => i.key === key)!;

describe('PREGNANCY_SCHEDULE sources', () => {
  // Only steps the research library cites: every source must be a library item.
  const lib = JSON.parse(readFileSync(resolve(__dirname, '../../api/_lib/research/library.json'), 'utf8')) as {
    items: Array<{ id: string; url: string; lifeStages: string[]; summary: string; keyPoints: string[] }>;
  };
  const byId = new Map(lib.items.map(i => [i.id, i]));

  it('cites a research-library item with the same link for every step', () => {
    for (const s of PREGNANCY_SCHEDULE) {
      const src = byId.get(s.source.id);
      expect(src, s.key).toBeTruthy();
      expect(src!.url).toBe(s.source.url);
      expect(src!.lifeStages).toContain('pregnancy');
    }
  });

  it('each stated week appears in the cited source', () => {
    const text = (id: string) => { const i = byId.get(id)!; return [i.summary, ...i.keyPoints].join(' '); };
    expect(text(item('first-trimester-scan').source.id)).toContain('11 to 13+6');
    expect(text(item('mid-pregnancy-scan').source.id)).toMatch(/around (week )?20/);
    expect(text(item('glucose-test').source.id)).toContain('24 weeks');
    expect(text(item('chromosome-screening').source.id)).toMatch(/each pregnancy/);
  });

  it('Swiss notes cite an official Swiss source (BAG or SGGG) and match it', () => {
    expect(item('first-trimester-scan').swiss?.note).toContain('12 to 14');
    expect(item('mid-pregnancy-scan').swiss?.note).toContain('20 to 23');
    expect(item('chromosome-screening').swiss?.note).toContain('1 in 1000');
    expect(item('glucose-test').swiss?.note).toMatch(/24 and 28/);
    for (const s of PREGNANCY_SCHEDULE) {
      if (s.swiss) expect(s.swiss.source.url, s.key).toMatch(/^https:\/\/www\.(bag\.admin\.ch|rosenfluh\.ch)\//);
    }
    expect(SWISS_CHECKUPS_LINE.note).toMatch(/seven check-ups/);
    // KLV Art. 13 b quater (EDI 9 June 2026): first-trimester pre-eclampsia test covered from 1 July 2026.
    const pe = item('first-trimester-scan').swissMore;
    expect(pe?.note).toMatch(/1 July 2026/);
    expect(pe?.note).toMatch(/pre-eclampsia/);
    expect(pe?.source.url).toMatch(/^https:\/\/www\.bag\.admin\.ch\//);
  });

  it('sends the rest of the schedule to the midwife or doctor', () => {
    expect(SCHEDULE_ASK_LINE).toMatch(/ask your midwife or doctor/);
  });
});

describe('scheduleStatus', () => {
  it('upcoming, around now and earlier by week', () => {
    expect(scheduleStatus(item('first-trimester-scan'), 9, {}).label).toBe('In 2 weeks');
    expect(scheduleStatus(item('first-trimester-scan'), 12, {}).kind).toBe('now');
    expect(scheduleStatus(item('first-trimester-scan'), 16, {}).kind).toBe('earlier');
    expect(scheduleStatus(item('glucose-test'), 33, {}).kind).toBe('now');
    expect(scheduleStatus(item('chromosome-screening'), 12, {}).kind).toBe('anytime');
  });

  it('her mark wins, then a glucose result in her records', () => {
    expect(scheduleStatus(item('mid-pregnancy-scan'), 25, { 'mid-pregnancy-scan': { doneDate: '2026-10-02' } }))
      .toMatchObject({ kind: 'done', label: 'Done 2 Oct 2026', from: 'mark' });
    expect(scheduleStatus(item('glucose-test'), 27, {}, '2026-11-03'))
      .toMatchObject({ kind: 'done', label: 'Result in your records, 3 Nov 2026', from: 'record' });
    expect(doneCount(27, { 'first-trimester-scan': { doneDate: '2026-07-01' } }, '2026-11-03')).toBe(2);
  });
});

describe('glucoseTestInPregnancy', () => {
  const due = new Date(2027, 1, 1); // week 20 starts 2026-09-21
  it('takes the latest glucose test from week 20 of this pregnancy', () => {
    expect(glucoseTestInPregnancy([
      { title: 'OGTT 75 g, 1 h', date_recorded: '2026-11-03' },
      { title: 'Glucose (fasting)', date_recorded: '2026-11-10T08:00:00Z' },
      { title: 'Ferritin', date_recorded: '2026-11-20' },
    ], due)).toBe('2026-11-10');
  });
  it('ignores tests before week 20 or from an earlier pregnancy, and needs a due date', () => {
    expect(glucoseTestInPregnancy([{ title: 'Glucose', date_recorded: '2026-07-01' }], due)).toBeNull();
    expect(glucoseTestInPregnancy([{ title: 'Glucose', date_recorded: '2026-11-01' }], null)).toBeNull();
  });
});
