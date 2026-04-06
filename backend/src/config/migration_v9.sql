-- Migration v9: account email verification
-- Run after migration_v8.sql

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'email_verified'
  ) THEN
    ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT false;

    -- Backward compatibility: contas legadas passam a ser consideradas verificadas.
    UPDATE users
    SET email_verified = true;
  END IF;
END
$$;

ALTER TABLE users ALTER COLUMN email_verified SET DEFAULT false;
ALTER TABLE users ALTER COLUMN email_verified SET NOT NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token_hash CHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_sent_at TIMESTAMP;

UPDATE users
SET email_verified = true
WHERE email_verified = false
  AND email_verification_token_hash IS NULL
  AND email_verification_expires_at IS NULL
  AND email_verified_at IS NULL;

UPDATE users
SET email_verified_at = COALESCE(email_verified_at, created_at, NOW())
WHERE email_verified = true
  AND email_verified_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_email_verification_token_hash
  ON users(email_verification_token_hash)
  WHERE email_verification_token_hash IS NOT NULL;

COMMIT;
