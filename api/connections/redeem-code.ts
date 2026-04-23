import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../_lib/auth.js';
import { withSentry } from '../_lib/sentry.js';

// Doctor-facing endpoint to redeem a patient's access code.
//
// The patient generates a random `patient_access_codes` row owned by
// their user_id; the doctor enters that code to create a doctor_patient
// connection. The doctor can't look up the code via /api/db because the
// ownership enforcement pins user_id to the session user (the doctor),
// and the row belongs to the patient. This endpoint runs the whole
// redemption server-side with proper role verification.

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { code } = (req.body ?? {}) as { code?: string };
  if (!code || typeof code !== 'string' || code.trim().length === 0) {
    return res.status(400).json({ error: 'Missing code' });
  }

  const sql = neon(process.env.DATABASE_URL!);

  // Only users with the doctor role can redeem codes.
  const roles = (await sql.query(
    'SELECT role FROM user_roles WHERE user_id = $1',
    [user.id]
  )) as Array<{ role: string }>;
  if (!roles.some(r => r.role === 'doctor')) {
    return res.status(403).json({ error: 'Only doctors can redeem access codes' });
  }

  // Find the code.
  const matches = (await sql.query(
    `SELECT id, patient_id FROM patient_access_codes
       WHERE code = $1 AND is_used = false AND expires_at > now()`,
    [code.trim()]
  )) as Array<{ id: string; patient_id: string }>;
  if (matches.length === 0) {
    return res.status(404).json({ error: 'Invalid, expired, or already-used code' });
  }
  const entry = matches[0];

  try {
    await sql.query(
      `INSERT INTO doctor_patient_connections (doctor_id, patient_id, connection_type, status)
         VALUES ($1, $2, 'code', 'pending')`,
      [user.id, entry.patient_id]
    );
  } catch (err) {
    const code = (err as { code?: string } | undefined)?.code;
    if (code === '23505') {
      return res.status(409).json({ error: 'Already connected with this patient' });
    }
    console.error('redeem-code insert error:', err);
    return res.status(500).json({ error: 'Failed to create connection' });
  }

  await sql.query(
    'UPDATE patient_access_codes SET is_used = true WHERE id = $1',
    [entry.id]
  );

  return res.status(200).json({ success: true });
}

export default withSentry(handler);
