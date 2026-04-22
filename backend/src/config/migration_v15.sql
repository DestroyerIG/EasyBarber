-- Migration v15: vinculo de instancia WhatsApp por barbearia (multi-tenant)
-- Run after migration_v14.sql

BEGIN;

ALTER TABLE barbershops
  ADD COLUMN IF NOT EXISTS whatsapp_instance_name VARCHAR(255);

UPDATE barbershops
SET whatsapp_instance_name = NULLIF(lower(btrim(whatsapp_instance_name)), '')
WHERE whatsapp_instance_name IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_barbershops_whatsapp_instance_name_norm
  ON barbershops ((lower(btrim(whatsapp_instance_name))))
  WHERE NULLIF(btrim(whatsapp_instance_name), '') IS NOT NULL;

COMMIT;
