import { describe, it, expect } from 'vitest';
import {
  canOpenChart,
  doctorTodayItems,
  filterPatients,
  isAccessCodeComplete,
  needsCloseout,
  normalizeAccessCode,
  pastAppointments,
  patientName,
  recentDocCount,
  sortPatients,
  stageLabel,
  upcomingAppointments,
  type DoctorAppointment,
  type DoctorPatientConnection,
} from './doctorDashboard';

// Fixed local noon so "today" is stable regardless of timezone.
const NOW = new Date(2026, 10, 23, 12, 0, 0).getTime();
const at = (h: number, m = 0, dayOffset = 0) =>
  new Date(2026, 10, 23 + dayOffset, h, m, 0).toISOString();

const conn = (over: Partial<DoctorPatientConnection>): DoctorPatientConnection => ({
  id: over.patient_id ? `c-${over.patient_id}` : 'c',
  patient_id: 'p1',
  status: 'approved',
  created_at: '2026-01-01T00:00:00Z',
  connection_type: 'code',
  ...over,
});

const appt = (over: Partial<DoctorAppointment>): DoctorAppointment => ({
  id: 'a',
  patient_id: 'p1',
  scheduled_at: at(14),
  status: 'scheduled',
  consultation_type: 'video',
  duration: 30,
  ...over,
});

describe('consent: doctor only reaches approved patients', () => {
  it('opens a chart only for approved connections', () => {
    expect(canOpenChart({ status: 'approved' })).toBe(true);
    for (const s of ['pending', 'rejected', 'revoked', null]) {
      expect(canOpenChart({ status: s })).toBe(false);
    }
  });

  it('never counts uploads for a pending patient, even if the row carries a count', () => {
    expect(recentDocCount(conn({ status: 'pending', recent_doc_count: 4 }))).toBe(0);
    expect(recentDocCount(conn({ status: 'approved', recent_doc_count: '3' }))).toBe(3);
  });

  it('never puts a pending patient in Today', () => {
    const items = doctorTodayItems({
      appointments: [],
      patients: [conn({ patient_id: 'p9', status: 'pending', recent_doc_count: 5 })],
      now: NOW,
    });
    expect(items).toEqual([]);
  });
});

describe('access code entry (regression: field capped at 6, real codes are 8)', () => {
  it('accepts a full 8-character code and strips separators', () => {
    expect(normalizeAccessCode('abcd-ef23')).toBe('ABCDEF23');
    expect(normalizeAccessCode(' ab cd ef 23 99')).toBe('ABCDEF23');
    expect(isAccessCodeComplete('ABCDEF23')).toBe(true);
    expect(isAccessCodeComplete('ABCDEF')).toBe(true);
    expect(isAccessCodeComplete('ABCDE')).toBe(false);
  });
});

describe('stageLabel', () => {
  it('uses plain names', () => {
    expect(stageLabel('conception')).toBe('Trying to conceive');
    expect(stageLabel('postpartum')).toBe('After birth');
    expect(stageLabel('pre-menstrual')).toBe('Before first period');
    expect(stageLabel('some-new_stage')).toBe('Some new stage');
    expect(stageLabel(null)).toBeNull();
  });
});

describe('patients list', () => {
  const list = [
    conn({ patient_id: 'aaaaaaaa1', patient_full_name: 'Anna', created_at: '2026-01-01T00:00:00Z' }),
    conn({ patient_id: 'bbbbbbbb2', patient_full_name: 'Bea', status: 'pending', created_at: '2026-06-01T00:00:00Z' }),
    conn({ patient_id: 'cccccccc3', patient_full_name: 'Cleo', recent_doc_count: 2, patient_life_stage: 'conception' }),
  ];

  it('puts approved patients with new uploads first and pending last', () => {
    expect(sortPatients(list).map(p => p.patient_full_name)).toEqual(['Cleo', 'Anna', 'Bea']);
  });

  it('searches name, plain stage name and the short id', () => {
    expect(filterPatients(list, 'ann').map(p => p.patient_full_name)).toEqual(['Anna']);
    expect(filterPatients(list, 'trying to').map(p => p.patient_full_name)).toEqual(['Cleo']);
    expect(filterPatients(list, 'Patient #bbbbbbbb').map(p => p.patient_full_name)).toEqual(['Bea']);
    expect(filterPatients(list, '  ')).toHaveLength(3);
  });

  it('falls back to a short id when the name is missing', () => {
    expect(patientName([], 'abcdef1234')).toBe('Patient #abcdef12');
  });
});

describe('appointment lists', () => {
  const list = [
    appt({ id: 'old', scheduled_at: at(9, 0, -30), status: 'completed' }),
    appt({ id: 'recent', scheduled_at: at(9, 0, -1) }),
    appt({ id: 'next', scheduled_at: at(9, 0, 2) }),
    appt({ id: 'soon', scheduled_at: at(15) }),
    appt({ id: 'cxl', scheduled_at: at(9, 0, 3), status: 'cancelled' }),
  ];

  it('past visits are most recent first (regression: oldest ten were shown)', () => {
    expect(pastAppointments(list, NOW).map(a => a.id)).toEqual(['cxl', 'recent', 'old']);
  });

  it('upcoming visits are soonest first and skip cancellations', () => {
    expect(upcomingAppointments(list, NOW).map(a => a.id)).toEqual(['soon', 'next']);
  });

  it('needsCloseout is true only for past, unresolved visits', () => {
    expect(needsCloseout(list[1], NOW)).toBe(true);
    expect(needsCloseout(list[0], NOW)).toBe(false);
    expect(needsCloseout(list[2], NOW)).toBe(false);
  });
});

describe('doctorTodayItems', () => {
  const patients = [
    conn({ patient_id: 'p1', patient_full_name: 'Anna' }),
    conn({ patient_id: 'p2', patient_full_name: 'Bea', recent_doc_count: 1 }),
  ];

  it('ranks visits today, then visits to close, then cancellations, then uploads', () => {
    const items = doctorTodayItems({
      now: NOW,
      patients,
      appointments: [
        appt({ id: 'later', scheduled_at: at(16), patient_id: 'p1' }),
        appt({ id: 'soon', scheduled_at: at(12, 10), patient_id: 'p2' }),
        appt({ id: 'done-earlier', scheduled_at: at(8), patient_id: 'p1' }),
        appt({ id: 'cxl', scheduled_at: at(10, 0, 1), status: 'cancelled', patient_id: 'p2' }),
        appt({ id: 'cxl-doc', scheduled_at: at(10, 0, 1), status: 'cancelled', notes: 'Cancelled by doctor: ill' }),
      ],
    });
    expect(items.map(i => i.key)).toEqual([
      'visit-soon',
      'visit-later',
      'closeout-done-earlier',
      'cancelled-cxl',
      'uploads-c-p2',
    ]);
    expect(items[0].startingSoon).toBe(true);
    expect(items[0].title).toBe('Bea · in 10 min');
    expect(items[1].startingSoon).toBe(false);
  });

  it('keeps a visit in progress and drops one that has ended', () => {
    const items = doctorTodayItems({
      now: NOW,
      patients,
      appointments: [
        appt({ id: 'running', scheduled_at: at(11, 45), duration: 30 }),
        appt({ id: 'over', scheduled_at: at(11, 0), duration: 30, status: 'completed' }),
      ],
    });
    expect(items.filter(i => i.kind !== 'uploads').map(i => i.key)).toEqual(['visit-running']);
    expect(items[0].title).toBe('Anna · now');
  });

  it('respects dismissed cancellations and ignores old unclosed visits', () => {
    const items = doctorTodayItems({
      now: NOW,
      patients: [],
      dismissedCancellations: new Set(['cxl']),
      appointments: [
        appt({ id: 'cxl', scheduled_at: at(10, 0, 1), status: 'cancelled' }),
        appt({ id: 'ancient', scheduled_at: at(10, 0, -40) }),
      ],
    });
    expect(items).toEqual([]);
  });
});
