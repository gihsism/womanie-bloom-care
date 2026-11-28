import { describe, it, expect } from 'vitest';
import { addMonthsLocal, babyVaccineReminders, BABY_VACCINE_AGES_MONTHS } from './babyVaccines';
import { babyVaccinePlan, vaccineMarksFrom, rsvDueDate, rsvTiming, BAG_BABY_SCHEDULE, BAG_BABY_VACCINES } from './babyVaccineSchedule';
import { lastMoodLogFrom } from '@/hooks/useTodaySignals';

// Local dates throughout (no UTC): 2026-11-23, 09:00
const NOW = new Date(2026, 10, 23, 9, 0);

describe('babyVaccineReminders', () => {
  it('shows from 3 days before a common age until 3 weeks after', () => {
    // 2 months on 2026-11-26 (3 days ahead) -> shown
    expect(babyVaccineReminders([{ name: 'Mia', birth_date: '2026-09-26' }], NOW)).toEqual([{ name: 'Mia', age: '2 months' }]);
    // 2 months on 2026-11-27 (4 days ahead) -> not yet
    expect(babyVaccineReminders([{ name: 'Mia', birth_date: '2026-09-27' }], NOW)).toEqual([]);
    // 2 months on 2026-11-02 (21 days ago) -> still shown; 22 days -> gone
    expect(babyVaccineReminders([{ name: 'Mia', birth_date: '2026-09-02' }], NOW)).toHaveLength(1);
    expect(babyVaccineReminders([{ name: 'Mia', birth_date: '2026-09-01' }], NOW)).toEqual([]);
  });

  it('covers 4 months, 9 months (MMRV, BAG) and 1 year; nothing between ages', () => {
    expect(BABY_VACCINE_AGES_MONTHS).toEqual([2, 4, 9, 12]);
    expect(babyVaccineReminders([{ name: 'Leo', birth_date: '2026-07-20' }], NOW)).toEqual([{ name: 'Leo', age: '4 months' }]);
    expect(babyVaccineReminders([{ name: 'Leo', birth_date: '2026-02-21' }], NOW)).toEqual([{ name: 'Leo', age: '9 months' }]);
    expect(babyVaccineReminders([{ name: 'Leo', birth_date: '2025-11-20' }], NOW)).toEqual([{ name: 'Leo', age: '1 year' }]);
    expect(babyVaccineReminders([{ name: 'Leo', birth_date: '2026-08-15' }], NOW)).toEqual([]); // about 3 months
  });

  it('a vaccination logged around the age (from 2 weeks before) hides it', () => {
    const b = { name: 'Mia', birth_date: '2026-09-20' }; // 2 months on 2026-11-20
    expect(babyVaccineReminders([{ ...b, lastVaccineAt: new Date(2026, 10, 21, 10) }], NOW)).toEqual([]);
    expect(babyVaccineReminders([{ ...b, lastVaccineAt: new Date(2026, 10, 6, 10) }], NOW)).toEqual([]); // 14 days before
    expect(babyVaccineReminders([{ ...b, lastVaccineAt: new Date(2026, 9, 1) }], NOW)).toHaveLength(1); // an older dose
  });

  it('unnamed baby, unknown birth date, several babies', () => {
    expect(babyVaccineReminders([{ name: '  ', birth_date: '2026-09-23' }], NOW)).toEqual([{ name: 'Baby', age: '2 months' }]);
    expect(babyVaccineReminders([{ name: 'Mia', birth_date: null }], NOW)).toEqual([]);
    expect(babyVaccineReminders([
      { name: 'A', birth_date: '2026-09-23' }, { name: 'B', birth_date: '2026-09-23' },
    ], NOW)).toHaveLength(2);
  });

  it('adds months on local calendar days, clamping to the month end', () => {
    expect(addMonthsLocal(new Date(2026, 0, 31), 1)).toEqual(new Date(2026, 1, 28));
    expect(addMonthsLocal(new Date(2026, 10, 30), 2)).toEqual(new Date(2027, 0, 30));
  });
});

// Pinned to the BAG Schweizerischer Impfplan 2026 (Tabelle 1, chapter 1.1).
describe('BAG Swiss schedule 2026 (birth to 18 months)', () => {
  const ages = (v: string) => BAG_BABY_SCHEDULE.filter(d => d.vaccine === v).map(d => d.months);

  it('pins every vaccine, dose count and age', () => {
    expect(ages('hexa')).toEqual([2, 4, 12]); // 6-in-1 "2+1"
    expect(ages('pcv')).toEqual([2, 4, 12]); // pneumococcal "2+1"
    expect(ages('rota')).toEqual([2, 4]); // oral, 2 doses
    expect(ages('menb')).toEqual([3, 5, 12]); // 3, 5, 12-18 months
    expect(ages('mmrv')).toEqual([9, 12]); // MMR + varicella
    expect(ages('acwy')).toEqual([12]); // 12-18 months
    expect(ages('rsv')).toEqual([null]); // by birth month
    expect(BAG_BABY_SCHEDULE.find(d => d.id === 'menb-3')?.age).toBe('12-18 months');
    expect(BAG_BABY_SCHEDULE.find(d => d.id === 'acwy-1')?.age).toBe('12-18 months');
    expect(BAG_BABY_SCHEDULE.find(d => d.id === 'rota-1')?.maxAgeDays).toBe(111); // 15 weeks 6 days
    expect(BAG_BABY_SCHEDULE.find(d => d.id === 'rota-2')?.maxAgeDays).toBe(167); // 23 weeks 6 days
    expect(BAG_BABY_SCHEDULE).toHaveLength(15);
    expect(new Set(BAG_BABY_SCHEDULE.map(d => d.id)).size).toBe(15);
  });

  it('basic vs complementary as in the BAG plan; no BCG, no vitamin K', () => {
    const cat = Object.fromEntries(Object.values(BAG_BABY_VACCINES).map(v => [v.id, v.category]));
    expect(cat).toEqual({ rsv: 'basic', hexa: 'basic', pcv: 'basic', mmrv: 'basic', rota: 'complementary', menb: 'complementary', acwy: 'complementary' });
    const names = Object.values(BAG_BABY_VACCINES).map(v => `${v.name} ${v.against}`).join(' ');
    expect(names).not.toMatch(/BCG|vitamin K/i);
  });

  it('RSV antibody: born October-March in the first week, April-September in October', () => {
    expect(rsvDueDate(new Date(2026, 10, 3))).toEqual(new Date(2026, 10, 3)); // November
    expect(rsvDueDate(new Date(2027, 2, 31))).toEqual(new Date(2027, 2, 31)); // March
    expect(rsvDueDate(new Date(2026, 3, 1))).toEqual(new Date(2026, 9, 1)); // April -> October
    expect(rsvDueDate(new Date(2026, 8, 30))).toEqual(new Date(2026, 9, 1)); // September -> October
    expect(rsvTiming('2026-11-03')).toMatch(/first week of life/);
    expect(rsvTiming('2026-06-10')).toMatch(/October 2026/);
  });

  it('dates and status: due, soon (30 days), later, done, closed', () => {
    // Born 2026-09-20: 2 months on 2026-11-20 (due), 3 months 2026-12-20 (soon), 4 months later.
    const plan = babyVaccinePlan('2026-09-20', [{ id: 'm1', dose: 'hexa-1', on: '2026-11-21' }], NOW);
    const by = Object.fromEntries(plan.flatMap(v => v.doses).map(d => [d.id, d]));
    expect(by['hexa-1'].status).toBe('done');
    expect(by['hexa-1'].doneOn).toBe('2026-11-21');
    expect(by['pcv-1'].status).toBe('due');
    expect(by['pcv-1'].due).toEqual(new Date(2026, 10, 20));
    expect(by['menb-1'].status).toBe('soon');
    expect(by['hexa-2'].status).toBe('later');
    expect(by['hexa-2'].due).toEqual(new Date(2027, 0, 20));
    expect(by['mmrv-1'].due).toEqual(new Date(2027, 5, 20));
    expect(by['hexa-3'].due).toEqual(new Date(2027, 8, 20));
    // Born in September: RSV antibody in October, already passed -> due.
    expect(by['rsv-1'].due).toEqual(new Date(2026, 9, 1));
    expect(by['rsv-1'].status).toBe('due');
    // Visits: the 2-month visit is due because two of its doses are open.
    const v2 = plan.find(v => v.key === '2 months')!;
    expect(v2.status).toBe('due');
    expect(v2.doses.map(d => d.id)).toEqual(['hexa-1', 'pcv-1', 'rota-1']);
    expect(plan.map(v => v.key)).toEqual(['rsv', '2 months', '3 months', '4 months', '5 months', '9 months', '12 months', '12-18 months']);
  });

  it('rotavirus closes after its age limits; RSV antibody after the first birthday', () => {
    // 16 weeks old (112 days): dose 1 can no longer be started, so dose 2 neither.
    const born = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 112);
    const ymd = `${born.getFullYear()}-${String(born.getMonth() + 1).padStart(2, '0')}-${String(born.getDate()).padStart(2, '0')}`;
    const by = Object.fromEntries(babyVaccinePlan(ymd, [], NOW).flatMap(v => v.doses).map(d => [d.id, d]));
    expect(by['rota-1'].status).toBe('closed');
    expect(by['rota-2'].status).toBe('closed');
    // Dose 1 given: dose 2 stays open until 23 weeks 6 days.
    const by2 = Object.fromEntries(babyVaccinePlan(ymd, [{ id: 'r', dose: 'rota-1', on: ymd }], NOW).flatMap(v => v.doses).map(d => [d.id, d]));
    expect(by2['rota-2'].status).toBe('soon');
    const old = Object.fromEntries(babyVaccinePlan('2025-11-01', [], NOW).flatMap(v => v.doses).map(d => [d.id, d]));
    expect(old['rsv-1'].status).toBe('closed');
    expect(old['hexa-3'].status).toBe('due'); // catch-up: still shown as due
  });

  it('no birth date: every dose later, no dates', () => {
    const doses = babyVaccinePlan(null, [], NOW).flatMap(v => v.doses);
    expect(doses.every(d => d.status === 'later' && d.due === null)).toBe(true);
  });

  it('reads marks from baby_vaccine events (dose id only, JSON string or object)', () => {
    expect(vaccineMarksFrom([
      { id: 'a', occurred_at: new Date(2026, 10, 20, 12).toISOString(), data: { name: '6-in-1 vaccine, dose 1 of 3', dose: 'hexa-1' } },
      { id: 'b', occurred_at: new Date(2026, 10, 20, 12).toISOString(), data: JSON.stringify({ name: 'x', dose: 'pcv-1' }) },
      { id: 'c', occurred_at: new Date(2026, 10, 20, 12).toISOString(), data: { name: 'Flu' } },
      { id: 'd', occurred_at: new Date(2026, 10, 20, 12).toISOString(), data: { dose: 'bcg-1' } },
    ])).toEqual([{ id: 'a', dose: 'hexa-1', on: '2026-11-20' }, { id: 'b', dose: 'pcv-1', on: '2026-11-20' }]);
  });
});

describe('lastMoodLogFrom (weekly mood row)', () => {
  it('newest day with at least one mood ticked, as a local date', () => {
    expect(lastMoodLogFrom([
      { signal_date: '2026-11-10', mood: ['calm'] },
      { signal_date: '2026-11-18T00:00:00.000Z', mood: '["tired"]' },
      { signal_date: '2026-11-20', mood: [] },
      { signal_date: '2026-11-21', mood: null },
    ])).toEqual(new Date(2026, 10, 18));
    expect(lastMoodLogFrom([{ signal_date: '2026-11-20', mood: [] }])).toBeNull();
    expect(lastMoodLogFrom(null)).toBeNull();
  });
});
