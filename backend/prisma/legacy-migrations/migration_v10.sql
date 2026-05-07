-- Migration v10: Supabase Auth identity bridge + pending registrations
-- Run after migration_v9.sql

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS supabase_user_id UUID;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_identity_sync_at TIMESTAMP;

UPDATE users
SET auth_provider = 'legacy'
WHERE auth_provider IS NULL;

ALTER TABLE users ALTER COLUMN auth_provider SET DEFAULT 'legacy';
ALTER TABLE users ALTER COLUMN auth_provider SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_users_auth_provider'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT chk_users_auth_provider
      CHECK (auth_provider IN ('legacy', 'supabase', 'hybrid'));
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_supabase_user_id_unique
  ON users (supabase_user_id)
  WHERE supabase_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS pending_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  supabase_user_id UUID,
  barbershop_name VARCHAR(255) NOT NULL,
  owner_name VARCHAR(255) NOT NULL,
  whatsapp VARCHAR(20) NOT NULL,
  desired_plan VARCHAR(50) NOT NULL DEFAULT 'basico'
    CHECK (desired_plan IN ('basico', 'profissional', 'premium')),
  password_hash CHAR(60) NOT NULL,
  auth_provider VARCHAR(20) NOT NULL DEFAULT 'supabase'
    CHECK (auth_provider IN ('legacy', 'supabase', 'hybrid')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'canceled')),
  verification_sent_at TIMESTAMP,
  confirmed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (supabase_user_id)
);

CREATE INDEX IF NOT EXISTS idx_pending_registrations_status_email
  ON pending_registrations (status, email);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'update_updated_at_column'
  ) THEN
    DROP TRIGGER IF EXISTS trigger_pending_registrations_updated_at ON pending_registrations;

    CREATE TRIGGER trigger_pending_registrations_updated_at
      BEFORE UPDATE ON pending_registrations
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END
$$;

COMMIT;
