-- Migration v5: Stripe subscription billing
-- Run after migration_v4.sql

ALTER TABLE barbershops
  ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS stripe_price_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS subscription_current_period_start TIMESTAMP,
  ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMP,
  ADD COLUMN IF NOT EXISTS subscription_cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subscription_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  ALTER TABLE barbershops
    ADD CONSTRAINT check_subscription_status
    CHECK (subscription_status IN ('active', 'trialing', 'past_due', 'canceled', 'incomplete'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE barbershops
    ADD CONSTRAINT uq_barbershops_stripe_customer UNIQUE (stripe_customer_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE barbershops
    ADD CONSTRAINT uq_barbershops_stripe_subscription UNIQUE (stripe_subscription_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id VARCHAR(255) NOT NULL UNIQUE,
  event_type VARCHAR(255) NOT NULL,
  barbershop_id UUID REFERENCES barbershops(id) ON DELETE SET NULL,
  payload JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_barbershops_subscription_status
  ON barbershops(subscription_status);

CREATE INDEX IF NOT EXISTS idx_barbershops_stripe_customer
  ON barbershops(stripe_customer_id);

CREATE INDEX IF NOT EXISTS idx_subscription_events_created_at
  ON subscription_events(created_at DESC);
