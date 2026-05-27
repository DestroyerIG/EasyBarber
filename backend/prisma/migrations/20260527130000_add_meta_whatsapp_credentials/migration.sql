-- AlterTable: Meta WhatsApp Cloud API per-barbershop credentials
ALTER TABLE "barbershops" ADD COLUMN "whatsapp_phone_number_id" VARCHAR(64);
ALTER TABLE "barbershops" ADD COLUMN "whatsapp_waba_id" VARCHAR(64);
ALTER TABLE "barbershops" ADD COLUMN "whatsapp_access_token" TEXT;

-- Lookup index for routing inbound webhooks by phone_number_id → barbershop
CREATE INDEX "barbershops_whatsapp_phone_number_id_idx" ON "barbershops" ("whatsapp_phone_number_id");
