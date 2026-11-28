// Pure helpers for "the doctor's day": the Today schedule on the doctor
// dashboard and the "New since last visit" card in the patient chart.
// Kept free of React so the rules are unit-tested.

import { isFlagged, pregnancyWeek } from './doctorPatient';
import { latestPerTest } from './labFlags';
import { patientName, stageLabel, type DoctorAppointment, type DoctorPatientConnection } from './doctorDashboard';

/** One visit as /api/doctors/day returns it. Health fields only when approved. */
export interface DayVisit {
  appointment_id: string;
  patient_id: string;
  scheduled_at: string | null;
  approved: boolean;
  life_stage?: string | null;
  pregnancy_due_date?: string | null;
  ivf_phase?: string | null;
  open_questions?: number;
  last_visit_at?: string | null;
  new_docs?: number;
  new_abnormal?: number;
  low_mood_streak?: number;
}

/** Consecutive low-mood days that count as "new" on the Today list (matches the API). */
export const LOW_MOOD_STREAK_FLAG = 3;

/** Local midnight today to local midnight the day after tomorrow. */
export function dayWindow(now: number): { from: Date; to: Date } {
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 2);
  return { from, to };
}

export interface ScheduleRow {
  appointmentId: string;
  patientId: string;
  start: Date;
  name: string;
  /** "Pregnancy · week 24", or null when unknown / not approved. */
  stageLine: string | null;
  kind: string;
  duration: number | null;
  approved: boolean;
  /** Ended already (today's earlier visits stay, muted). */
  past: boolean;
  openQuestions: number;
  /** No completed visit with this doctor yet. */
  firstVisit: boolean;
  /** What is new since her last completed visit; empty = nothing. */
  newSince: string[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function newSinceParts(v: Pick<DayVisit, 'new_docs' | 'new_abnormal' | 'low_mood_streak'>): string[] {
  const parts: string[] = [];
  if (v.new_abnormal && v.new_abnormal > 0) parts.push(plural(v.new_abnormal, 'result out of range', 'results out of range'));
  if (v.new_docs && v.new_docs > 0) parts.push(plural(v.new_docs, 'new document'));
  if (v.low_mood_streak && v.low_mood_streak >= LOW_MOOD_STREAK_FLAG) parts.push(`low mood ${v.low_mood_streak} days in a row`);
  return parts;
}

export function stageLineFor(
  v: Pick<DayVisit, 'life_stage' | 'pregnancy_due_date' | 'ivf_phase'> | undefined,
  fallbackStage: string | null | undefined,
  now: number,
): string | null {
  const stage = stageLabel(v?.life_stage ?? fallbackStage);
  const preg = pregnancyWeek(v?.pregnancy_due_date ?? null, now);
  const parts = [stage, preg ? `week ${preg.week}` : null, v?.ivf_phase ? `IVF: ${v.ivf_phase}` : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

const sameLocalDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * Today's and tomorrow's visits in time order. The appointment list the
 * dashboard already loaded is the base (so the schedule shows even when
 * /api/doctors/day fails); the day API only adds the per-patient facts.
 */
export function buildDaySchedule(input: {
  appointments: DoctorAppointment[];
  patients: DoctorPatientConnection[];
  dayVisits: DayVisit[];
  now: number;
}): { today: ScheduleRow[]; tomorrow: ScheduleRow[] } {
  const { appointments, patients, dayVisits, now } = input;
  const byId = new Map(dayVisits.map(v => [v.appointment_id, v]));
  const today = new Date(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const rows = appointments
    .filter(a => (a.status ?? 'scheduled').toLowerCase() !== 'cancelled')
    .map(a => ({ a, start: new Date(a.scheduled_at) }))
    .filter(({ start }) => !isNaN(start.getTime()) && (sameLocalDay(start, today) || sameLocalDay(start, tomorrow)))
    .sort((x, y) => x.start.getTime() - y.start.getTime())
    .map(({ a, start }): ScheduleRow => {
      const conn = patients.find(p => p.patient_id === a.patient_id);
      const v = byId.get(a.id);
      // Approval: the server's answer when we have it, else the connection list.
      const approved = v ? v.approved : conn?.status === 'approved';
      const end = start.getTime() + (a.duration || 30) * 60_000;
      return {
        appointmentId: a.id,
        patientId: a.patient_id,
        start,
        name: patientName(patients, a.patient_id),
        stageLine: approved ? stageLineFor(v, conn?.patient_life_stage, now) : null,
        kind: a.consultation_type === 'video' ? 'Video' : 'In person',
        duration: a.duration,
        approved,
        past: end <= now,
        openQuestions: approved && v ? v.open_questions ?? 0 : 0,
        firstVisit: approved && !!v && !v.last_visit_at,
        newSince: approved && v ? newSinceParts(v) : [],
      };
    });

  return {
    today: rows.filter(r => sameLocalDay(r.start, today)),
    tomorrow: rows.filter(r => sameLocalDay(r.start, tomorrow)),
  };
}

// ---- "New since last visit" (patient chart) ----

export interface SinceItem {
  key: string;
  kind: 'document' | 'result' | 'note' | 'log';
  title: string;
  detail: string;
  at: number;
  flagged?: boolean;
}

export interface SinceSummary {
  /** Her last completed visit with this doctor, or null for a first visit. */
  lastVisitAt: number | null;
  items: SinceItem[];
}

const t = (d: string | null | undefined) => (d ? Date.parse(d) : NaN);

/**
 * Documents, results and notes created after her previous COMPLETED
 * appointment with this doctor. Results are dated by the upload of the
 * document they came from (that is when they reached the chart). Out of
 * range results first, then newest first.
 */
export function newSinceLastVisit(input: {
  appointments: Array<{ scheduled_at: string; status: string | null }>;
  documents: Array<{ id: string; file_name: string; ai_suggested_name: string | null; uploaded_at: string | null }>;
  medicalData: Array<{ id: string; document_id: string; title: string; value: string | number | null; unit: string | null; status: string | null; data_type?: string | null; date_recorded?: string | null }>;
  notes: Array<{ id: string; title: string; created_at: string }>;
  signals: Array<{ id: string; signal_date: string; notes: string | null }>;
  now: number;
}): SinceSummary {
  const { appointments, documents, medicalData, notes, signals, now } = input;
  let last = -Infinity;
  for (const a of appointments) {
    if ((a.status || '').toLowerCase() !== 'completed') continue;
    const at = t(a.scheduled_at);
    if (Number.isFinite(at) && at <= now && at > last) last = at;
  }
  if (!Number.isFinite(last)) return { lastVisitAt: null, items: [] };

  const items: SinceItem[] = [];
  const uploadedAt = new Map<string, number>();
  for (const d of documents) {
    const at = t(d.uploaded_at);
    if (!Number.isFinite(at)) continue;
    uploadedAt.set(d.id, at);
    if (at > last) {
      items.push({ key: `doc-${d.id}`, kind: 'document', title: d.ai_suggested_name || d.file_name, detail: 'Document', at });
    }
  }
  // Shared rule (labFlags): only the latest reading of each test is
  // flagged, as on the Results tab and the patient's own screens. An old
  // report uploaded late keeps its status word but is marked superseded.
  const latestIds = new Set(latestPerTest(medicalData).map(r => r.id));
  for (const r of medicalData) {
    const at = uploadedAt.get(r.document_id);
    if (at === undefined || at <= last) continue;
    const value = r.value === null || r.value === '' ? '' : ` ${r.value}${r.unit ? ` ${r.unit}` : ''}`;
    const outside = isFlagged(r.status);
    const flagged = outside && latestIds.has(r.id);
    items.push({
      key: `res-${r.id}`,
      kind: 'result',
      title: `${r.title}${value}`,
      detail: !outside
        ? 'Result'
        : flagged
        ? `Result · ${(r.status || '').toLowerCase()}`
        : `Result · ${(r.status || '').toLowerCase()} on an older test, re-tested since`,
      at,
      flagged,
    });
  }
  for (const n of notes) {
    const at = t(n.created_at);
    if (Number.isFinite(at) && at > last) items.push({ key: `note-${n.id}`, kind: 'note', title: n.title, detail: 'Your note', at });
  }
  for (const s of signals) {
    // A daily log is dated by day: it counts when that day is after the visit day.
    const at = t(s.signal_date);
    if (!s.notes?.trim() || !Number.isFinite(at) || at <= last) continue;
    const text = s.notes.trim();
    items.push({ key: `log-${s.id}`, kind: 'log', title: text.length > 80 ? `${text.slice(0, 79)}…` : text, detail: 'Her daily log', at });
  }

  items.sort((a, b) => Number(!!b.flagged) - Number(!!a.flagged) || b.at - a.at);
  return { lastVisitAt: last, items };
}
