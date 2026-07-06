import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../_lib/auth.js';
import { withSentry } from '../_lib/sentry.js';
import { parseScheduleDays } from '../_lib/schedule-validation.js';

// Atomic replace of the signed-in doctor's weekly availability.
//
// The editor previously did DELETE-all then INSERT as two separate
// /api/db calls: if the insert failed, the doctor was left with NO
// schedule, and computeFreeSlots returns zero slots without one — so no
// patient could book them until they noticed and re-saved. This runs the
// delete + per-day inserts in a single Neon transaction, so the schedule
// is only ever the old set or the fully-applied new set.

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Validate every day up front so a bad row can't partially apply.
  const parsed = parseScheduleDays((req.body ?? {}).days);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  const { days } = parsed;

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
