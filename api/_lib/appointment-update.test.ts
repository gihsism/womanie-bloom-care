import { describe, it, expect, vi } from 'vitest';
import { checkAppointmentUpdate } from './appointment-update';

const NOW = new Date('2026-11-24T12:00:00Z');
const FUTURE = '2026-12-01T10:00:00Z';
const PAST = '2026-11-20T10:00:00Z';
const PATIENT = 'pat_1';
const DOCTOR = 'doc_1';

function row(over: Partial<Record<string, unknown>> = {}) {
  return { patient_id: PATIENT, doctor_id: DOCTOR, status: 'scheduled', scheduled_at: FUTURE, duration: 30, notes: null, ...over };
}

function q(aptRow: unknown | null, clash = false) {
  return vi.fn(async (text: string) => {
    if (/FROM appointments WHERE id = \$1/.test(text)) return aptRow ? [aptRow] : [];
    if (/SELECT 1 FROM appointments a/.test(text)) return clash ? [{ '?column?': 1 }] : [];
    return [];
  });
}

const byId = [['id', 'eq', 'apt_1']] as Array<[string, string, unknown]>;

describe('checkAppointmentUpdate', () => {
  it('requires an id filter', async () => {
    const r = await checkAppointmentUpdate(q(row()), PATIENT, [], { status: 'cancelled' }, NOW);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it('404s when the caller is neither party', async () => {
    const r = await checkAppointmentUpdate(q(null), 'stranger', byId, { status: 'cancelled' }, NOW);
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  describe('patient', () => {
    it('may cancel her own upcoming visit (Appointments.tsx / UpcomingAppointments.tsx)', async () => {
      expect(await checkAppointmentUpdate(q(row()), PATIENT, byId, { status: 'cancelled' }, NOW)).toEqual({ ok: true });
    });

    it('may add a note with the cancellation', async () => {
      expect(await checkAppointmentUpdate(q(row()), PATIENT, byId, { status: 'cancelled', notes: 'Sick' }, NOW)).toEqual({ ok: true });
    });

    it('may not write a note that poses as the doctor', async () => {
      const r = await checkAppointmentUpdate(q(row()), PATIENT, byId, { status: 'cancelled', notes: 'Cancelled by doctor: x' }, NOW);
      expect(r.ok).toBe(false);
    });

    it('may not edit notes without cancelling', async () => {
      const r = await checkAppointmentUpdate(q(row()), PATIENT, byId, { notes: 'hi' }, NOW);
      expect(r).toMatchObject({ ok: false, status: 403 });
    });

    it('may not cancel a past visit', async () => {
      const r = await checkAppointmentUpdate(q(row({ scheduled_at: PAST })), PATIENT, byId, { status: 'cancelled' }, NOW);
      expect(r).toMatchObject({ ok: false, status: 403 });
    });

    it('may not mark a visit completed or no-show', async () => {
      for (const status of ['completed', 'no_show', 'confirmed']) {
        const r = await checkAppointmentUpdate(q(row()), PATIENT, byId, { status }, NOW);
        expect(r).toMatchObject({ ok: false, status: 403 });
      }
    });

    it('may undo her own cancellation (the Undo toast)', async () => {
      const r = await checkAppointmentUpdate(q(row({ status: 'cancelled' })), PATIENT, byId, { status: 'scheduled' }, NOW);
      expect(r).toEqual({ ok: true });
    });

    it("may not un-cancel the doctor's cancellation", async () => {
      const r = await checkAppointmentUpdate(
        q(row({ status: 'cancelled', notes: 'Cancelled by doctor: away' })), PATIENT, byId, { status: 'scheduled' }, NOW);
      expect(r).toMatchObject({ ok: false, status: 403 });
    });

    it('may not reopen a completed visit', async () => {
      const r = await checkAppointmentUpdate(q(row({ status: 'completed' })), PATIENT, byId, { status: 'scheduled' }, NOW);
      expect(r).toMatchObject({ ok: false, status: 403 });
    });

    it('may not restore a cancelled visit whose slot was taken since', async () => {
      const r = await checkAppointmentUpdate(q(row({ status: 'cancelled' }), true), PATIENT, byId, { status: 'scheduled' }, NOW);
      expect(r).toMatchObject({ ok: false, status: 409 });
    });

    it('cannot cancel twice', async () => {
      const r = await checkAppointmentUpdate(q(row({ status: 'cancelled' })), PATIENT, byId, { status: 'cancelled' }, NOW);
      expect(r).toMatchObject({ ok: false, status: 409 });
    });
  });

  describe('doctor (DoctorAppointments.tsx)', () => {
    it('keeps cancel-with-reason, complete, no-show and reopen', async () => {
      for (const data of [
        { status: 'cancelled', notes: 'Cancelled by doctor: ill' },
        { status: 'completed' },
        { status: 'no_show' },
        { status: 'scheduled' },
      ]) {
        expect(await checkAppointmentUpdate(q(row({ scheduled_at: PAST })), DOCTOR, byId, data, NOW)).toEqual({ ok: true });
      }
    });

    it('rejects an unknown status', async () => {
      const r = await checkAppointmentUpdate(q(row()), DOCTOR, byId, { status: 'paid' }, NOW);
      expect(r).toMatchObject({ ok: false, status: 400 });
    });
  });
});
