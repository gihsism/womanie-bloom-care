-- Personal data that older app versions kept only in the browser
-- (localStorage): date of birth / height / weight / blood type from
-- onboarding, the hospital-bag checklist, pregnancy weight log, blood
-- pressure log, EPDS answers, screenings, vaccinations, beta-hCG values,
-- emergency contacts, symptom and checklist ticks, notification choices.
-- Stored in her account so it follows her to a new phone.
--
-- Additive only: one new table, nothing existing is altered. One row per
-- (user, item); `value` is the item as the app saved it. Every row is
-- owned by user_id (the session user), enforced by /api/db.
--
-- Apply with:  node scripts/apply-migration.mjs db/migrations/011_user_app_data.sql
-- Idempotent: safe to run twice.
CREATE TABLE IF NOT EXISTS user_app_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, key)
);
CREATE INDEX IF NOT EXISTS user_app_data_user_idx ON user_app_data (user_id);
