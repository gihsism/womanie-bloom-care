-- Documents a doctor sends into a patient's Records (2026-11-26).
--
-- A connected doctor uploads a lab report, referral letter or image from
-- the patient chart (/api/docs/from-doctor). The row is an ordinary
-- health_documents row OWNED BY THE PATIENT (user_id = patient), so it is
-- analysed, listed, opened and deleted exactly like her own uploads; this
-- column only records who sent it ("from Dr X" for her, "sent by you" for
-- the doctor). The doctor's short note goes in the existing notes column.
--
-- uploaded_by_doctor_id is written only by the server: /api/db refuses it
-- on insert and update (PROTECTED_COLUMNS), so a patient can't label her
-- own upload as coming from a doctor.
--
-- Additive only, no backfill: existing rows stay NULL (= her own upload).
-- The app works before this is applied: the chart and Records read the
-- column through to_jsonb (NULL when missing), and sending a document
-- answers "not available yet" until it exists.
--
-- Apply with:  node scripts/apply-migration.mjs db/migrations/020_documents_from_doctor.sql
-- Idempotent: safe to run twice.

ALTER TABLE health_documents
  ADD COLUMN IF NOT EXISTS uploaded_by_doctor_id TEXT;

CREATE INDEX IF NOT EXISTS health_documents_uploaded_by_doctor_idx
  ON health_documents (uploaded_by_doctor_id)
  WHERE uploaded_by_doctor_id IS NOT NULL;
