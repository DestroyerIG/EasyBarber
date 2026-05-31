-- Persist the plan chosen at signup so the checkout/payment step uses it
-- instead of always falling back to 'basico'.
--
-- `pending_registrations` is a legacy raw-SQL table (not a Prisma model), so we
-- guard with IF EXISTS / IF NOT EXISTS to keep this safe and idempotent across
-- environments where the table may or may not already exist.
ALTER TABLE IF EXISTS pending_registrations
  ADD COLUMN IF NOT EXISTS desired_plan VARCHAR(50) NOT NULL DEFAULT 'basico';
