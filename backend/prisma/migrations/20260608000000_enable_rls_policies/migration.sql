-- Enable Row Level Security on all tables and create tenant-scoped access policies.
--
-- Architecture:
--   - Backend (Prisma) connects as `postgres` superuser → bypasses RLS automatically.
--   - These policies apply only to the `authenticated` Supabase role (direct client access).
--   - `anon` role gets no access (RLS with no policy = deny all).
--   - `pending_registrations` and `refresh_tokens`: RLS enabled, no policy = deny all.
--
-- The helper function `public.current_barbershop_id()` resolves the caller's
-- barbershop from the Supabase JWT uid → users.supabase_user_id lookup.

-- ─── Helper function ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.current_barbershop_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT barbershop_id
  FROM public.users
  WHERE supabase_user_id = auth.uid()
  LIMIT 1
$$;

-- ─── Enable RLS ───────────────────────────────────────────────────────────────

ALTER TABLE public.barbershops              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refresh_tokens           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barbers                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.earnings                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_webhook_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_payments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_bot_config      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_ratings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barbershop_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_menu_options    ENABLE ROW LEVEL SECURITY;

-- pending_registrations is a raw-SQL table (no Prisma model); guard with IF EXISTS
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'pending_registrations'
  ) THEN
    EXECUTE 'ALTER TABLE public.pending_registrations ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- ─── barbershops ──────────────────────────────────────────────────────────────
-- Tenant can read and update only their own barbershop row.
-- INSERT/DELETE managed exclusively by backend.

DROP POLICY IF EXISTS "tenant_select_barbershop" ON public.barbershops;
CREATE POLICY "tenant_select_barbershop"
  ON public.barbershops FOR SELECT
  TO authenticated
  USING (id = public.current_barbershop_id());

DROP POLICY IF EXISTS "tenant_update_barbershop" ON public.barbershops;
CREATE POLICY "tenant_update_barbershop"
  ON public.barbershops FOR UPDATE
  TO authenticated
  USING  (id = public.current_barbershop_id())
  WITH CHECK (id = public.current_barbershop_id());

-- ─── users ────────────────────────────────────────────────────────────────────
-- Tenant can read all users of their barbershop.
-- UPDATE restricted to the caller's own row only.

DROP POLICY IF EXISTS "tenant_select_users" ON public.users;
CREATE POLICY "tenant_select_users"
  ON public.users FOR SELECT
  TO authenticated
  USING (barbershop_id = public.current_barbershop_id());

DROP POLICY IF EXISTS "tenant_update_own_user" ON public.users;
CREATE POLICY "tenant_update_own_user"
  ON public.users FOR UPDATE
  TO authenticated
  USING  (supabase_user_id = auth.uid())
  WITH CHECK (supabase_user_id = auth.uid());

-- refresh_tokens: no policy → deny all for authenticated/anon roles

-- ─── barbers ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_all_barbers" ON public.barbers;
CREATE POLICY "tenant_all_barbers"
  ON public.barbers FOR ALL
  TO authenticated
  USING  (barbershop_id = public.current_barbershop_id())
  WITH CHECK (barbershop_id = public.current_barbershop_id());

-- ─── services ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_all_services" ON public.services;
CREATE POLICY "tenant_all_services"
  ON public.services FOR ALL
  TO authenticated
  USING  (barbershop_id = public.current_barbershop_id())
  WITH CHECK (barbershop_id = public.current_barbershop_id());

-- ─── clients ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_all_clients" ON public.clients;
CREATE POLICY "tenant_all_clients"
  ON public.clients FOR ALL
  TO authenticated
  USING  (barbershop_id = public.current_barbershop_id())
  WITH CHECK (barbershop_id = public.current_barbershop_id());

-- ─── appointments ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_all_appointments" ON public.appointments;
CREATE POLICY "tenant_all_appointments"
  ON public.appointments FOR ALL
  TO authenticated
  USING  (barbershop_id = public.current_barbershop_id())
  WITH CHECK (barbershop_id = public.current_barbershop_id());

-- ─── earnings ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_all_earnings" ON public.earnings;
CREATE POLICY "tenant_all_earnings"
  ON public.earnings FOR ALL
  TO authenticated
  USING  (barbershop_id = public.current_barbershop_id())
  WITH CHECK (barbershop_id = public.current_barbershop_id());

-- ─── expenses ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_all_expenses" ON public.expenses;
CREATE POLICY "tenant_all_expenses"
  ON public.expenses FOR ALL
  TO authenticated
  USING  (barbershop_id = public.current_barbershop_id())
  WITH CHECK (barbershop_id = public.current_barbershop_id());

-- ─── subscription_events ─────────────────────────────────────────────────────
-- Read-only; written by billing webhooks via service role.

DROP POLICY IF EXISTS "tenant_select_subscription_events" ON public.subscription_events;
CREATE POLICY "tenant_select_subscription_events"
  ON public.subscription_events FOR SELECT
  TO authenticated
  USING (barbershop_id = public.current_barbershop_id());

-- ─── billing_webhook_events ──────────────────────────────────────────────────
-- Read-only; written by billing webhooks via service role.

DROP POLICY IF EXISTS "tenant_select_billing_webhook_events" ON public.billing_webhook_events;
CREATE POLICY "tenant_select_billing_webhook_events"
  ON public.billing_webhook_events FOR SELECT
  TO authenticated
  USING (barbershop_id = public.current_barbershop_id());

-- ─── billing_payments ────────────────────────────────────────────────────────
-- Read-only; written by billing webhooks via service role.

DROP POLICY IF EXISTS "tenant_select_billing_payments" ON public.billing_payments;
CREATE POLICY "tenant_select_billing_payments"
  ON public.billing_payments FOR SELECT
  TO authenticated
  USING (barbershop_id = public.current_barbershop_id());

-- ─── coupons ─────────────────────────────────────────────────────────────────
-- No barbershop_id; authenticated users may read active coupons for checkout validation.
-- Write operations managed by admin via service role.

DROP POLICY IF EXISTS "authenticated_select_active_coupons" ON public.coupons;
CREATE POLICY "authenticated_select_active_coupons"
  ON public.coupons FOR SELECT
  TO authenticated
  USING (active = true);

-- ─── audit_logs ──────────────────────────────────────────────────────────────
-- Read-only; tenant sees logs where their barbershop is actor or target.

DROP POLICY IF EXISTS "tenant_select_audit_logs" ON public.audit_logs;
CREATE POLICY "tenant_select_audit_logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (
    actor_barbershop_id  = public.current_barbershop_id()
    OR target_barbershop_id = public.current_barbershop_id()
  );

-- ─── whatsapp_sessions ───────────────────────────────────────────────────────
-- Read-only for tenant; bot writes via service role.

DROP POLICY IF EXISTS "tenant_select_whatsapp_sessions" ON public.whatsapp_sessions;
CREATE POLICY "tenant_select_whatsapp_sessions"
  ON public.whatsapp_sessions FOR SELECT
  TO authenticated
  USING (barbershop_id = public.current_barbershop_id());

-- ─── whatsapp_bot_config ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_all_whatsapp_bot_config" ON public.whatsapp_bot_config;
CREATE POLICY "tenant_all_whatsapp_bot_config"
  ON public.whatsapp_bot_config FOR ALL
  TO authenticated
  USING  (barbershop_id = public.current_barbershop_id())
  WITH CHECK (barbershop_id = public.current_barbershop_id());

-- ─── whatsapp_ratings ────────────────────────────────────────────────────────
-- Read-only for tenant; written by WhatsApp bot via service role.

DROP POLICY IF EXISTS "tenant_select_whatsapp_ratings" ON public.whatsapp_ratings;
CREATE POLICY "tenant_select_whatsapp_ratings"
  ON public.whatsapp_ratings FOR SELECT
  TO authenticated
  USING (barbershop_id = public.current_barbershop_id());

-- ─── barbershop_settings ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_all_barbershop_settings" ON public.barbershop_settings;
CREATE POLICY "tenant_all_barbershop_settings"
  ON public.barbershop_settings FOR ALL
  TO authenticated
  USING  (barbershop_id = public.current_barbershop_id())
  WITH CHECK (barbershop_id = public.current_barbershop_id());

-- ─── whatsapp_menu_options ───────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_all_whatsapp_menu_options" ON public.whatsapp_menu_options;
CREATE POLICY "tenant_all_whatsapp_menu_options"
  ON public.whatsapp_menu_options FOR ALL
  TO authenticated
  USING  (barbershop_id = public.current_barbershop_id())
  WITH CHECK (barbershop_id = public.current_barbershop_id());

-- pending_registrations: no policy → deny all (pre-auth table, no barbershop_id)
