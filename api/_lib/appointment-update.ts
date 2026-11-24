// Who may change an appointment's status through /api/db.
//
// Legitimate client calls (src/):
// - Patient, Appointments.tsx + UpcomingAppointments.tsx:
//     { status: 'cancelled' } on an upcoming visit, and "Undo" right
//     after -> { status: 'scheduled' }.
// - Doctor, DoctorAppointments.tsx:
//     { status: 'cancelled', notes: 'Cancelled by doctor: <reason>' },
//     { status: 'completed' | 'no_show' | 'scheduled' } (close-out/reopen).
//
// Rules:
// - The update must target one appointment by id (every call above does).
// - The doctor of the visit keeps the close-out actions above.
// - The patient may only cancel her own UPCOMING, still-active visit
//   (optionally with a note), and undo HER OWN cancellation of a visit
//   that is still upcoming and whose slot has not been taken since. She
//   can never mark a visit completed/no-show, reopen a doctor's
//   cancellation, or edit notes outside a cancellation.

export const DOCTOR_CANCEL_PREFIX = 'Cancelled by doctor';
const DOCTOR_STATUSES = new Set(['scheduled', 'cancelled', 'completed', 'no_show']);
const CLOSED = new Set(['cancelled', 'completed', 'no_show', 'no-show']);

type Query = (text: string, params: unknown[]) => Promise<unknown[]>;
type Filter = [string, string, unknown];

interface AptRow {
  patient_id: string;
  doctor_id: string;
  status: string | null;
  scheduled_at: string;
  duration: number | null;
  notes: string | null;
}

export type AppointmentUpdateCheck = { ok: true } | { ok: false; status: number; error: string };

const deny = (status: number, error: string): AppointmentUpdateCheck => ({ ok: false, status, error });

export async function checkAppointmentUpdate(
  query: Query,
  userId: string,
  filters: Filter[],
  updateData: unknown,
  now: Date = new Date(),
): Promise<AppointmentUpdateCheck> {
  const idFilter = filters.find(f => f[0] === 'id' && f[1] === 'eq');
  const id = idFilter?.[2];
  if (typeof id !== 'string' || !id) return deny(400, 'Appointment updates must target one appointment by id');
  const data = (updateData && typeof updateData === 'object' ? updateData : {}) as Record<string, unknown>;

  const rows = (await query(
    `SELECT patient_id, doctor_id, status, scheduled_at, duration, notes
       FROM appointments WHERE id = $1 AND (patient_id = $2 OR doctor_id = $2)`,
    [id, userId],
  )) as AptRow[];
  if (rows.length === 0) return deny(404, 'Appointment not found');
  const apt = rows[0];
  const current = (apt.status ?? 'scheduled').toLowerCase();
  const next = 'status' in data ? data.status : undefined;
  const notes = 'notes' in data ? data.notes : undefined;

  if (apt.doctor_id === userId) {
    if (next !== undefined && (typeof next !== 'string' || !DOCTOR_STATUSES.has(next))) {
      return deny(400, 'Invalid appointment status');
    }
    return { ok: true };
  }

  // The caller is the patient.
  const upcoming = new Date(apt.scheduled_at).getTime() > now.getTime();
  if (notes !== undefined) {
    if (next !== 'cancelled') return deny(403, 'Notes can only be added when cancelling');
    if (notes !== null && typeof notes !== 'string') return deny(400, 'Invalid notes');
    if (typeof notes === 'string' && notes.trim().toLowerCase().startsWith(DOCTOR_CANCEL_PREFIX.toLowerCase())) {
      return deny(403, 'Invalid notes');
    }
  }
  if (next === undefined) return deny(403, 'Nothing you can change on this appointment');

  if (next === 'cancelled') {
    if (!upcoming) return deny(403, 'Only upcoming appointments can be cancelled');
    if (CLOSED.has(current)) return deny(409, `This appointment is already ${current.replace('_', '-')}`);
    return { ok: true };
  }

  if (next === 'scheduled') {
    if (current !== 'cancelled') return deny(403, 'Only a cancelled appointment can be restored');
    if ((apt.notes ?? '').trim().toLowerCase().startsWith(DOCTOR_CANCEL_PREFIX.toLowerCase())) {
      return deny(403, 'Your doctor cancelled this appointment. Please book a new one.');
    }
    if (!upcoming) return deny(403, 'This appointment is in the past');
    const start = new Date(apt.scheduled_at);
    const end = new Date(start.getTime() + (apt.duration && apt.duration > 0 ? apt.duration : 30) * 60000);
    const clash = await query(
      `SELECT 1 FROM appointments a
        WHERE a.doctor_id = $1 AND a.id <> $2
          AND COALESCE(a.status, 'scheduled') <> 'cancelled'
          AND a.scheduled_at < $4::timestamptz
          AND a.scheduled_at + (COALESCE(a.duration, 30) * INTERVAL '1 minute') > $3::timestamptz
        LIMIT 1`,
      [apt.doctor_id, id, start.toISOString(), end.toISOString()],
    );
    if (clash.length > 0) return deny(409, 'That slot has been taken in the meantime. Please book a new time.');
    return { ok: true };
  }

  return deny(403, 'Patients can only cancel an upcoming appointment');
}
