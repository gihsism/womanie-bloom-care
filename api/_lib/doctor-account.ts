// Is this account an approved doctor? The 'doctor' row in user_roles is
// granted only by /api/admin/doctors on approval (and removed on reject /
// revoke); the doctor dashboard that edits the schedule and consultation
// settings is gated on the same role (useRequireRole('doctor')).
//
// Used to stop patient accounts from writing doctor-only rows
// (doctor_schedule, consultation_settings) under their own id, which would
// otherwise be accepted because those tables are owner-scoped by doctor_id.

type Query = (text: string, params: unknown[]) => Promise<unknown[]>;

export async function hasDoctorRole(query: Query, userId: string): Promise<boolean> {
  const rows = await query(
    `SELECT 1 FROM user_roles WHERE user_id = $1 AND role = 'doctor' LIMIT 1`,
    [userId],
  );
  return rows.length > 0;
}

// Tables only a doctor may write (their own rows, by doctor_id).
export const DOCTOR_ONLY_WRITE_TABLES: ReadonlySet<string> = new Set(['doctor_schedule', 'consultation_settings']);
