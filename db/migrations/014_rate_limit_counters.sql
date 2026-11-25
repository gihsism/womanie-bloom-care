-- Rate limits that hold across Vercel instances. Until now each warm pod
-- kept its own in-memory counters, so the real limit was LIMIT x pods and a
-- cold start reset it. api/_lib/ratelimit.ts now keeps one row per
-- (bucket, subject, day window) here and bumps it with an atomic upsert.
--
-- No personal data: subject_hash is the SHA-256 of the user id / IP /
-- email, never the value itself. Rows older than two days are deleted by
-- the app itself (opportunistic cleanup), so the table stays small.
--
-- Additive only: one new table + one index; nothing existing is touched.
-- Apply with:  node scripts/apply-migration.mjs db/migrations/014_rate_limit_counters.sql
-- Idempotent: safe to run twice. The app works before it is applied
-- (the limiter logs and falls back to the old per-pod counters).
CREATE TABLE IF NOT EXISTS rate_limit_counters (
  bucket        TEXT        NOT NULL,
  subject_hash  TEXT        NOT NULL,
  window_start  TIMESTAMPTZ NOT NULL,
  hits          INTEGER     NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, subject_hash, window_start)
);
CREATE INDEX IF NOT EXISTS rate_limit_counters_window_idx
  ON rate_limit_counters (window_start);
