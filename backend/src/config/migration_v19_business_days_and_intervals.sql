ALTER TABLE barbershop_settings
  ADD COLUMN IF NOT EXISTS dias_abertos TEXT[] NOT NULL DEFAULT ARRAY['seg','ter','qua','qui','sex']::TEXT[];

ALTER TABLE barbershop_settings
  DROP CONSTRAINT IF EXISTS barbershop_settings_slot_interval_minutes_check;

ALTER TABLE barbershop_settings
  ADD CONSTRAINT barbershop_settings_slot_interval_minutes_check
  CHECK (slot_interval_minutes IN (0, 15, 20, 30, 45, 60, 90, 120));

ALTER TABLE barbershop_settings
  DROP CONSTRAINT IF EXISTS barbershop_settings_dias_abertos_check;

ALTER TABLE barbershop_settings
  ADD CONSTRAINT barbershop_settings_dias_abertos_check
  CHECK (
    dias_abertos <@ ARRAY['seg','ter','qua','qui','sex','sab','dom']::TEXT[]
    AND cardinality(dias_abertos) > 0
  );
