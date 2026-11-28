import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../../_lib/auth.js';
import { withSentry } from '../../_lib/sentry.js';
import { outsideRangeSince } from '../../_lib/lab-flags.js';

// The doctor's day: her visits in a short window (the dashboard asks for
// today + tomorrow in the doctor's local time), each with the few facts
// she wants before walking in: stage, open questions, and whether
// anything is new since her last completed visit with this patient.
//
//   GET /api/doctors/day?from=<ISO>&to=<ISO>   (window at most 3 days)
//
// Consent: same rule as /api/doctors/patient. Appointments are the
// doctor's own rows (she already sees them on her dashboard), but every
// health-derived field (stage, questions, new documents/results, mood)
// is read ONLY for patients with an APPROVED doctor_patient_connections
// row with this doctor. Pending patients come back with approved=false
// and nothing else. Each approved patient shown is logged to
// chart_access_log (surface 'doctor_day') so she sees it in Settings.
//
// Data minimisation: counts only. No document names, no result values,
// no question text, no mood words leave the server here; the chart has
// the detail behind its own gate.

export const MAX_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_VISITS = 100;
/** Moods counted as low (same set as the chart's mood row). */
export const LOW_MOOD_KEYS = new Set(['sad', 'anxious', 'irritable']);
/** Consecutive low-mood days at which the day view flags her. */
export const LOW_MOOD_STREAK_FLAG = 3;
/** Lab rows read per patient for the out-of-range count (newest first). */
const MAX_LAB_ROWS = 500;

const DAY_MS = 86_400_000;

const ymd = (v: unknown): string | null => {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v !== 'string') return null;
  return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
};

const iso = (v: unknown): string | null => {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString();
  if (typeof v === 'string' && Number.isFinite(Date.parse(v))) return v;
  return null;
};

const int = (v: unknown): number => {
  const n = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : 0;
};

/** Questions not yet ticked as asked (stored JSONB may be parsed or a string). */
export function openQuestionCount(raw: unknown): number {
  let v = raw;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { return 0; }
  }
  if (!Array.isArray(v)) return 0;
  let n = 0;
  for (const q of v.slice(0, 20)) {
    if (!q || typeof q !== 'object') continue;
    const { text, asked } = q as Record<string, unknown>;
    if (typeof text === 'string' && text.trim() && asked !== true) n++;
  }
  return n;
}

/**
 * Days in a row, ending on her most recent logged day, with a low mood.
 * The run only counts when that latest day is within 2 days of `now`,
 * so a streak from last month does not flag today's visit.
 */
export function lowMoodStreak(signals: Array<{ signal_date: unknown; mood: unknown }>, now: number): number {
  const lowByDay = new Map<string, boolean>();
  for (const s of signals) {
    const d = ymd(s.signal_date);
    if (!d || !Array.isArray(s.mood) || s.mood.length === 0) continue;
    const low = (s.mood as unknown[]).some(m => typeof m === 'string' && LOW_MOOD_KEYS.has(m));
    lowByDay.set(d, (lowByDay.get(d) ?? false) || low);
  }
  const days = [...lowByDay.keys()].sort().reverse();
  if (days.length === 0) return 0;
  const today = new Date(now).toISOString().slice(0, 10);
  if ((Date.parse(today) - Date.parse(days[0])) / DAY_MS > 2) return 0;
  let streak = 0;
  let expect = Date.parse(days[0]);
  for (const d of days) {
    const t = Date.parse(d);
    if (t !== expect || !lowByDay.get(d)) break;
    streak++;
    expect = t - DAY_MS;
  }
  return streak;
}

function parseWindow(q: VercelRequest['query']): { from: Date; to: Date } | null {
  const f = typeof q.from === 'string' ? Date.parse(q.from) : NaN;
  const t = typeof q.to === 'string' ? Date.parse(q.to) : NaN;
  if (!Number.isFinite(f) || !Number.isFinite(t) || t <= f || t - f > MAX_WINDOW_MS) return null;
  return { from: new Date(f), to: new Date(t) };
}

type Row = Record<string, unknown>;

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const doctor = await getAuthUser(req);
  if (!doctor) return res.status(401).json({ error: 'Unauthorized' });

  const window = parseWindow(req.query ?? {});
  if (!window) return res.status(400).json({ error: 'from/to must be ISO times, at most 3 days apart' });

  const sql = neon(process.env.DATABASE_URL!);

  try {
    // The doctor's own visits in the window. `approved` is decided here,
    // server-side, against doctor_patient_connections, never by the client,
    // and only while she still holds the doctor role (a revoked doctor
    // keeps her old connection rows).
    const appts = await sql.query(
      `SELECT a.id, a.patient_id, a.scheduled_at, a.status, a.consultation_type, a.duration,
              EXISTS (
                SELECT 1 FROM doctor_patient_connections c
                 JOIN user_roles r ON r.user_id = c.doctor_id AND r.role = 'doctor'
                 WHERE c.doctor_id = a.doctor_id AND c.patient_id = a.patient_id
                   AND c.status = 'approved'
              ) AS approved
         FROM appointments a
        WHERE a.doctor_id = $1 AND a.scheduled_at >= $2 AND a.scheduled_at < $3
          AND COALESCE(a.status, 'scheduled') <> 'cancelled'
        ORDER BY a.scheduled_at ASC
        LIMIT ${MAX_VISITS}`,
      [doctor.id, window.from.toISOString(), window.to.toISOString()]
    ) as Row[];

    const approvedIds = [...new Set(
      appts.filter(a => a.approved === true).map(a => String(a.patient_id))
    )];
    const approvedApptIds = appts.filter(a => a.approved === true).map(a => String(a.id));

    const profiles = new Map<string, Row>();
    const since = new Map<string, Row>();
    const questions = new Map<string, number>();
    const streaks = new Map<string, number>();
    const newAbnormal = new Map<string, number>();

    if (approvedIds.length > 0) {
      try {
        await sql.query(
          `INSERT INTO chart_access_log (doctor_id, patient_id, surface)
           SELECT $1, unnest($2::text[]), 'doctor_day'`,
          [doctor.id, approvedIds]
        );
      } catch (logErr) {
        console.error('doctors/day: chart_access_log insert failed (non-fatal):', logErr);
      }

      const [profileRows, sinceRows, signalRows] = await Promise.all([
        sql.query(
          `SELECT id, life_stage, pregnancy_due_date, ivf_phase FROM profiles WHERE id = ANY($1)`,
          [approvedIds]
        ),
        // Last COMPLETED visit with THIS doctor, and the documents she
        // uploaded after it.
        sql.query(
          `WITH last_visit AS (
             SELECT patient_id, MAX(scheduled_at) AS last_visit_at
               FROM appointments
              WHERE doctor_id = $1 AND patient_id = ANY($2)
                AND status = 'completed' AND scheduled_at < NOW()
              GROUP BY patient_id
           )
           SELECT l.patient_id, l.last_visit_at,
                  (SELECT COUNT(*) FROM health_documents d
                    WHERE d.user_id = l.patient_id AND d.uploaded_at > l.last_visit_at) AS new_docs
             FROM last_visit l`,
          [doctor.id, approvedIds]
        ),
        sql.query(
          `SELECT user_id, signal_date, mood FROM daily_health_signals
            WHERE user_id = ANY($1) AND signal_date >= NOW() - INTERVAL '14 days'`,
          [approvedIds]
        ),
      ]) as [Row[], Row[], Row[]];

      // Out-of-range results new since the last visit, by the shared rule
      // (lab-flags): only the latest reading of each test counts, so a
      // high value on an old report that a newer test supersedes is not
      // "new out of range" here while the chart says in range. Read only
      // for patients who have a completed visit with this doctor.
      const sinceIds = sinceRows.map(r => String(r.patient_id));
      if (sinceIds.length > 0) {
        try {
          const labRows = await sql.query(
            `SELECT m.user_id, m.title, m.data_type, m.date_recorded, m.status, d.uploaded_at
               FROM current_extracted_data m
               JOIN health_documents d ON d.id::text = m.document_id::text AND d.user_id = m.user_id
              WHERE m.user_id = ANY($1)
              ORDER BY m.date_recorded DESC NULLS LAST
              LIMIT ${MAX_LAB_ROWS * 4}`,
            [sinceIds]
          ) as Row[];
          const byUser = new Map<string, Row[]>();
          for (const r of labRows) {
            const k = String(r.user_id);
            const list = byUser.get(k) ?? [];
            if (list.length < MAX_LAB_ROWS) list.push(r);
            byUser.set(k, list);
          }
          for (const s of sinceRows) {
            const k = String(s.patient_id);
            const lastAt = Date.parse(iso(s.last_visit_at) ?? '');
            const rows = (byUser.get(k) ?? []).map(r => ({
              title: (r.title as string | null) ?? null,
              data_type: (r.data_type as string | null) ?? null,
              date_recorded: ymd(r.date_recorded),
              status: (r.status as string | null) ?? null,
              uploaded_at: iso(r.uploaded_at),
            }));
            newAbnormal.set(k, Number.isFinite(lastAt)
              ? outsideRangeSince(rows, lastAt, r => Date.parse(r.uploaded_at ?? '')).length
              : 0);
          }
        } catch (labErr) {
          console.error('doctors/day: results read failed (non-fatal):', labErr);
        }
      }

      for (const p of profileRows) profiles.set(String(p.id), p);
      for (const s of sinceRows) since.set(String(s.patient_id), s);
      const byPatient = new Map<string, Row[]>();
      for (const s of signalRows) {
        const k = String(s.user_id);
        byPatient.set(k, [...(byPatient.get(k) ?? []), s]);
      }
      const now = Date.now();
      for (const [k, rows] of byPatient) {
        streaks.set(k, lowMoodStreak(rows as Array<{ signal_date: unknown; mood: unknown }>, now));
      }

      // Best-effort: the table arrives with migration 012.
      try {
        const vq = await sql.query(
          `SELECT user_id, appointment_id, questions FROM visit_questions
            WHERE user_id = ANY($1) AND appointment_id = ANY($2)`,
          [approvedIds, approvedApptIds]
        ) as Row[];
        const ownerOf = new Map(appts.map(a => [String(a.id), String(a.patient_id)]));
        for (const r of vq) {
          const apptId = String(r.appointment_id);
          // A row counts only for the patient's OWN visit.
          if (ownerOf.get(apptId) !== String(r.user_id)) continue;
          questions.set(apptId, openQuestionCount(r.questions));
        }
      } catch (vqErr) {
        console.error('doctors/day: visit_questions read failed (non-fatal):', vqErr);
      }
    }

    const visits = appts.map(a => {
      const base = {
        appointment_id: String(a.id),
        patient_id: String(a.patient_id),
        scheduled_at: iso(a.scheduled_at),
        status: (a.status as string | null) ?? null,
        consultation_type: (a.consultation_type as string | null) ?? null,
        duration: a.duration == null ? null : int(a.duration),
        approved: a.approved === true,
      };
      if (!base.approved) return base;
      const p = profiles.get(base.patient_id);
      const s = since.get(base.patient_id);
      return {
        ...base,
        life_stage: (p?.life_stage as string | null) ?? null,
        pregnancy_due_date: ymd(p?.pregnancy_due_date),
        ivf_phase: (p?.ivf_phase as string | null) ?? null,
        open_questions: questions.get(base.appointment_id) ?? 0,
        last_visit_at: s ? iso(s.last_visit_at) : null,
        new_docs: s ? int(s.new_docs) : 0,
        new_abnormal: newAbnormal.get(base.patient_id) ?? 0,
        low_mood_streak: streaks.get(base.patient_id) ?? 0,
      };
    });

    return res.status(200).json({ visits });
  } catch (error) {
    console.error('doctors/day error:', error);
    return res.status(500).json({ error: 'Failed to load your day' });
  }
}

export default withSentry(handler);
