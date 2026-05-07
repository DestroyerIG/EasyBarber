-- Migration v7: desired onboarding plan
-- Run after migration_v6.sql

ALTER TABLE barbershops
  ADD COLUMN IF NOT EXISTS desired_plan VARCHAR(50) NOT NULL DEFAULT 'basico';

DO $$
BEGIN
  ALTER TABLE barbershops
    ADD CONSTRAINT check_desired_plan
    CHECK (desired_plan IN ('basico', 'profissional', 'premium'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

UPDATE barbershops
SET desired_plan = COALESCE(desired_plan, plan, 'basico');
