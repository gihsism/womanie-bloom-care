import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../../_lib/auth.js';
import { withSentry } from '../../_lib/sentry.js';

// Trends tab of the doctor's patient chart (read-only).
//
// Same consent rule as /api/doctors/patient: nothing is read unless this
// doctor has an APPROVED row in doctor_patient_connections with the
// patient, and every fetch is written to chart_access_log (surface
// 'patient_trends') so the patient sees it in Settings.
//
// Data minimisation: only the numbers the charts need leave the server.
//   - period_tracking: start/end dates (last ~13 months) for cycle and
//     period length
//   - daily_health_signals (last 90 days): the date, the symptom list and
//     a basal temperature parsed from the note. The note text itself is
//     NOT returned.
//   - user_app_data: ONLY the weight and blood-pressure logs (fixed key
//     allowlist below), reduced to date + number fields.

export const TREND_APP_DATA_KEYS = ['preg_weight_log', 'maternal_weight', 'bp_log'] as const;

const MAX_POINTS = 120;

/** "BBT: 36.6°C" in a daily note -> °C, or null (same rule as src/lib/ovulation.ts parseBbtC). */
export function bbtFromNote(notes: unknown): number | null {
  if (typeof notes !== 'string') return null;
  const m = notes.match(/BBT:\s*(\d+\.?\d*)\s*°?\s*([CF])?/i);
  if (!m) return null;
  const raw = parseFloat(m[1]);
  if (!Number.isFinite(raw)) return null;
  const unit = (m[2] || '').toUpperCase();
  const c = unit === 'C' || (!unit && raw < 50) ? raw : ((raw - 32) * 5) / 9;
  return c >= 34.5 && c <= 38.5 ? Math.round(c * 100) / 100 : null;
}

const ymd = (v: unknown): string | null => {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v !== 'string') return null;
  return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
};
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

export function weightEntries(rows: Array<{ key: string; value: unknown }>): Array<{ date: string; kg: number }> {
  const byDate = new Map<string, number>();
  for (const r of rows) {
    if (r.key !== 'preg_weight_log' && r.key !== 'maternal_weight') continue;
    const list = r.key === 'preg_weight_log'
      ? r.value
      : (r.value && typeof r.value === 'object' ? (r.value as { entries?: unknown }).entries : null);
    if (!Array.isArray(list)) continue;
    for (const e of list) {
      const date = ymd((e as { date?: unknown })?.date);
      const kg = num((e as { kg?: unknown })?.kg);
      if (date && kg !== null && kg > 20 && kg < 300 && !byDate.has(date)) byDate.set(date, Math.round(kg * 10) / 10);
    }
  }
  return [...byDate.entries()]
    .map(([date, kg]) => ({ date, kg }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-MAX_POINTS);
}

export function bpEntries(rows: Array<{ key: string; value: unknown }>): Array<{ date: string; systolic: number; diastolic: number }> {
  const out: Array<{ date: string; systolic: number; diastolic: number }> = [];
  for (const r of rows) {
    if (r.key !== 'bp_log' || !Array.isArray(r.value)) continue;
    for (const e of r.value) {
      const date = ymd((e as { date?: unknown })?.date);
      const systolic = num((e as { systolic?: unknown })?.systolic);
      const diastolic = num((e as { diastolic?: unknown })?.diastolic);
      if (date && systolic !== null && diastolic !== null && systolic > 50 && systolic < 260 && diastolic > 30 && diastolic < 180) {
        out.push({ date, systolic: Math.round(systolic), diastolic: Math.round(diastolic) });
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_POINTS);
}

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const doctor = await getAuthUser(req);
  if (!doctor) return res.status(401).json({ error: 'Unauthorized' });

  const patientId = typeof req.query.id === 'string' ? req.query.id : null;
  if (!patientId) return res.status(400).json({ error: 'Missing patient id' });

  const sql = neon(process.env.DATABASE_URL!);

  const conn = await sql.query(
    `SELECT id FROM doctor_patient_connections
       WHERE doctor_id = $1 AND patient_id = $2 AND status = 'approved'
       LIMIT 1`,
    [doctor.id, patientId]
  ) as unknown[];
  if (conn.length === 0) {
    return res.status(403).json({ error: 'No approved connection to this patient' });
  }

  try {
    await sql.query(
      `INSERT INTO chart_access_log (doctor_id, patient_id, surface) VALUES ($1, $2, 'patient_trends')`,
      [doctor.id, patientId]
    );
  } catch (logErr) {
    console.error('doctors/patient-trends: chart_access_log insert failed (non-fatal):', logErr);
  }

  try {
    const [periodRows, signalRows] = await Promise.all([
      sql.query(
        `SELECT period_start_date, period_end_date FROM period_tracking
          WHERE user_id = $1 AND period_start_date >= NOW() - INTERVAL '13 months'
          ORDER BY period_start_date ASC`,
        [patientId]
      ),
      sql.query(
        `SELECT signal_date, symptoms, notes FROM daily_health_signals
          WHERE user_id = $1 AND signal_date >= NOW() - INTERVAL '90 days'
          ORDER BY signal_date ASC`,
        [patientId]
      ),
    ]) as [Array<Record<string, unknown>>, Array<Record<string, unknown>>];

    // Weight and blood-pressure logs live in user_app_data (migration 011).
    // Best-effort: before that migration the table may be missing.
    let appRows: Array<{ key: string; value: unknown }> = [];
    try {
      appRows = await sql.query(
        `SELECT key, value FROM user_app_data WHERE user_id = $1 AND key = ANY($2)`,
        [patientId, [...TREND_APP_DATA_KEYS]]
      ) as Array<{ key: string; value: unknown }>;
    } catch (appErr) {
      console.error('doctors/patient-trends: user_app_data read failed (non-fatal):', appErr);
    }

    const periods = periodRows
      .map(p => ({ start: ymd(p.period_start_date), end: ymd(p.period_end_date) }))
      .filter((p): p is { start: string; end: string | null } => p.start !== null);

    const signals = signalRows
      .map(s => ({
        date: ymd(s.signal_date),
        symptoms: Array.isArray(s.symptoms) ? (s.symptoms as unknown[]).filter((x): x is string => typeof x === 'string') : [],
        bbt: bbtFromNote(s.notes),
      }))
      .filter((s): s is { date: string; symptoms: string[]; bbt: number | null } => s.date !== null);

    return res.status(200).json({
      periods,
      signals,
      weights: weightEntries(appRows),
      bloodPressure: bpEntries(appRows),
    });
  } catch (error) {
    console.error('doctors/patient-trends error:', error);
    return res.status(500).json({ error: 'Failed to load trends' });
  }
}

export default withSentry(handler);
