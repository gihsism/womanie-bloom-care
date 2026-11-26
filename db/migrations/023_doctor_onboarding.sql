-- Doctor onboarding: admin verification queue, admin audit log and
-- one-time doctor invitation links (2026-11-26).
--
-- 1. doctor_profiles gets the outcome of the admin's licence check:
--    verification_note (the reason shown to the doctor when rejected or
--    revoked, on her login screen), verified_at / verified_by (who
--    decided, when). Written only by /api/admin/doctors and an invited
--    signup; /api/db refuses them from the client (PROTECTED_COLUMNS).
--
-- 2. admin_audit_log: one row per admin action (approve, reject, revoke,
--    invite created / revoked, invite redeemed). Written in the SAME
--    transaction as the action, so an action without its log row cannot
--    commit. No foreign keys: the record must survive account deletion.
--
-- 3. doctor_invites: a one-time link for one doctor email. Only the
--    SHA-256 hash of the token is stored; the raw token exists once, in
--    the link the admin copies. Single use (used_at), expires after 7
--    days (expires_at), can be revoked (revoked_at).
--
-- Additive only, no backfill. Until this is applied the admin queue
-- answers 500 on approve/reject (the log insert fails, so nothing is
-- half-written) and the invite routes answer "not available yet".
--
-- Apply with:  node scripts/apply-migration.mjs db/migrations/023_doctor_onboarding.sql
-- Idempotent: safe to run twice.

ALTER TABLE doctor_profiles
  ADD COLUMN IF NOT EXISTS verification_note TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by TEXT;

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id   TEXT NOT NULL,
  admin_email     TEXT,
  action          TEXT NOT NULL,
  target_user_id  TEXT,
  target_email    TEXT,
  detail          JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_target_idx ON admin_audit_log (target_user_id);

CREATE TABLE IF NOT EXISTS doctor_invites (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             TEXT NOT NULL,
  token_hash        TEXT NOT NULL UNIQUE,
  note              TEXT,
  created_by        TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ NOT NULL,
  used_at           TIMESTAMPTZ,
  used_by_user_id   TEXT,
  revoked_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS doctor_invites_email_idx ON doctor_invites (lower(email));
CREATE INDEX IF NOT EXISTS doctor_invites_created_idx ON doctor_invites (created_at DESC);
