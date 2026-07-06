import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../_lib/auth.js';
import { withSentry } from '../_lib/sentry.js';

// Atomic replace of the signed-in doctor's weekly availability.
//
// The editor previously did DELETE-all then INSERT as two separate
// /api/db calls: if the insert failed, the doctor was left with NO
// schedule, and computeFreeSlots returns zero slots without one — so no
// patient could book them until they noticed and re-saved. This runs the
// delete + per-day inserts in a single Neon transaction, so the schedule
// is only ever the old set or the fully-applied new set.

interface DayInput {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/; // HH:MM 24h

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const body = (req.body ?? {}) as { days?: unknown };
  if (!Array.isArray(body.days)) {
    return res.status(400).json({ error: 'days[] required' });
  }

  // Validate every day up front so a bad row can't partially apply.
  const days: DayInput[] = [];
  for (const raw of body.days) {
    const d = raw as Partial<DayInput>;
    if (
      typeof d.day_of_week !== 'number' ||
      !Number.isInteger(d.day_of_week) ||
      d.day_of_week < 0 ||
      d.day_of_week > 6 ||
      typeof d.start_time !== 'string' ||
      typeof d.end_time !== 'string' ||
      !TIME_RE.test(d.start_time) ||
      !TIME_RE.test(d.end_time) ||
      d.end_time <= d.start_time
    ) {
      return res.status(400).json({ error: 'Each day needs day_of_week 0-6 and start_time < end_time as HH:MM' });
    }
    days.push({ day_of_week: d.day_of_week, start_time: d.start_time, end_time: d.end_time });
  }

  try {
    const sql = neon(process.env.DATABASE_URL!);
    // doctor_id is pinned to the session user server-side — a caller can
    // only replace their own schedule.
    const statements = [
      sql`DELETE FROM doctor_schedule WHERE doctor_id = ${user.id}`,
      ...days.map(
        (d) =>
          sql`INSERT INTO doctor_schedule (doctor_id, day_of_week, start_time, end_time, is_active)
              VALUES (${user.id}, ${d.day_of_week}, ${d.start_time}, ${d.end_time}, true)`,
      ),
    ];
    await sql.transaction(statements);
    return res.status(200).json({ success: true, days: days.length });
  } catch (error) {
    console.error('doctors/schedule error:', error);
    return res.status(500).json({ error: 'Failed to save schedule' });
  }
}

export default withSentry(handler);
