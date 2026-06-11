-- Found by the new authenticated smoke test (session 65, 2026-06-11):
-- the doctor directory (/api/doctors/list), patient appointments list
-- (/api/me/appointments), AND doctor signup (/api/auth/doctor-signup)
-- all reference doctor_profiles columns that never made it across the
-- Supabase -> Neon migration: title, specialties, years_experience,
-- languages, rating, review_count, credentials. Result: doctor signup
-- 500s (doctor_profiles holds 0 rows), the directory 500s, and the
-- patient appointments card silently never renders.
--
-- Additive only; the table is empty so there is nothing to backfill.
-- `specialty` (singular, Supabase-era) is kept for the endpoints that
-- still read it (chart-access log).

ALTER TABLE doctor_profiles
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS specialties TEXT[],
  ADD COLUMN IF NOT EXISTS years_experience INTEGER,
  ADD COLUMN IF NOT EXISTS languages TEXT[],
  ADD COLUMN IF NOT EXISTS rating NUMERIC,
  ADD COLUMN IF NOT EXISTS review_count INTEGER,
  ADD COLUMN IF NOT EXISTS credentials TEXT[];
