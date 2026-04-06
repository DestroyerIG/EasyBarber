-- Migration v8: barbershop settings
-- Run after migration_v7.sql

CREATE TABLE IF NOT EXISTS barbershop_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID NOT NULL UNIQUE REFERENCES barbershops(id) ON DELETE CASCADE,
  contact_phone VARCHAR(30),
  address VARCHAR(255),
  opening_time TIME NOT NULL DEFAULT '09:00:00',
  closing_time TIME NOT NULL DEFAULT '20:00:00',
  slot_interval_minutes INTEGER NOT NULL DEFAULT 30
    CHECK (slot_interval_minutes IN (15, 20, 30, 45, 60)),
  allow_walkins BOOLEAN NOT NULL DEFAULT true,
  auto_confirm_appointments BOOLEAN NOT NULL DEFAULT false,
  email_reminders BOOLEAN NOT NULL DEFAULT true,
  whatsapp_reminders BOOLEAN NOT NULL DEFAULT true,
  google_calendar_enabled BOOLEAN NOT NULL DEFAULT false,
  custom_webhook_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (closing_time > opening_time)
);

CREATE INDEX IF NOT EXISTS idx_barbershop_settings_barbershop_id
  ON barbershop_settings(barbershop_id);

DROP TRIGGER IF EXISTS trigger_updated_at ON barbershop_settings;
CREATE TRIGGER trigger_updated_at
  BEFORE UPDATE ON barbershop_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
