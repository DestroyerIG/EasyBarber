-- Armazena customer do Asaas separadamente para permitir reuso no fluxo Pix.
ALTER TABLE barbershops
  ADD COLUMN IF NOT EXISTS asaas_customer_id VARCHAR(255);

-- Backfill inicial para contas já migradas para Asaas/Pix.
UPDATE barbershops
SET asaas_customer_id = provider_customer_id
WHERE asaas_customer_id IS NULL
  AND provider_customer_id IS NOT NULL
  AND (
    provider = 'asaas'
    OR payment_method = 'pix'
  );

CREATE INDEX IF NOT EXISTS idx_barbershops_asaas_customer
  ON barbershops(asaas_customer_id);
