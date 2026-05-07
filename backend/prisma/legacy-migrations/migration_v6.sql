-- Migration v6: Admin RBAC roles, account blocking and audit logs
-- Run after migration_v5.sql

BEGIN;

-- 1) Expand users role model
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_role;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- Convert legacy roles before enforcing new constraint
UPDATE users SET role = 'tenant_admin' WHERE role = 'admin';
UPDATE users SET role = 'employee' WHERE role = 'barber';
UPDATE users
SET role = 'tenant_admin'
WHERE role NOT IN ('platform_admin', 'tenant_admin', 'employee');

ALTER TABLE users ALTER COLUMN role SET DEFAULT 'tenant_admin';
ALTER TABLE users
  ADD CONSTRAINT chk_users_role
  CHECK (role IN ('platform_admin', 'tenant_admin', 'employee'));

-- 2) User-level blocking
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_reason VARCHAR(255);

-- 3) Tenant-level suspension metadata
ALTER TABLE barbershops ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP;
ALTER TABLE barbershops ADD COLUMN IF NOT EXISTS suspended_reason VARCHAR(255);

-- 4) Admin audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type VARCHAR(50) NOT NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_barbershop_id UUID REFERENCES barbershops(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_barbershop_id UUID REFERENCES barbershops(id) ON DELETE SET NULL,
  resource_type VARCHAR(50),
  resource_id UUID,
  details JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5) Query performance indexes
CREATE INDEX IF NOT EXISTS idx_users_email_not_blocked
  ON users(email)
  WHERE blocked = false;

CREATE INDEX IF NOT EXISTS idx_users_barbershop_blocked
  ON users(barbershop_id, blocked);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user
  ON audit_logs(actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_target_user
  ON audit_logs(target_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type
  ON audit_logs(action_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON audit_logs(created_at DESC);

COMMIT;
