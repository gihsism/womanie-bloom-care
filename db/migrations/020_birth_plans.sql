-- Birth plan (pregnancy, from week 28): her wishes for the birth, saved
-- to her account and, when she ticks "Show in my doctor's chart", visible
-- read-only to a doctor she has an APPROVED connection with.
--
-- Additive only: one new table, nothing existing is altered. One row per
-- patient. user_id owns the row via /api/db (OWNER_COLUMN). Doctors never
-- read it through /api/db; /api/doctors/patient returns it after the
-- consent gate (approved connection + doctor role, every fetch logged in
-- chart_access_log) and only when shared_with_doctor is true.
-- plan: { "v": 1, "choices": { "<section>": ["<option>", ...] },
--         "notes": { "<section>": "free text" } }  (src/lib/birthPlan.ts)
--
-- Apply with:  node scripts/apply-migration.mjs db/migrations/020_birth_plans.sql
-- Idempotent: safe to run twice. The app works before it is applied (the
-- plan stays on the device and the doctor sees nothing).
CREATE TABLE IF NOT EXISTS birth_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,
  plan JSONB NOT NULL DEFAULT '{}'::jsonb,
  shared_with_doctor BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
