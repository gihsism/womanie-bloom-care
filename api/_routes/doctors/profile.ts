import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../../_lib/auth.js';
import { withSentry } from '../../_lib/sentry.js';
import { nextFreeSlots } from '../../_lib/practice-time.js';
import { APPROVED_DOCTOR_SQL, publicConsultation, publicDoctor, publicSchedule } from '../../_lib/doctor-public.js';

// A doctor's profile page as patients see it (GET ?doctor_id=): bio,
// specialties, languages, practice address, visit types and price, and
// the next 3 free times. Any signed-in user may read it, but only for an
// APPROVED doctor who has "Accept new bookings" on; anyone else is a 404,
// so the page never tells a patient that a pending or paused doctor
// exists. The response is built field by field (api/_lib/doctor-public)
// and never carries email, phone, licence number or internal flags. Busy
// times are read as start + length only, no patient identity.

const LOOKAHEAD_DAYS = 28;

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const doctorId = typeof req.query.doctor_id === 'string' ? req.query.doctor_id.trim() : '';
  if (!doctorId || doctorId.length > 100) return res.status(400).json({ error: 'Missing doctor_id' });

  try {
    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql.query(
      `SELECT dp.user_id, dp.full_name, dp.title, dp.specialties, dp.years_experience, dp.bio,
              dp.avatar_url, dp.rating, dp.review_count, dp.languages, dp.credentials,
              to_jsonb(dp) ->> 'practice_address' AS practice_address,
              cs.consultation_price, cs.currency, cs.consultation_duration, cs.video_enabled,
              (SELECT COALESCE(json_agg(json_build_object(
                        'day_of_week', ds.day_of_week, 'start_time', ds.start_time,
                        'end_time', ds.end_time, 'is_active', ds.is_active)), '[]'::json)
                 FROM doctor_schedule ds
                WHERE ds.doctor_id = dp.user_id AND ds.is_active IS NOT FALSE) AS schedule
         FROM doctor_profiles dp
         JOIN consultation_settings cs ON cs.doctor_id = dp.user_id
        WHERE dp.user_id = $1
          AND ${APPROVED_DOCTOR_SQL}
          AND cs.is_available = true`,
      [doctorId],
    ) as Array<Record<string, unknown>>;
    if (rows.length === 0) {
      return res.status(404).json({ error: 'This doctor is not taking bookings on Womanie right now.', code: 'not_bookable' });
    }
    const row = rows[0];

    const doctor = publicDoctor(row);
    const consultation = publicConsultation(row);
    const schedule = publicSchedule(row.schedule);

    const now = new Date();
    const until = new Date(now.getTime() + (LOOKAHEAD_DAYS + 2) * 86_400_000).toISOString();
    const busy = await sql.query(
      `SELECT scheduled_at, duration
         FROM appointments
        WHERE doctor_id = $1
          AND scheduled_at > $2::timestamptz - INTERVAL '1 day'
          AND scheduled_at < $3
          AND COALESCE(status, 'scheduled') <> 'cancelled'`,
      [doctorId, now.toISOString(), until],
    ) as Array<{ scheduled_at: string; duration: number | null }>;

    const next = nextFreeSlots({
      schedule,
      durationMin: consultation.consultation_duration,
      busy: busy.map(b => ({ scheduled_at: new Date(b.scheduled_at).toISOString(), duration: b.duration })),
      now,
      count: 3,
      daysAhead: LOOKAHEAD_DAYS,
    });

    return res.status(200).json({
      doctor: { ...doctor, consultation_settings: consultation, schedule },
      next_slots: next.map(d => d.toISOString()),
      time_zone: 'Europe/Zurich',
    });
  } catch (error) {
    console.error('doctors/profile error:', error);
    return res.status(500).json({ error: 'Failed to load this doctor' });
  }
}

export default withSentry(handler);
