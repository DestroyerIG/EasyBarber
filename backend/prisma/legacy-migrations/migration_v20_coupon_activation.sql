DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'check_barbershops_provider'
  ) THEN
    ALTER TABLE barbershops DROP CONSTRAINT check_barbershops_provider;
  END IF;

  ALTER TABLE barbershops
    ADD CONSTRAINT check_barbershops_provider
    CHECK (provider IN ('stripe', 'asaas', 'coupon'));
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'check_barbershops_payment_method'
  ) THEN
    ALTER TABLE barbershops DROP CONSTRAINT check_barbershops_payment_method;
  END IF;

  ALTER TABLE barbershops
    ADD CONSTRAINT check_barbershops_payment_method
    CHECK (payment_method IN ('card', 'pix', 'boleto', 'coupon'));
END
$$;
