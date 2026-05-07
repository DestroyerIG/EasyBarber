-- Migration v2: Security & Schema improvements
-- Corrigida para o modelo atual de roles:
-- platform_admin, tenant_admin, employee

BEGIN;

-- 1. Add CHECK constraints to existing columns

ALTER TABLE barbershops DROP CONSTRAINT IF EXISTS chk_barbershops_plan;
ALTER TABLE barbershops
ADD CONSTRAINT chk_barbershops_plan
CHECK (plan IN ('basico', 'profissional', 'premium'));

-- USERS.ROLE
-- Ajusta valores legados antes de recriar o constraint
UPDATE users
SET role = 'tenant_admin'
WHERE role = 'admin';

UPDATE users
SET role = 'employee'
WHERE role = 'barber';

ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_role;
ALTER TABLE users
ADD CONSTRAINT chk_users_role
CHECK (role IN ('platform_admin', 'tenant_admin', 'employee')) NOT VALID;

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS chk_appointments_status;
ALTER TABLE appointments
ADD CONSTRAINT chk_appointments_status
CHECK (status IN ('confirmado', 'concluido', 'cancelado'));

ALTER TABLE services DROP CONSTRAINT IF EXISTS chk_services_price;
ALTER TABLE services
ADD CONSTRAINT chk_services_price
CHECK (price > 0);

ALTER TABLE services DROP CONSTRAINT IF EXISTS chk_services_duration;
ALTER TABLE services
ADD CONSTRAINT chk_services_duration
CHECK (duration_minutes >= 10 AND duration_minutes <= 300);

ALTER TABLE earnings DROP CONSTRAINT IF EXISTS chk_earnings_amount;
ALTER TABLE earnings
ADD CONSTRAINT chk_earnings_amount
CHECK (amount > 0);

ALTER TABLE expenses DROP CONSTRAINT IF EXISTS chk_expenses_amount;
ALTER TABLE expenses
ADD CONSTRAINT chk_expenses_amount
CHECK (amount > 0);

-- Valida depois de normalizar os dados
ALTER TABLE users VALIDATE CONSTRAINT chk_users_role;

-- 2. Add updated_at columns where missing
ALTER TABLE barbershops ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE services ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- 3. Create refresh_tokens table
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Add UNIQUE on earnings.appointment_id (prevent duplicates)
ALTER TABLE earnings DROP CONSTRAINT IF EXISTS earnings_appointment_id_key;
ALTER TABLE earnings ADD CONSTRAINT earnings_appointment_id_key UNIQUE (appointment_id);

-- 5. Add UNIQUE on clients(barbershop_id, phone)
-- Pode falhar se existirem duplicados; limpe antes se necessário
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'clients_barbershop_id_phone_key'
    ) THEN
        ALTER TABLE clients
        ADD CONSTRAINT clients_barbershop_id_phone_key UNIQUE (barbershop_id, phone);
    END IF;
END;
$$;

-- 6. Improve indexes (drop old single-column, add composite)
DROP INDEX IF EXISTS idx_appointments_date;
DROP INDEX IF EXISTS idx_appointments_barbershop;
DROP INDEX IF EXISTS idx_earnings_date;
DROP INDEX IF EXISTS idx_expenses_date;

CREATE INDEX IF NOT EXISTS idx_appointments_barbershop_date
ON appointments(barbershop_id, date);

CREATE INDEX IF NOT EXISTS idx_appointments_barber_date
ON appointments(barber_id, date);

CREATE INDEX IF NOT EXISTS idx_appointments_status
ON appointments(status)
WHERE status = 'confirmado';

CREATE INDEX IF NOT EXISTS idx_clients_barbershop
ON clients(barbershop_id);

CREATE INDEX IF NOT EXISTS idx_earnings_barbershop_date
ON earnings(barbershop_id, date);

CREATE INDEX IF NOT EXISTS idx_expenses_barbershop_date
ON expenses(barbershop_id, date);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash
ON refresh_tokens(token_hash)
WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user
ON refresh_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_barbers_barbershop_active
ON barbers(barbershop_id)
WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_services_barbershop_active
ON services(barbershop_id)
WHERE active = true;

-- 7. Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN
        SELECT unnest(ARRAY[
            'barbershops',
            'users',
            'barbers',
            'services',
            'clients',
            'appointments',
            'expenses'
        ])
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS trigger_updated_at ON %I;
            CREATE TRIGGER trigger_updated_at
            BEFORE UPDATE ON %I
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
        ', t, t);
    END LOOP;
END;
$$;

-- 8. Change password_hash column to CHAR(60) for bcrypt
ALTER TABLE users
ALTER COLUMN password_hash TYPE CHAR(60);

COMMIT;