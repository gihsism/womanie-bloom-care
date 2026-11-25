import { describe, it, expect } from 'vitest';
import type { LifeStage } from '@/components/dashboard/DashboardHeader';
import { LIFE_STAGES } from './lifeStage';
import { todayItems, primaryActionFor, moreFor, MAX_TODAY, MAX_MORE, VISITS, RECORDS, RECORDS_CHARTS, STAGE_PAGE, type TodaySignals } from './todayItems';

// Monday 2026-11-23, 09:00 local
const NOW = new Date(2026, 10, 23, 9, 0);
const at = (days: number, h = 10, m = 30) => new Date(2026, 10, 23 + days, h, m);
const ids = (mode: LifeStage, s: Parameters<typeof todayItems>[1]) => todayItems(mode, { now: NOW, ...s }).map(i => i.id);

describe('todayItems', () => {
  it('is empty when nothing qualifies (Home then shows one calm line)', () => {
    for (const m of LIFE_STAGES) expect(todayItems(m, { now: NOW })).toEqual([]);
  });

  it('never returns more than three rows', () => {
    const all = todayItems('menstrual-cycle', {
      now: NOW, appointmentToday: at(0, 14), newDoctorNotes: 2, flaggedResults: 3,
      periodDaysUntil: 1, nextVisit: at(3), setup: { done: 1, total: 3 },
    });
    expect(all).toHaveLength(MAX_TODAY);
    expect(all.map(i => i.id)).toEqual(['visit-today', 'doctor-note', 'flagged-results']);
  });

  it('ranks: visit today > doctor note > flagged result > stage task > heads-up > setup', () => {
    expect(ids('menstrual-cycle', { setup: { done: 2, total: 3 }, nextVisit: at(2), periodDaysUntil: 2, flaggedResults: 1 }))
      .toEqual(['flagged-results', 'period-soon', 'visit-soon']);
    expect(ids('menstrual-cycle', { setup: { done: 2, total: 3 }, nextVisit: at(2) })).toEqual(['visit-soon', 'setup']);
    expect(ids('conception', { newDoctorNotes: 1, periodDaysUntil: -3 })).toEqual(['doctor-note', 'period-late']);
  });

  it('every row is one line of at most 60 characters', () => {
    const all = todayItems('menstrual-cycle', {
      now: NOW, appointmentToday: at(0, 14), newDoctorNotes: 12, flaggedResults: 13, periodDaysUntil: -14,
    });
    const more = todayItems('menstrual-cycle', { now: NOW, periodDaysUntil: 6, nextVisit: at(6), setup: { done: 1, total: 3 } });
    for (const i of [...all, ...more]) {
      expect(i.label.length).toBeLessThanOrEqual(60);
      expect(i.label).not.toMatch(/\n/);
    }
  });

  it('gives concrete times', () => {
    const [visit] = todayItems('pregnancy', { now: NOW, appointmentToday: at(0, 14, 5) });
    expect(visit.label).toBe('Visit today at 14:05');
    expect(visit.target).toBe(VISITS);
    const [soon] = todayItems('ivf', { now: NOW, nextVisit: at(3, 8, 0) });
    expect(soon.label).toBe('Visit on Thursday at 08:00');
    const [tom] = todayItems('ivf', { now: NOW, nextVisit: at(1, 8, 0) });
    expect(tom.label).toBe('Visit tomorrow at 08:00');
    const [pms] = todayItems('menstrual-cycle', { now: NOW, periodDaysUntil: 5 });
    expect(pms.label).toBe('PMS likely from Thursday');
  });

  it('period rows only for cycle stages, only within 2 days or when late', () => {
    expect(ids('pregnancy', { periodDaysUntil: 1 })).toEqual([]);
    expect(ids('menstrual-cycle', { periodDaysUntil: 3 })).toEqual(['pms-soon']);
    expect(ids('conception', { periodDaysUntil: 3 })).toEqual([]); // no PMS row when trying to conceive
    expect(ids('menstrual-cycle', { periodDaysUntil: 0 })).toEqual(['period-soon']);
    expect(todayItems('menstrual-cycle', { now: NOW, periodDaysUntil: -1 })[0].label).toBe('Period 1 day late? Log it if it started');
    expect(ids('menstrual-cycle', { periodDaysUntil: -15 })).toEqual([]); // a stale log, not a late period
  });

  it('visits further than 7 days out are not a Today row', () => {
    expect(ids('menstrual-cycle', { nextVisit: at(8) })).toEqual([]);
  });

  it('flagged results go to Records; setup asks for the name first', () => {
    expect(todayItems('menopause', { now: NOW, flaggedResults: 1 })[0]).toMatchObject({ label: '1 result to talk to your doctor about', target: RECORDS });
    expect(todayItems('menopause', { now: NOW, setup: { done: 1, total: 3, nameMissing: true } })[0]).toMatchObject({ label: 'Add your name', target: '/dashboard/settings#profile' });
    expect(todayItems('menopause', { now: NOW, setup: { done: 2, total: 3 } })[0].label).toBe('Finish setting up (2 of 3 done)');
    expect(todayItems('menopause', { now: NOW, setup: { done: 3, total: 3 } })).toEqual([]);
  });

  describe('stage tasks', () => {
    const pill = (p: Partial<NonNullable<TodaySignals['pill']>> = {}) => ({ reminderTime: '08:30', takenToday: false, takenYesterday: true, packDay: 5, ...p });

    it('medicine due: one names it and its time, several are counted; opens the medicine ticks', () => {
      const [one] = todayItems('menopause', { now: NOW, medicinesDue: [{ name: 'Vitamin D', time: '08:00' }] });
      expect(one).toEqual({ id: 'medicine-due', label: 'Vitamin D due (08:00)', target: 'sheet:medicines' });
      const [two] = todayItems('ivf', { now: NOW, medicinesDue: [{ name: 'Progesterone', time: '08:00' }, { name: 'Estradiol', time: '07:00' }] });
      expect(two.label).toBe('2 medicines due');
      expect(ids('ivf', { medicinesDue: [] })).toEqual([]);
    });

    it('missed pill: today unticked once her reminder time has passed', () => {
      expect(ids('contraception', { pill: pill({ reminderTime: '09:30' }) })).toEqual([]); // 09:00 < 09:30
      const [row] = todayItems('contraception', { now: NOW, pill: pill() });
      expect(row).toEqual({ id: 'pill-missed', label: "Today's pill not ticked yet (due 08:30)", target: `${STAGE_PAGE}#contraception` });
      expect(ids('contraception', { pill: pill({ takenToday: true }) })).toEqual([]);
    });

    it('missed pill: yesterday unticked, only for someone who ticks, never in the pill-free week', () => {
      const late = pill({ reminderTime: '21:00', takenYesterday: false });
      expect(todayItems('contraception', { now: NOW, pill: late })[0].label).toBe("Yesterday's pill not ticked. Missed it?");
      expect(ids('contraception', { pill: { ...late, takenYesterday: null } })).toEqual([]);
      expect(ids('contraception', { pill: { ...late, packDay: 1 } })).toEqual([]); // yesterday was day 28
      expect(ids('contraception', { pill: pill({ packDay: 23 }) })).toEqual([]);
      expect(ids('menstrual-cycle', { pill: pill() })).toEqual([]);
    });

    it('vaccination due: pregnancy only, links to the vaccination card', () => {
      const [one] = todayItems('pregnancy', { now: NOW, vaccinesDue: ['Tdap'] });
      expect(one).toEqual({ id: 'vaccination-due', label: 'Tdap vaccination due', target: `${STAGE_PAGE}#vaccinations` });
      expect(todayItems('pregnancy', { now: NOW, vaccinesDue: ['Flu', 'COVID-19'] })[0].label).toBe('2 vaccinations due: Flu, COVID-19');
      expect(ids('postpartum', { vaccinesDue: ['Tdap'] })).toEqual([]);
    });

    it('mood check due: never taken, or 2 weeks since the last one; pregnancy and postpartum only', () => {
      expect(todayItems('postpartum', { now: NOW, lastMoodCheck: null })[0])
        .toEqual({ id: 'mood-check', label: 'Take the 2-minute mood check', target: `${STAGE_PAGE}#mood-check` });
      expect(ids('pregnancy', { lastMoodCheck: at(-13) })).toEqual([]);
      expect(todayItems('pregnancy', { now: NOW, lastMoodCheck: at(-14) })[0].label).toBe('Mood check due (every 2 weeks)');
      expect(ids('postpartum', { lastMoodCheck: undefined })).toEqual([]); // not loaded yet
      expect(ids('menopause', { lastMoodCheck: null })).toEqual([]);
    });

    it('rank after doctor items, before heads-ups and setup; max 3', () => {
      const s = { newDoctorNotes: 1, medicinesDue: [{ name: 'Iron', time: '08:00' }], vaccinesDue: ['Tdap'], lastMoodCheck: null, nextVisit: at(2), setup: { done: 1, total: 3 } };
      expect(ids('pregnancy', s)).toEqual(['doctor-note', 'medicine-due', 'vaccination-due']);
      expect(ids('pregnancy', { ...s, newDoctorNotes: 0, medicinesDue: [] })).toEqual(['vaccination-due', 'mood-check', 'visit-soon']);
      expect(ids('contraception', { pill: pill(), medicinesDue: [{ name: 'Iron', time: '08:00' }], setup: { done: 1, total: 3 } }))
        .toEqual(['pill-missed', 'medicine-due', 'setup']);
    });

    it('long medicine names still fit one 60-character row', () => {
      const name = 'Extra-long compounded progesterone vaginal suppository 200 mg twice';
      const [row] = todayItems('ivf', { now: NOW, medicinesDue: [{ name, time: '08:00' }] });
      expect(row.label.length).toBeLessThanOrEqual(60);
      const v = todayItems('pregnancy', { now: NOW, vaccinesDue: ['Tdap', 'Flu', 'RSV (Abrysvo)', 'COVID-19'] })[0];
      expect(v.label.length).toBeLessThanOrEqual(60);
    });
  });
});

describe('todayItems: baby vaccinations and weekly mood', () => {
  it('baby at a vaccination age: postpartum only, opens the Vaccines tab', () => {
    const [row] = todayItems('postpartum', { now: NOW, babyVaccines: [{ name: 'Mia', age: '2 months' }] });
    expect(row).toEqual({ id: 'baby-vaccination', label: 'Mia is 2 months: check the vaccine booklet', target: '/dashboard/baby?tab=vax' });
    expect(todayItems('postpartum', { now: NOW, babyVaccines: [{ name: 'A', age: '2 months' }, { name: 'B', age: '2 months' }] })[0].id).toBe('baby-vaccination');
    expect(ids('pregnancy', { babyVaccines: [{ name: 'Mia', age: '2 months' }] })).toEqual([]);
    const long = todayItems('postpartum', { now: NOW, babyVaccines: [{ name: 'Maximiliana Charlotte Alexandra', age: '4 months' }] })[0];
    expect(long.label.length).toBeLessThanOrEqual(60);
  });

  it('weekly mood: a week since the last mood tick opens the log', () => {
    expect(todayItems('menopause', { now: NOW, lastMoodLog: at(-7) })[0])
      .toEqual({ id: 'mood-weekly', label: 'How has your mood been this week?', target: 'sheet:log' });
    expect(ids('menopause', { lastMoodLog: at(-6) })).toEqual([]);
    expect(ids('menopause', { lastMoodLog: undefined })).toEqual([]); // not loaded yet
  });

  it('weekly mood: never ticked shows on Mondays only; not for the EPDS stages', () => {
    expect(ids('contraception', { lastMoodLog: null })).toEqual(['mood-weekly']); // NOW is a Monday
    expect(todayItems('contraception', { now: at(1), lastMoodLog: null }).map(i => i.id)).toEqual([]); // Tuesday
    expect(ids('pregnancy', { lastMoodLog: null })).toEqual([]);
    expect(ids('postpartum', { lastMoodLog: at(-30) })).toEqual([]);
  });

  it('weekly mood ranks after heads-ups, before setup', () => {
    expect(ids('menstrual-cycle', { lastMoodLog: at(-8), nextVisit: at(2), setup: { done: 1, total: 3 } }))
      .toEqual(['visit-soon', 'mood-weekly', 'setup']);
  });
});

describe('primaryActionFor', () => {
  it('pregnancy switches at weeks 28 and 37', () => {
    expect(primaryActionFor('pregnancy', { weeksPregnant: 20 }).label).toBe('Log today');
    expect(primaryActionFor('pregnancy', { weeksPregnant: 28 }).label).toBe('Count kicks');
    expect(primaryActionFor('pregnancy', { weeksPregnant: 36 }).label).toBe('Count kicks');
    expect(primaryActionFor('pregnancy', { weeksPregnant: 37 }).label).toBe('Time contractions');
    expect(primaryActionFor('pregnancy', { weeksPregnant: null }).label).toBe('Log today');
  });

  it('each stage has its own verb-first label', () => {
    const want: Record<LifeStage, string> = {
      'pre-menstrual': 'Log today',
      'menstrual-cycle': 'Log today',
      conception: 'Log today',
      contraception: "Log today's pill",
      ivf: 'Log medication',
      pregnancy: 'Log today',
      postpartum: 'Log a feed',
      menopause: 'Log symptoms',
      'post-menopause': 'Log symptoms',
    };
    for (const m of LIFE_STAGES) expect(primaryActionFor(m).label).toBe(want[m]);
    expect(primaryActionFor('contraception', { dailyPill: false }).label).toBe('Log today');
  });

  it('targets are a Log sheet or an app route', () => {
    for (const m of LIFE_STAGES) for (const w of [10, 30, 38]) {
      expect(primaryActionFor(m, { weeksPregnant: w }).target).toMatch(/^(sheet:(log|medicines)|\/dashboard\/)/);
    }
  });
});

describe('moreFor', () => {
  it('has at most four rows for every stage, each a dashboard link', () => {
    for (const m of LIFE_STAGES) {
      const rows = moreFor(m, { weeksPregnant: 34 });
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.length).toBeLessThanOrEqual(MAX_MORE);
      for (const r of rows) expect(r.target).toMatch(/^\/dashboard(\/|$)/);
    }
  });

  it('pregnancy shows Labour & birth from week 32', () => {
    expect(moreFor('pregnancy', { weeksPregnant: 30 }).map(r => r.label)).not.toContain('Labour & birth');
    expect(moreFor('pregnancy', { weeksPregnant: 32 }).map(r => r.label)).toContain('Labour & birth');
  });

  it('never uses a lab abbreviation or all-caps label', () => {
    for (const m of LIFE_STAGES) for (const r of moreFor(m)) {
      expect(r.label).not.toMatch(/\b(BBT|LH|AMH|TSH|EPDS|FSH)\b/);
      expect(r.label).not.toBe(r.label.toUpperCase());
    }
  });
});

describe('moreFor chart links', () => {
  it('"Charts & history" and "Ovulation & charts" open Records on My charts, not the empty Results list', () => {
    expect(moreFor('menstrual-cycle').find(r => r.label === 'Charts & history')?.target).toBe(RECORDS_CHARTS);
    expect(moreFor('conception').find(r => r.label === 'Ovulation & charts')?.target).toBe(RECORDS_CHARTS);
    expect(RECORDS_CHARTS).toBe('/dashboard/medical-history?tab=charts');
  });
});

describe('moreFor postpartum', () => {
  it('does not repeat the hero\'s "Baby tracker" link', () => {
    const labels = moreFor('postpartum').map(r => r.label);
    expect(labels).not.toContain('Baby tracker');
    expect(labels).toEqual(['Your recovery', 'Mood check', 'Birth details', 'Medicines']);
  });
});
