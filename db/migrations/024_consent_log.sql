-- Consent log: when she accepted the privacy policy (and later the terms),
-- and WHICH version (2026-11-26).
--
-- One row per acceptance, append-only from the app: a new version of the
-- policy means a new row, the old row stays as the record of what she had
-- accepted before. Written only by the server (/api/auth/signup when she
-- ticks the box, /api/me/consents from Me -> Privacy); NOT in /api/db's
-- ownership map, so the client can't forge or rewrite a row.
--
-- document: 'privacy_policy' | 'terms'
-- version:  the version string from api/_lib/policy-versions.ts at the
--           moment she accepted (e.g. '2026-11-26')
-- source:   where she accepted: 'signup' | 'me_privacy'
-- No IP address or user agent: the account id and the time are enough to
-- show the acceptance, and storing less is the point (data minimisation).
--
-- Exported by /api/me/export (consents) and deleted with the account by
-- /api/me/delete-account. See docs/privacy-data-map.md.
--
-- Additive only, no backfill: existing accounts have no row and see
-- "not recorded yet - accept" in Me -> Privacy.
-- The app works before this is applied: Me -> Privacy shows "not available
-- yet", signup still succeeds (the consent insert is best-effort), export
-- and deletion skip the table.
--
-- Apply with:  node scripts/apply-migration.mjs db/migrations/024_consent_log.sql
-- Idempotent: safe to run twice.

CREATE TABLE IF NOT EXISTS consent_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  document    TEXT NOT NULL,
  version     TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'me_privacy',
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS consent_log_user_idx ON consent_log (user_id, document, accepted_at DESC);
