-- RenameColumn: welcome_message -> welcome_header
ALTER TABLE "whatsapp_bot_config" RENAME COLUMN "welcome_message" TO "welcome_header";

-- AddColumns: missing bot config fields
ALTER TABLE "whatsapp_bot_config" ADD COLUMN IF NOT EXISTS "end_session_message" TEXT;
ALTER TABLE "whatsapp_bot_config" ADD COLUMN IF NOT EXISTS "name_validation_message" TEXT;
ALTER TABLE "whatsapp_bot_config" ADD COLUMN IF NOT EXISTS "no_slots_message" TEXT;
ALTER TABLE "whatsapp_bot_config" ADD COLUMN IF NOT EXISTS "cancel_no_appointments_message" TEXT;
ALTER TABLE "whatsapp_bot_config" ADD COLUMN IF NOT EXISTS "cancel_list_message" TEXT;
ALTER TABLE "whatsapp_bot_config" ADD COLUMN IF NOT EXISTS "cancel_success_message" TEXT;
ALTER TABLE "whatsapp_bot_config" ADD COLUMN IF NOT EXISTS "reschedule_no_appointments_message" TEXT;
ALTER TABLE "whatsapp_bot_config" ADD COLUMN IF NOT EXISTS "reschedule_list_message" TEXT;
ALTER TABLE "whatsapp_bot_config" ADD COLUMN IF NOT EXISTS "no_previous_appointments_message" TEXT;
ALTER TABLE "whatsapp_bot_config" ADD COLUMN IF NOT EXISTS "rating_question_message" TEXT;
ALTER TABLE "whatsapp_bot_config" ADD COLUMN IF NOT EXISTS "rating_confirmation_message" TEXT;
ALTER TABLE "whatsapp_bot_config" ADD COLUMN IF NOT EXISTS "promotions_message" TEXT;
ALTER TABLE "whatsapp_bot_config" ADD COLUMN IF NOT EXISTS "instagram_message" TEXT;
