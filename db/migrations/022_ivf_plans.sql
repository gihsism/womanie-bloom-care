-- IVF journey (IVF stage page): the dates of her current treatment cycle
-- as her clinic gave them (down-regulation, stim day 1, trigger shot,
-- egg retrieval, embryo transfer, test day) and the exact trigger-shot
-- moment, so the phone can remind her 1 hour and 10 minutes before.
--
-- Additive only: one new table, nothing existing is altered. One row per
-- patient. user_id owns the row via /api/db (OWNER_COLUMN). The push
-- scheduler (api/_lib/push-run.ts) reads trigger_at for users who opted
-- in to the "IVF trigger shot" phone reminder.
-- plan: { "v": 1, "downregStart", "stimStart", "triggerAt", "triggerTz",
--         "retrieval", "transfer", "testDate" }  (src/lib/ivfJourney.ts)
-- trigger_at mirrors plan.triggerAt as a real timestamp (UTC instant);
-- trigger_timezone = the zone she typed the time in (e.g. Europe/Zurich).
-- Two-week-wait symptom notes are life_events (kind 'tww_symptom'), no
-- table needed.
--
-- Apply with:  node scripts/apply-migration.mjs db/migrations/022_ivf_plans.sql
-- Idempotent: safe to run twice. The app works before it is applied (the
-- dates stay on the device and no trigger reminder reaches the phone).
CREATE TABLE IF NOT EXISTS ivf_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,
  plan JSONB NOT NULL DEFAULT '{}'::jsonb,
  trigger_at TIMESTAMPTZ,
  trigger_timezone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ivf_plans_trigger_at_idx ON ivf_plans (trigger_at) WHERE trigger_at IS NOT NULL;
