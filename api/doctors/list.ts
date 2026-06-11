import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../_lib/auth.js';
import { withSentry } from '../_lib/sentry.js';

// Patient-facing directory of verified doctors.
//
// Patients can't read doctor_profiles / doctor_schedule via /api/db
// because the ownership enforcement pins user_id to the session user
// (the patient). But browsing verified doctors is an explicitly public
// intent — the data is meant to be discoverable by any signed-in
// patient. This endpoint returns the joined view, filtered to
// verified+available, with only the doctor-surface fields exposed.

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const sql = neon(process.env.DATABASE_URL!);

  // Public-surface columns only: no email, phone, or internal notes.
  const doctorsPromise = sql.query(
    `SELECT user_id, full_name, title, specialties, years_experience, bio,
            avatar_url, rating, review_count, is_verified, languages, credentials
       FROM doctor_profiles
      WHERE is_verified = true`,
    []
  );

  const settingsPromise = sql.query(
    `SELECT doctor_id, consultation_price, consultation_duration,
            is_available, currency, video_enabled
       FROM consultation_settings
      WHERE is_available = true`,
    []
  );

  const schedulePromise = sql.query(
    `SELECT doctor_id, day_of_week, start_time, end_time, is_active
       FROM doctor_schedule
      WHERE is_active = true`,
    []
  );

  type Row = Record<string, unknown>;

  try {
    const [doctors, settings, schedules] = await Promise.all([
      doctorsPromise, settingsPromise, schedulePromise,
    ]) as [Row[], Row[], Row[]];

    // Join in memory; only include doctors who have bookable settings.
    const settingsByDoctor = new Map<string, Row>();
    for (const s of settings) settingsByDoctor.set(s.doctor_id as string, s);

    const schedulesByDoctor = new Map<string, Row[]>();
    for (const s of schedules) {
      const key = s.doctor_id as string;
      const arr = schedulesByDoctor.get(key) ?? [];
      arr.push(s);
      schedulesByDoctor.set(key, arr);
    }

    const out = doctors
      .map(d => ({
        ...d,
        consultation_settings: settingsByDoctor.get(d.user_id as string) ?? null,
        schedule: schedulesByDoctor.get(d.user_id as string) ?? [],
      }))
      .filter(d => d.consultation_settings);

    return res.status(200).json({ doctors: out });
  } catch (error) {
    console.error('doctors/list error:', error);
    return res.status(500).json({ error: 'Failed to load doctor directory' });
  }
}

export default withSentry(handler);
