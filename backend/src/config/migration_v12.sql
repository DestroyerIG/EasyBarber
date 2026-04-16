-- Migration v12: Billing híbrido Stripe + Asaas (provider-agnostic)
-- Run after migration_v11.sql

BEGIN;

ALTER TABLE barbershops
  ADD COLUMN IF NOT EXISTS provider VARCHAR(20),
  ADD COLUMN IF NOT EXISTS provider_customer_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS provider_subscription_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS provider_payment_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMP,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMP,
  ADD COLUMN IF NOT EXISTS next_due_date TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_payment_date TIMESTAMP,
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS metadata JSONB;

UPDATE barbershops
SET metadata = '{}'::jsonb
WHERE metadata IS NULL;

ALTER TABLE barbershops
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'check_barbershops_provider'
  ) THEN
    ALTER TABLE barbershops
      ADD CONSTRAINT check_barbershops_provider
      CHECK (provider IN ('stripe', 'asaas'));
  END IF;
END
$$;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'barbershops'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%subscription_status%'
  LOOP
    EXECUTE format('ALTER TABLE barbershops DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END LOOP;

  ALTER TABLE barbershops
    ADD CONSTRAINT check_subscription_status
    CHECK (subscription_status IN ('active', 'trialing', 'pending', 'past_due', 'unpaid', 'canceled', 'incomplete'));
END
$$;

UPDATE barbershops
SET provider = 'stripe'
WHERE provider IS NULL
  AND (
    stripe_customer_id IS NOT NULL
    OR stripe_subscription_id IS NOT NULL
    OR stripe_payment_mode IS NOT NULL
  );

UPDATE barbershops
SET provider_customer_id = stripe_customer_id
WHERE provider_customer_id IS NULL
  AND stripe_customer_id IS NOT NULL;

UPDATE barbershops
SET provider_subscription_id = stripe_subscription_id
WHERE provider_subscription_id IS NULL
  AND stripe_subscription_id IS NOT NULL;

UPDATE barbershops
SET current_period_start = subscription_current_period_start
WHERE current_period_start IS NULL
  AND subscription_current_period_start IS NOT NULL;

UPDATE barbershops
SET current_period_end = subscription_current_period_end
WHERE current_period_end IS NULL
  AND subscription_current_period_end IS NOT NULL;

UPDATE barbershops
SET next_due_date = subscription_current_period_end
WHERE next_due_date IS NULL
  AND subscription_current_period_end IS NOT NULL;

CREATE TABLE IF NOT EXISTS billing_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(20) NOT NULL CHECK (provider IN ('stripe', 'asaas')),
  event_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(255) NOT NULL,
  barbershop_id UUID REFERENCES barbershops(id) ON DELETE SET NULL,
  payload JSONB,
  processed_at TIMESTAMP,
  status VARCHAR(20) NOT NULL DEFAULT 'processed' CHECK (status IN ('processed', 'ignored', 'failed')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (provider, event_id)
);

CREATE TABLE IF NOT EXISTS billing_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL CHECK (provider IN ('stripe', 'asaas')),
  provider_payment_id VARCHAR(255) NOT NULL,
  provider_subscription_id VARCHAR(255),
  payment_method VARCHAR(20) CHECK (payment_method IN ('card', 'pix', 'boleto')),
  external_status VARCHAR(60),
  internal_status VARCHAR(50) CHECK (internal_status IN ('active', 'trialing', 'pending', 'past_due', 'unpaid', 'canceled', 'incomplete')),
  amount NUMERIC(10,2),
  due_date TIMESTAMP,
  paid_at TIMESTAMP,
  pix_copy_paste TEXT,
  qr_code TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (provider, provider_payment_id)
);

CREATE INDEX IF NOT EXISTS idx_barbershops_provider
  ON barbershops(provider);

CREATE INDEX IF NOT EXISTS idx_barbershops_provider_customer
  ON barbershops(provider_customer_id);

CREATE INDEX IF NOT EXISTS idx_barbershops_provider_subscription
  ON barbershops(provider_subscription_id);

CREATE INDEX IF NOT EXISTS idx_barbershops_provider_payment
  ON barbershops(provider_payment_id);

CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_provider_event
  ON billing_webhook_events(provider, event_id);

CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_created_at
  ON billing_webhook_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_payments_barbershop
  ON billing_payments(barbershop_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_payments_subscription
  ON billing_payments(provider_subscription_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'update_updated_at_column'
  ) THEN
    DROP TRIGGER IF EXISTS trigger_billing_payments_updated_at ON billing_payments;

    CREATE TRIGGER trigger_billing_payments_updated_at
      BEFORE UPDATE ON billing_payments
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END
$$;

COMMIT;
