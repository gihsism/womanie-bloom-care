-- Session-64 finding: doctor_patient_connections had NO unique
-- constraint on (doctor_id, patient_id), so redeem-code's 23505
-- "already connected" branch was dead code and duplicate pending rows
-- were possible (booking auto-connect guarded itself with NOT EXISTS).
--
-- Verified before applying (2026-06-11): table holds 0 rows, so no
-- dedup needed and nothing can be lost. Additive constraint only.
-- With this in place, the unique violation paths in redeem-code and
-- any future writers actually fire.

ALTER TABLE doctor_patient_connections
  ADD CONSTRAINT doctor_patient_connections_pair_key
  UNIQUE (doctor_id, patient_id);
