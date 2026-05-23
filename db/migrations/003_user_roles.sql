-- user_roles never made it across the Supabase → Neon migration. It was a
-- Supabase table (with RLS + a has_role() function) and the migration recreated
-- every other table but this one. Result: every doctor login and every admin
-- role check queried a non-existent relation, the /api/db router returned a 500,
-- and the client read that as "no role" → "Access denied. This account is not
-- registered as a doctor." Admin approval (api/admin/doctors.ts) also 500'd
-- because it INSERTs here.
--
-- This recreates the table. Additive and non-destructive — no existing data is
-- touched. Doctors still require admin approval before a row lands here; this
-- just makes that path work instead of erroring.

CREATE TABLE IF NOT EXISTS user_roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('doctor', 'patient', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Makes api/admin/doctors.ts's `INSERT ... ON CONFLICT DO NOTHING` properly
  -- idempotent (re-approving the same doctor is a no-op instead of a duplicate).
  UNIQUE (user_id, role)
);

-- Primary read path is "does this session user have role X?" — covered by the
-- UNIQUE(user_id, role) index. This extra index speeds up plain user_id lookups
-- (e.g. api/connections/redeem-code.ts: SELECT role WHERE user_id = $1).
CREATE INDEX IF NOT EXISTS user_roles_user_id_idx ON user_roles (user_id);
