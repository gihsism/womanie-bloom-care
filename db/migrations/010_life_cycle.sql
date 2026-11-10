-- Life-cycle features, requested by Alena 2026-11-10 ("all of the above"):
-- trackers saved to the account, medicine log for every stage, labour &
-- birth record, baby tracker.
--
-- Additive only: four new tables, nothing existing is altered. Every row
-- is owned by user_id (the session user), enforced by /api/db.

-- One row per timed or tapped event: contractions, kick-count sessions,
-- feeds, baby sleep, nappies, medicine doses, labour medicines.
-- `kind` says which; `data` carries the kind-specific fields.
CREATE TABLE IF NOT EXISTS life_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  baby_id UUID,
  kind TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS life_events_user_kind_idx
  ON life_events (user_id, kind, occurred_at DESC);

-- The user's medicine and supplement list (any life stage).
CREATE TABLE IF NOT EXISTS medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  dose TEXT,
  times_per_day INTEGER,
  reminder_times TEXT[],
  stage TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  started_on TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS medications_user_idx ON medications (user_id, active);

CREATE TABLE IF NOT EXISTS babies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  birth_date TEXT,
  sex TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS babies_user_idx ON babies (user_id);

-- One record per birth: labour and delivery details. Medicines given in
-- labour are life_events (kind 'labour_med'); hospital reports are
-- health_documents linked by document id in document_ids.
CREATE TABLE IF NOT EXISTS birth_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  baby_id UUID,
  labour_started_at TIMESTAMPTZ,
  birth_at TIMESTAMPTZ,
  place TEXT,
  delivery_type TEXT,
  pain_relief TEXT[],
  birth_weight_g INTEGER,
  birth_length_cm NUMERIC,
  apgar_1 INTEGER,
  apgar_5 INTEGER,
  complications TEXT,
  notes TEXT,
  document_ids UUID[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS birth_records_user_idx ON birth_records (user_id);
