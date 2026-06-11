// One-off test-fixture seeder for the e2e doctor account.
// Run AFTER smoke-authed.sh has created the account via doctor-signup:
//   node --env-file=.env.local .planning/seed-e2e-doctor.mjs
//
// What it does (idempotent):
//  - flips the e2e doctor to verified + grants the 'doctor' role
//    (mirrors what /api/admin/doctors does on approve)
//  - creates consultation_settings with is_available = FALSE, so the
//    account NEVER appears in the public FindDoctor directory
// The fixture exists so smoke-authed.sh can exercise doctor login,
// role gating, and doctor-owned tables against production.

import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1];
const sql = neon(get('DATABASE_URL'));
const email = get('E2E_DOCTOR_EMAIL');
if (!email) throw new Error('E2E_DOCTOR_EMAIL missing from .env.local');

const users = await sql.query('SELECT id FROM auth_users WHERE email = $1', [email.toLowerCase()]);
if (users.length === 0) throw new Error(`No auth_users row for ${email} — run smoke-authed.sh first (it signs the account up).`);
const userId = users[0].id;

await sql.query(
  `UPDATE doctor_profiles SET is_verified = true, verification_status = 'approved', verified_at = now() WHERE user_id = $1`,
  [userId]
);
await sql.query(
  `INSERT INTO user_roles (user_id, role) VALUES ($1, 'doctor') ON CONFLICT DO NOTHING`,
  [userId]
);
await sql.query(
  `INSERT INTO consultation_settings (doctor_id, consultation_duration, consultation_price, currency, is_available, video_enabled)
   SELECT $1, 30, 0, 'CHF', false, false
    WHERE NOT EXISTS (SELECT 1 FROM consultation_settings WHERE doctor_id = $1)`,
  [userId]
);
console.log(`seeded: ${email} (${userId}) — verified doctor, role granted, is_available=false`);
