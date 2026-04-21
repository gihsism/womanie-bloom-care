-- Versioned document analyses. Each re-analysis writes a new row here
-- (and new medical_extracted_data rows pointing to it). Exactly one row
-- per document may have is_current = TRUE, enforced by a partial unique
-- index. Old rows stay around as history.

CREATE TABLE IF NOT EXISTS document_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES health_documents(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  model TEXT,
  name TEXT,
  category TEXT,
  summary TEXT,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_analyses_doc_created_idx
  ON document_analyses (document_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS document_analyses_one_current_per_doc_idx
  ON document_analyses (document_id) WHERE is_current = TRUE;

-- Link extracted data to the analysis run it came from. Legacy rows
-- get analysis_id = NULL until backfilled.
ALTER TABLE medical_extracted_data
  ADD COLUMN IF NOT EXISTS analysis_id UUID REFERENCES document_analyses(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS medical_extracted_data_analysis_id_idx
  ON medical_extracted_data (analysis_id);

-- Convenience view: "the extracted data you should show the user right now."
-- Rows from the current analysis plus any legacy rows with no analysis_id.
CREATE OR REPLACE VIEW current_extracted_data AS
SELECT m.*
FROM medical_extracted_data m
WHERE m.analysis_id IS NULL
   OR m.analysis_id IN (SELECT id FROM document_analyses WHERE is_current = TRUE);
