-- The doctor's day (/api/doctors/day): reads one doctor's visits in a
-- two-day window, her patients' last completed visit, and documents
-- uploaded after it. Two indexes keep those reads cheap as data grows.
--
-- Additive only: indexes, nothing existing is altered or dropped. The app
-- works before this is applied (the queries are just slower).
--
-- Apply with:  node scripts/apply-migration.mjs db/migrations/016_doctor_day_indexes.sql
-- Idempotent: safe to run twice.
CREATE INDEX IF NOT EXISTS appointments_doctor_scheduled_idx
  ON appointments (doctor_id, scheduled_at);

CREATE INDEX IF NOT EXISTS health_documents_user_uploaded_idx
  ON health_documents (user_id, uploaded_at DESC);
