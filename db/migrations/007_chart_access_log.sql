-- HANDOFF #6, approved by Alena 2026-06-11: record every time a doctor
-- opens a patient's chart so the patient can review access from
-- Settings. GDPR-friendly transparency; until now there was no trace.
--
-- Additive and non-destructive. One row per chart fetch (the
-- /api/doctors/patient consent gate is the single chokepoint), written
-- server-side so it can't be skipped by the client. Index serves the
-- patient-side "who viewed my chart" listing.

CREATE TABLE IF NOT EXISTS chart_access_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  doctor_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  surface TEXT NOT NULL DEFAULT 'patient_chart',
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chart_access_log_patient_idx
  ON chart_access_log (patient_id, viewed_at DESC);
