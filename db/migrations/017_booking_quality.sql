-- Booking quality + doctor onboarding (2026-11-26).
--
-- Additive only: one unique index and one new nullable column; nothing
-- existing is altered or dropped. The app works before this is applied:
-- - double booking is already prevented by the per-doctor advisory lock in
--   /api/appointments/book and /reschedule; this index is the database-level
--   backstop (a clash surfaces as 23505 -> 409 "slot just taken");
-- - the practice address field and its setup step stay hidden until the
--   column exists (the app reads it via select * / to_jsonb).
--
-- BEFORE applying, check there are no existing double bookings (the index
-- cannot be built over duplicates):
--   SELECT doctor_id, scheduled_at, count(*) FROM appointments
--    WHERE status IS DISTINCT FROM 'cancelled'
--    GROUP BY 1, 2 HAVING count(*) > 1;
-- If rows come back, cancel the extra visit(s) with the patient first.
--
-- Apply with:  node scripts/apply-migration.mjs db/migrations/017_booking_quality.sql
-- Idempotent: safe to run twice.

-- One active visit per doctor per start time. Cancelled visits free the
-- slot (the predicate matches the app's COALESCE(status,'scheduled') <>
-- 'cancelled'; NULL status counts as active).
CREATE UNIQUE INDEX IF NOT EXISTS appointments_doctor_slot_active_uniq
  ON appointments (doctor_id, scheduled_at)
  WHERE status IS DISTINCT FROM 'cancelled';

-- Where in-person visits happen. Free text (street, postcode, city), shown
-- on the doctor's directory card; edited in Profile & settings.
ALTER TABLE doctor_profiles
  ADD COLUMN IF NOT EXISTS practice_address TEXT;
