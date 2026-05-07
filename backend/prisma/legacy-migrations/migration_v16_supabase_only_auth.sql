-- Migration v16: Supabase-only authentication provider
-- Run after migration_v15.sql and before running migrate-legacy-users-to-supabase.js

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS supabase_user_id UUID;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_identity_sync_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP;

UPDATE users
SET auth_provider = 'supabase',
    last_identity_sync_at = COALESCE(last_identity_sync_at, NOW())
WHERE supabase_user_id IS NOT NULL
  AND auth_provider IS DISTINCT FROM 'supabase';

UPDATE users
SET email_verified_at = COALESCE(email_verified_at, created_at, NOW())
WHERE email_verified = true
  AND email_verified_at IS NULL;

ALTER TABLE users ALTER COLUMN auth_provider SET DEFAULT 'supabase';
ALTER TABLE users ALTER COLUMN auth_provider SET NOT NULL;

DROP INDEX IF EXISTS idx_users_supabase_user_id_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_supabase_user_id_unique
  ON users (supabase_user_id)
  WHERE supabase_user_id IS NOT NULL;

ALTER TABLE pending_registrations ADD COLUMN IF NOT EXISTS supabase_user_id UUID;
ALTER TABLE pending_registrations ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) NOT NULL DEFAULT 'supabase';

UPDATE pending_registrations
SET auth_provider = 'supabase'
WHERE auth_provider IS DISTINCT FROM 'supabase';

ALTER TABLE pending_registrations ALTER COLUMN auth_provider SET DEFAULT 'supabase';

ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_auth_provider;
ALTER TABLE users
  ADD CONSTRAINT chk_users_auth_provider_supabase_only
  CHECK (auth_provider = 'supabase') NOT VALID;

ALTER TABLE pending_registrations DROP CONSTRAINT IF EXISTS pending_registrations_auth_provider_check;
ALTER TABLE pending_registrations
  ADD CONSTRAINT chk_pending_registrations_auth_provider_supabase_only
  CHECK (auth_provider = 'supabase') NOT VALID;

COMMIT;
