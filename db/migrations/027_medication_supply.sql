-- When a medicine runs out. MedicineLog lets her enter the last day of a
-- course (ends_on) and/or the current pack (pack_size doses, started on
-- pack_started_on). Home's Today list then shows "Iron: pack runs out in
-- 3 days" from 3 days before (lib/medicineSupply.ts).
--
-- Additive only: three nullable columns, nothing existing is altered and
-- no row is rewritten. Text 'yyyy-mm-dd' like started_on / stopped_on.
-- The app works before it is applied (MedicineLog retries the save
-- without these fields; no Today row shows).
--
-- Apply with:  node scripts/apply-migration.mjs db/migrations/027_medication_supply.sql
-- Idempotent: safe to run twice.
ALTER TABLE medications ADD COLUMN IF NOT EXISTS ends_on TEXT;
ALTER TABLE medications ADD COLUMN IF NOT EXISTS pack_size INTEGER;
ALTER TABLE medications ADD COLUMN IF NOT EXISTS pack_started_on TEXT;
