// Pure helpers for the doctor's dashboard. Kept free of React so the
// ranking, sorting and consent rules can be unit-tested.

export interface DoctorPatientConnection {
  id: string;
  patient_id: string;
  status: string | null;
  created_at: string;
  connection_type: string | null;
  patient_full_name?: string | null;
  patient_life_stage?: string | null;
  last_upload_at?: string | null;
  recent_doc_count?: number | string | null;
}

export interface DoctorAppointment {
  id: string;
  patient_id: string;
  scheduled_at: string;
  status: string | null;
  consultation_type: string | null;
  duration: number | null;
  notes?: string | null;
}

// Plain stage names (SIMPLIFY_PLAN §4.2), shared with the patient side.
const STAGE_LABELS: Record<string, string> = {
  'pre-menstrual': 'Before first period',
  'menstrual-cycle': 'Period tracking',
  contraception: 'Birth control',
  conception: 'Trying to conceive',
  'trying-to-conceive': 'Trying to conceive',
  ivf: 'IVF',
  pregnancy: 'Pregnancy',
  pregnant: 'Pregnancy',
  postpartum: 'After birth',
  menopause: 'Menopause',
  perimenopause: 'Menopause',
  'post-menopause': 'After menopause',
};

export function stageLabel(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim().toLowerCase();
  if (!v) return null;
  if (STAGE_LABELS[v]) return STAGE_LABELS[v];
  const words = v.replace(/[-_]/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function patientName(
  patients: Array<Pick<DoctorPatientConnection, 'patient_id' | 'patient_full_name'>>,
  patientId: string,
): string {
  const p = patients.find(c => c.patient_id === patientId);
  return p?.patient_full_name?.trim() || `Patient #${patientId.slice(0, 8)}`;
}

// Consent rule mirrored from /api/doctors/patient: a chart opens only
// for an approved connection. Pending rows show the name and nothing else.
export function canOpenChart(conn: Pick<DoctorPatientConnection, 'status'>): boolean {
  return conn.status === 'approved';
}

export function recentDocCount(conn: DoctorPatientConnection): number {
  if (!canOpenChart(conn)) return 0;
  const n = Number(conn.recent_doc_count ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Approved patients with new uploads first, then by latest upload, then
// newest connection. Pending / other statuses sink to the bottom.
export function sortPatients(patients: DoctorPatientConnection[]): DoctorPatientConnection[] {
  const score = (p: DoctorPatientConnection): [number, number] => {
    const approved = canOpenChart(p) ? 1 : 0;
    const recent = recentDocCount(p);
    const lastUpload = p.last_upload_at ? Date.parse(p.last_upload_at) || 0 : 0;
    const created = Date.parse(p.created_at) || 0;
    return [approved * 10_000_000_000 + recent * 1_000_000_000 + lastUpload / 1000, created];
  };
  return [...patients].sort((a, b) => {
    const [pa, ca] = score(a);
    const [pb, cb] = score(b);
    if (pb !== pa) return pb - pa;
    return cb - ca;
  });
}

// Search by name, plain or raw life stage, or the "Patient #abc12345" id.
export function filterPatients(patients: DoctorPatientConnection[], query: string): DoctorPatientConnection[] {
  const q = query.trim().toLowerCase().replace(/^patient\s*#/, '');
  if (!q) return patients;
  return patients.filter(p => {
    const name = (p.patient_full_name ?? '').toLowerCase();
    const raw = (p.patient_life_stage ?? '').toLowerCase();
    const plain = (stageLabel(p.patient_life_stage) ?? '').toLowerCase();
    const shortId = p.patient_id.slice(0, 8).toLowerCase();
    return name.includes(q) || raw.includes(q) || plain.includes(q) || shortId.includes(q);
  });
}

const isCancelled = (a: DoctorAppointment) => (a.status ?? '').toLowerCase() === 'cancelled';
const endOf = (a: DoctorAppointment) => Date.parse(a.scheduled_at) + (a.duration ?? 30) * 60_000;

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isUpcoming(a: DoctorAppointment, now: number): boolean {
  return !isCancelled(a) && Date.parse(a.scheduled_at) > now;
}

// A past visit nobody has closed yet (completed / no-show).
export function needsCloseout(a: DoctorAppointment, now: number): boolean {
  const s = (a.status ?? 'scheduled').toLowerCase();
  if (s === 'completed' || s === 'no_show' || s === 'cancelled') return false;
  return Date.parse(a.scheduled_at) <= now;
}

export function upcomingAppointments(appts: DoctorAppointment[], now: number): DoctorAppointment[] {
  return appts
    .filter(a => isUpcoming(a, now))
    .sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at));
}

// Past or cancelled visits, MOST RECENT FIRST. The old dashboard sliced
// the ascending list, so the doctor saw her oldest ten visits and never
// the ones that still needed closing.
export function pastAppointments(appts: DoctorAppointment[], now: number): DoctorAppointment[] {
  return appts
    .filter(a => Date.parse(a.scheduled_at) <= now || isCancelled(a))
    .sort((a, b) => Date.parse(b.scheduled_at) - Date.parse(a.scheduled_at));
}

export function isPatientCancellation(a: DoctorAppointment): boolean {
  return isCancelled(a) && !/^Cancelled by doctor:/i.test(a.notes ?? '');
}

export type TodayItemKind = 'visit' | 'closeout' | 'cancelled' | 'uploads';

export interface TodayItem {
  key: string;
  kind: TodayItemKind;
  patientId: string;
  title: string;
  detail: string;
  // Only set for visits; used to stress the one about to start.
  startingSoon?: boolean;
  appointmentId?: string;
}

const CLOSEOUT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const CANCEL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function timeLabel(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Everything that needs the doctor, ranked: today's visits (soonest
// first), visits to close, patient cancellations, new uploads. The
// dashboard shows the first three and links to the rest.
export function doctorTodayItems(input: {
  appointments: DoctorAppointment[];
  patients: DoctorPatientConnection[];
  now: number;
  dismissedCancellations?: Set<string>;
}): TodayItem[] {
  const { appointments, patients, now } = input;
  const dismissed = input.dismissedCancellations ?? new Set<string>();
  const today = new Date(now);
  const items: TodayItem[] = [];

  appointments
    .filter(a => !isCancelled(a) && sameLocalDay(new Date(a.scheduled_at), today) && endOf(a) > now)
    .sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at))
    .forEach(a => {
      const start = new Date(a.scheduled_at);
      const minutes = Math.round((start.getTime() - now) / 60_000);
      const kind = a.consultation_type === 'video' ? 'Video' : 'In person';
      const when = minutes <= 0 ? 'now' : minutes <= 60 ? `in ${minutes} min` : timeLabel(start);
      items.push({
        key: `visit-${a.id}`,
        kind: 'visit',
        patientId: a.patient_id,
        appointmentId: a.id,
        title: `${patientName(patients, a.patient_id)} · ${when}`,
        detail: `${kind} · ${timeLabel(start)}${a.duration ? ` · ${a.duration} min` : ''}`,
        startingSoon: minutes <= 15,
      });
    });

  appointments
    .filter(a => needsCloseout(a, now) && endOf(a) <= now && now - Date.parse(a.scheduled_at) <= CLOSEOUT_WINDOW_MS)
    .sort((a, b) => Date.parse(b.scheduled_at) - Date.parse(a.scheduled_at))
    .forEach(a => {
      items.push({
        key: `closeout-${a.id}`,
        kind: 'closeout',
        patientId: a.patient_id,
        appointmentId: a.id,
        title: `Close the visit with ${patientName(patients, a.patient_id)}`,
        detail: `${new Date(a.scheduled_at).toLocaleDateString()} · did it happen?`,
      });
    });

  appointments
    .filter(a => isPatientCancellation(a) && !dismissed.has(a.id))
    .filter(a => {
      const t = Date.parse(a.scheduled_at);
      return Number.isFinite(t) && t >= now - CANCEL_WINDOW_MS;
    })
    .sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at))
    .forEach(a => {
      const d = new Date(a.scheduled_at);
      items.push({
        key: `cancelled-${a.id}`,
        kind: 'cancelled',
        patientId: a.patient_id,
        appointmentId: a.id,
        title: `${patientName(patients, a.patient_id)} cancelled`,
        detail: `${d.toLocaleDateString()} at ${timeLabel(d)} · slot is free again`,
      });
    });

  sortPatients(patients)
    .filter(p => recentDocCount(p) > 0)
    .forEach(p => {
      const n = recentDocCount(p);
      items.push({
        key: `uploads-${p.id}`,
        kind: 'uploads',
        patientId: p.patient_id,
        title: `${patientName(patients, p.patient_id)} added ${n} document${n === 1 ? '' : 's'}`,
        detail: 'In the last 14 days',
      });
    });

  return items;
}
