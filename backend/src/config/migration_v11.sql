-- Migration v11: Hybrid checkout metadata for Stripe (recurring + one-time)
-- Run after migration_v10.sql

BEGIN;

ALTER TABLE barbershops
  ADD COLUMN IF NOT EXISTS stripe_payment_mode VARCHAR(20),
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'check_barbershops_stripe_payment_mode'
  ) THEN
    ALTER TABLE barbershops
      ADD CONSTRAINT check_barbershops_stripe_payment_mode
      CHECK (stripe_payment_mode IN ('subscription', 'payment'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'check_barbershops_payment_method'
  ) THEN
    ALTER TABLE barbershops
      ADD CONSTRAINT check_barbershops_payment_method
      CHECK (payment_method IN ('card', 'pix', 'boleto'));
  END IF;
END
$$;

UPDATE barbershops
SET stripe_payment_mode = 'subscription'
WHERE stripe_payment_mode IS NULL
  AND stripe_subscription_id IS NOT NULL;

UPDATE barbershops
SET payment_method = 'card'
WHERE payment_method IS NULL
  AND stripe_payment_mode = 'subscription';

CREATE INDEX IF NOT EXISTS idx_barbershops_stripe_payment_mode
  ON barbershops(stripe_payment_mode);

COMMIT;
