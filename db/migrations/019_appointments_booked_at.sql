-- Patient booking confirmation (2026-11-26).
--
-- The patient's Notifications page shows "Booking confirmed" for visits
-- she booked in the last 7 days; it reads appointments.created_at (via
-- to_jsonb in /api/me/appointments, so the app works before this is
-- applied: the notice just stays hidden while booked_at is null).
--
-- Additive only. Most databases already have this column from the
-- Supabase era; then the first statement does nothing. When it is added
-- here, existing rows stay NULL on purpose (no backfill), so old visits
-- never show up as "just booked"; only new bookings get a time.
--
-- Apply with:  node scripts/apply-migration.mjs db/migrations/019_appointments_booked_at.sql
-- Idempotent: safe to run twice.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

ALTER TABLE appointments
  ALTER COLUMN created_at SET DEFAULT now();
