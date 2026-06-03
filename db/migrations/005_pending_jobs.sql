-- audit #18 — document analysis is dispatched fire-and-forget from the browser
-- (DocumentUpload → POST /api/analyze-document, keepalive). If that request is
-- lost before Vercel receives it (flaky network, tab closed at the wrong
-- moment, a cold-start hiccup), the upload just sits there forever with no
-- analysis and nothing notices.
--
-- This adds a small retry ledger. The actual retry is driven by the owner's own
-- session when they next open Health Records (/api/docs/pending-retries scans
-- their un-analyzed docs and re-dispatches), so no server-to-server auth path is
-- needed; this table only caps the attempts and records the last error so a
-- permanently-unparseable document stops retrying instead of burning API budget
-- on every page load.
--
-- Additive and non-destructive. ON DELETE CASCADE keeps it in lockstep with the
-- document it tracks (the /api/docs/delete cascade already removes the doc).

CREATE TABLE IF NOT EXISTS pending_jobs (
  document_id UUID PRIMARY KEY REFERENCES health_documents(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
  attempts    INT  NOT NULL DEFAULT 0,
  last_error  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The retry scan filters by owner + status, so index that pair.
CREATE INDEX IF NOT EXISTS pending_jobs_user_status_idx ON pending_jobs (user_id, status);
