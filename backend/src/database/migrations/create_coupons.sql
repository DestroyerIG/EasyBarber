CREATE TABLE IF NOT EXISTS coupons (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           VARCHAR(50) UNIQUE NOT NULL,
  description    VARCHAR(255),
  discount_type  VARCHAR(10) NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value NUMERIC(10,2) NOT NULL CHECK (discount_value > 0),
  max_uses       INT DEFAULT NULL,
  current_uses   INT DEFAULT 0,
  valid_until    TIMESTAMPTZ DEFAULT NULL,
  active         BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
