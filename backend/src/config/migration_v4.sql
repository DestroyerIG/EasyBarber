-- Migration v4: Performance indexes and constraints
-- Run after migration_v3.sql

-- Composite indexes for common query patterns

-- Appointments: filtered by barbershop + date + status on every listing
CREATE INDEX IF NOT EXISTS idx_appointments_barbershop_date_status
  ON appointments (barbershop_id, date, status);

-- Appointments: conflict detection query (same barber, same date/time)
CREATE INDEX IF NOT EXISTS idx_appointments_conflict_check
  ON appointments (barbershop_id, barber_id, date, time)
  WHERE status != 'cancelado';

-- Earnings: dashboard + finance summary queries
CREATE INDEX IF NOT EXISTS idx_earnings_barbershop_date
  ON earnings (barbershop_id, date);

-- Expenses: finance summary + listing queries
CREATE INDEX IF NOT EXISTS idx_expenses_barbershop_date
  ON expenses (barbershop_id, date);

-- Clients: lookup by phone for WhatsApp bot
CREATE INDEX IF NOT EXISTS idx_clients_barbershop_phone
  ON clients (barbershop_id, phone);

-- WhatsApp sessions: bot session lookup
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_phone_barbershop
  ON whatsapp_sessions (phone, barbershop_id);

-- Refresh tokens: lookup by hash for token validation
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash_active
  ON refresh_tokens (token_hash)
  WHERE revoked_at IS NULL;

-- Users: login lookup by email
CREATE INDEX IF NOT EXISTS idx_users_email
  ON users (email);
