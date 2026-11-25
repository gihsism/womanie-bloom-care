import { describe, it, expect } from 'vitest';
import { buildDaySchedule, dayWindow, newSinceLastVisit, newSinceParts, stageLineFor } from './doctorDay';

// Local-time fixtures so "today"/"tomorrow" hold in any timezone.
const at = (dayOffset: number, h: number, m = 0) => new Date(2026, 10, 26 + dayOffset, h, m).toISOString();
const NOW = new Date(2026, 10, 26, 11, 0).getTime();

const patients = [
  { id: 'c1', patient_id: 'p1', status: 'approved', created_at: '', connection_type: 'code', patient_full_name: 'Anna', patient_life_stage: 'menstrual-cycle' },
  { id: 'c2', patient_id: 'p2', status: 'pending', created_at: '', connection_type: 'booking', patient_full_name: 'Bea' },
];
const appt = (id: string, patient_id: string, scheduled_at: string, status = 'scheduled') =>
  ({ id, patient_id, scheduled_at, status, consultation_type: 'video', duration: 30 });

describe('dayWindow', () => {
  it('runs from local midnight today to local midnight in two days', () => {
    const { from, to } = dayWindow(NOW);
    expect(from.getHours()).toBe(0);
    expect(from.getDate()).toBe(26);
    expect(to.getDate()).toBe(28);
  });
});

describe('buildDaySchedule', () => {
  it("puts today's and tomorrow's visits in time order and drops cancelled and later ones", () => {
    const { today, tomorrow } = buildDaySchedule({
      now: NOW,
      patients,
      dayVisits: [],
      appointments: [
        appt('late', 'p1', at(0, 15)),
        appt('early', 'p1', at(0, 9)),
        appt('cx', 'p1', at(0, 12), 'cancelled'),
        appt('tm', 'p2', at(1, 8)),
        appt('next-week', 'p1', at(7, 8)),
        appt('yesterday', 'p1', at(-1, 8)),
      ],
    });
    expect(today.map(r => r.appointmentId)).toEqual(['early', 'late']);
    expect(today[0].past).toBe(true);
    expect(today[1].past).toBe(false);
    expect(tomorrow.map(r => r.appointmentId)).toEqual(['tm']);
  });

  it('adds stage, open questions and what is new from the day API for approved patients', () => {
    const { today } = buildDaySchedule({
      now: NOW,
      patients,
      appointments: [appt('a1', 'p1', at(0, 14))],
      dayVisits: [{
        appointment_id: 'a1', patient_id: 'p1', scheduled_at: at(0, 14), approved: true,
        life_stage: 'pregnancy', pregnancy_due_date: '2027-03-01', ivf_phase: null,
        open_questions: 2, last_visit_at: '2026-10-01T09:00:00Z', new_docs: 1, new_abnormal: 0, low_mood_streak: 4,
      }],
    });
    expect(today[0]).toMatchObject({
      name: 'Anna',
      approved: true,
      openQuestions: 2,
      firstVisit: false,
      newSince: ['1 new document', 'low mood 4 days in a row'],
    });
    expect(today[0].stageLine).toMatch(/· week \d+$/);
  });

  it('shows a pending patient by name and time only', () => {
    const { tomorrow } = buildDaySchedule({
      now: NOW,
      patients,
      appointments: [appt('tm', 'p2', at(1, 8))],
      dayVisits: [{ appointment_id: 'tm', patient_id: 'p2', scheduled_at: at(1, 8), approved: false }],
    });
    expect(tomorrow[0]).toMatchObject({ name: 'Bea', approved: false, stageLine: null, openQuestions: 0, newSince: [], firstVisit: false });
  });

  it('marks a first visit when there is no completed visit yet', () => {
    const { today } = buildDaySchedule({
      now: NOW,
      patients,
      appointments: [appt('a1', 'p1', at(0, 14))],
      dayVisits: [{ appointment_id: 'a1', patient_id: 'p1', scheduled_at: at(0, 14), approved: true, last_visit_at: null }],
    });
    expect(today[0].firstVisit).toBe(true);
  });
});

describe('newSinceParts / stageLineFor', () => {
  it('lists results out of range first and ignores a short mood dip', () => {
    expect(newSinceParts({ new_docs: 2, new_abnormal: 1, low_mood_streak: 2 })).toEqual(['1 result out of range', '2 new documents']);
    expect(newSinceParts({})).toEqual([]);
  });
  it('falls back to the connection stage', () => {
    expect(stageLineFor(undefined, 'menopause', NOW)).toBeTruthy();
    expect(stageLineFor(undefined, null, NOW)).toBeNull();
  });
});

describe('newSinceLastVisit', () => {
  const base = {
    now: Date.parse('2026-11-26T12:00:00Z'),
    appointments: [
      { scheduled_at: '2026-09-01T09:00:00Z', status: 'completed' },
      { scheduled_at: '2026-10-15T09:00:00Z', status: 'completed' },
      { scheduled_at: '2026-11-01T09:00:00Z', status: 'no_show' },
      { scheduled_at: '2026-12-01T09:00:00Z', status: 'scheduled' },
    ],
    documents: [
      { id: 'd_old', file_name: 'old.pdf', ai_suggested_name: null, uploaded_at: '2026-10-01T00:00:00Z' },
      { id: 'd_new', file_name: 'blood.pdf', ai_suggested_name: 'Blood test Nov', uploaded_at: '2026-11-20T00:00:00Z' },
    ],
    medicalData: [
      { id: 'r1', document_id: 'd_new', title: 'TSH', value: 6.1, unit: 'mU/L', status: 'high' },
      { id: 'r2', document_id: 'd_new', title: 'Ferritin', value: 40, unit: 'ng/mL', status: 'normal' },
      { id: 'r3', document_id: 'd_old', title: 'Iron', value: 5, unit: null, status: 'low' },
    ],
    notes: [
      { id: 'n1', title: 'Visit on 15 Oct', created_at: '2026-10-15T10:00:00Z' },
      { id: 'n0', title: 'Before', created_at: '2026-10-10T10:00:00Z' },
    ],
    signals: [
      { id: 's1', signal_date: '2026-11-22', notes: 'Bad headache all day' },
      { id: 's2', signal_date: '2026-11-23', notes: '   ' },
      { id: 's3', signal_date: '2026-10-15', notes: 'visit day' },
    ],
  };

  it('uses the latest COMPLETED visit and lists what came after, out-of-range first', () => {
    const { lastVisitAt, items } = newSinceLastVisit(base);
    expect(lastVisitAt).toBe(Date.parse('2026-10-15T09:00:00Z'));
    expect(items.map(i => i.key)).toEqual(['res-r1', 'log-s1', 'doc-d_new', 'res-r2', 'note-n1']);
    expect(items[0]).toMatchObject({ title: 'TSH 6.1 mU/L', flagged: true, detail: 'Result · high' });
  });

  it('is a first visit when nothing was completed', () => {
    expect(newSinceLastVisit({ ...base, appointments: [{ scheduled_at: '2026-11-01T09:00:00Z', status: 'scheduled' }] }))
      .toEqual({ lastVisitAt: null, items: [] });
  });
});
