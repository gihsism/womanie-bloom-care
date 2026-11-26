-- Trying to conceive: the day she started trying (2026-11-26).
--
-- The TTC stage page suggests a calm doctor check-up after 12 months of
-- trying (6 months from age 35, straight away from 40; NICE CG156, ASRM
-- 2020). That needs the start date. Onboarding asks "How long have you
-- been trying?" and the stage page lets her set the exact day.
--
-- Additive only: one nullable column on profiles, no backfill. Owned by
-- profiles.id via /api/db (OWNER_COLUMN), so no API change. Exported with
-- the rest of the profile row (SELECT * FROM profiles).
--
-- Until this is applied the app keeps the date on the device
-- (localStorage "conception:<user id>:ttcStartDate") and the write to
-- profiles fails quietly; once applied, the next save lands in the column.
-- 024 is reserved for the consent log (privacy work).
--
-- Apply with:  node scripts/apply-migration.mjs db/migrations/025_ttc_start_date.sql
-- Idempotent: safe to run twice.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS ttc_start_date DATE;
