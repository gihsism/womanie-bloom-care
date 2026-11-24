-- "Questions to bring" saved per upcoming visit. Until now the Visits
-- page built the list in the browser only (VisitPrepCard), so the doctor
-- never saw it. The patient saves the list to a visit, edits and ticks it
-- on Visits; the doctor of THAT visit reads it (read-only) in the patient
-- chart, through the consent-gated /api/doctors/patient (approved
-- connection required, every fetch logged in chart_access_log).
--
-- Additive only: one new table, nothing existing is altered. One row per
-- (patient, appointment). user_id is the patient and owns the row via
-- /api/db. appointment_id is appointments.id stored as text (the doctor
-- read joins on a.id::text and on a.patient_id = user_id, so a row only
-- ever shows for the patient's own visit with that doctor).
-- questions: [{ "id": "...", "text": "...", "asked": false }]
--
-- Apply with:  node scripts/apply-migration.mjs db/migrations/012_visit_questions.sql
-- Idempotent: safe to run twice. The app works before it is applied
-- (the list simply stays on the device and the doctor sees nothing).
CREATE TABLE IF NOT EXISTS visit_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  appointment_id TEXT NOT NULL,
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, appointment_id)
);
CREATE INDEX IF NOT EXISTS visit_questions_appointment_idx ON visit_questions (appointment_id);
