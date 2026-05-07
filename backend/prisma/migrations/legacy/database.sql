-- Criação das tabelas do banco de dados

-- Tabela de barbearias
CREATE TABLE IF NOT EXISTS barbershops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    owner_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    whatsapp VARCHAR(20) NOT NULL,
    whatsapp_instance_name VARCHAR(255),
    cpf_cnpj VARCHAR(20),
    plan VARCHAR(50) NOT NULL DEFAULT 'basico'
        CHECK (plan IN ('basico', 'profissional', 'premium')),
    desired_plan VARCHAR(50) NOT NULL DEFAULT 'basico'
        CHECK (desired_plan IN ('basico', 'profissional', 'premium')),
    stripe_customer_id VARCHAR(255) UNIQUE,
    stripe_subscription_id VARCHAR(255) UNIQUE,
    stripe_price_id VARCHAR(255),
    stripe_payment_mode VARCHAR(20),
    provider VARCHAR(20),
    asaas_customer_id VARCHAR(255),
    provider_customer_id VARCHAR(255),
    provider_subscription_id VARCHAR(255),
    provider_payment_id VARCHAR(255),
    payment_method VARCHAR(20),
    CONSTRAINT check_barbershops_stripe_payment_mode
        CHECK (stripe_payment_mode IN ('subscription', 'payment')),
    CONSTRAINT check_barbershops_provider
        CHECK (provider IN ('stripe', 'asaas', 'coupon')),
    CONSTRAINT check_barbershops_payment_method
        CHECK (payment_method IN ('card', 'pix', 'boleto', 'coupon')),
    subscription_status VARCHAR(50) NOT NULL DEFAULT 'incomplete'
        CHECK (subscription_status IN ('active', 'trialing', 'pending', 'past_due', 'unpaid', 'canceled', 'incomplete')),
    subscription_current_period_start TIMESTAMP,
    subscription_current_period_end TIMESTAMP,
    subscription_cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
    current_period_start TIMESTAMP,
    current_period_end TIMESTAMP,
    next_due_date TIMESTAMP,
    last_payment_date TIMESTAMP,
    canceled_at TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb,
    subscription_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    instagram_handle VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    suspended_at TIMESTAMP,
    suspended_reason VARCHAR(255),
    active BOOLEAN DEFAULT true
);

-- Tabela de usuários (login)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash CHAR(60) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'tenant_admin'
        CHECK (role IN ('platform_admin', 'tenant_admin', 'employee')),
    blocked BOOLEAN NOT NULL DEFAULT false,
    email_verified BOOLEAN NOT NULL DEFAULT false,
    email_verification_token_hash CHAR(64),
    email_verification_expires_at TIMESTAMP,
    email_verified_at TIMESTAMP,
    verification_sent_at TIMESTAMP,
    blocked_at TIMESTAMP,
    blocked_reason VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de refresh tokens (rotação segura)
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de barbeiros
CREATE TABLE IF NOT EXISTS barbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    photo TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de serviços
CREATE TABLE IF NOT EXISTS services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10, 2) NOT NULL CHECK (price > 0),
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes >= 10 AND duration_minutes <= 300),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de clientes
CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    birth_date DATE,
    address TEXT,
    notes TEXT,
    last_visit DATE,
    total_spent DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (barbershop_id, phone)
);

-- Tabela de agendamentos
CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    barber_id UUID NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    time TIME NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'confirmado'
        CHECK (status IN ('confirmado', 'concluido', 'cancelado')),
    reminder_sent BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de ganhos
CREATE TABLE IF NOT EXISTS earnings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
    appointment_id UUID UNIQUE REFERENCES appointments(id) ON DELETE SET NULL,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
    date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de gastos
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
    description VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
    date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de auditoria de eventos da assinatura
CREATE TABLE IF NOT EXISTS subscription_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_event_id VARCHAR(255) NOT NULL UNIQUE,
    event_type VARCHAR(255) NOT NULL,
    barbershop_id UUID REFERENCES barbershops(id) ON DELETE SET NULL,
    payload JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de idempotência para eventos de webhook de billing (multi-provider)
CREATE TABLE IF NOT EXISTS billing_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(20) NOT NULL CHECK (provider IN ('stripe', 'asaas')),
    event_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(255) NOT NULL,
    barbershop_id UUID REFERENCES barbershops(id) ON DELETE SET NULL,
    payload JSONB,
    processed_at TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'processed' CHECK (status IN ('processed', 'ignored', 'failed')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (provider, event_id)
);

-- Tabela de snapshots de pagamentos/cobranças
CREATE TABLE IF NOT EXISTS billing_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL CHECK (provider IN ('stripe', 'asaas')),
    provider_payment_id VARCHAR(255) NOT NULL,
    provider_subscription_id VARCHAR(255),
    payment_method VARCHAR(20) CHECK (payment_method IN ('card', 'pix', 'boleto')),
    external_status VARCHAR(60),
    internal_status VARCHAR(50) CHECK (internal_status IN ('active', 'trialing', 'pending', 'past_due', 'unpaid', 'canceled', 'incomplete')),
    amount NUMERIC(10,2),
    due_date TIMESTAMP,
    paid_at TIMESTAMP,
    pix_copy_paste TEXT,
    qr_code TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (provider, provider_payment_id)
);

-- Tabela de auditoria de ações administrativas
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

-- Tabela para controlar sessões do bot WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(20) NOT NULL,
    barbershop_id UUID NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
    step VARCHAR(50) NOT NULL,
    data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de configuração do bot WhatsApp (mensagens personalizáveis)
CREATE TABLE IF NOT EXISTS whatsapp_bot_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID NOT NULL UNIQUE REFERENCES barbershops(id) ON DELETE CASCADE,
    welcome_message TEXT DEFAULT 'Olá 👋 Bem-vindo à {nome_barbearia}!

Me chame de *EasyBarber Bot* 🤖 e estou aqui para agilizar seu atendimento.

Como posso ajudar hoje?

1️⃣ *Agendar um horário*
2️⃣ Ver nossos serviços
3️⃣ Cancelar agendamento via bot
4️⃣ Reagendamento via bot
5️⃣ Avaliação pós-atendimento
6️⃣ Promoções automáticas
7️⃣ Integração com Instagram
8️⃣ Falar com um humano 👨‍💼
9️⃣ Encerrar atendimento',
    ask_name_message TEXT DEFAULT 'Vejo que é sua primeira vez aqui! 😊

Qual o seu *nome completo*?',
    attendant_message TEXT DEFAULT 'Um atendente entrará em contato em breve! 👨‍💼',
    confirmation_message TEXT DEFAULT '✅ Seu horário foi agendado com sucesso! 💈

📋 Serviço: {servico}
👨‍🦱 Barbeiro: {barbeiro}
📅 Data: {data}
⏰ Horário: {horario}
💰 Valor: R$ {valor}

Até lá! 👋',
    reminder_message TEXT DEFAULT '⏰ Lembrete!

Olá {nome_cliente}!

Seu horário é daqui a 2 horas:
📋 {servico}
👨‍🦱 Barbeiro: {barbeiro}
⏰ {horario}

Te esperamos! 💈',
    invalid_option_message TEXT DEFAULT 'Opção inválida. Por favor, escolha um número da lista.',
    session_expired_message TEXT DEFAULT '⏰ Sua sessão expirou por inatividade.

Digite qualquer coisa para começar novamente.',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de avaliações pós-atendimento via WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
    appointment_id UUID NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 4),
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de configurações da barbearia
CREATE TABLE IF NOT EXISTS barbershop_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID NOT NULL UNIQUE REFERENCES barbershops(id) ON DELETE CASCADE,
    contact_phone VARCHAR(30),
    address VARCHAR(255),
    opening_time TIME NOT NULL DEFAULT '09:00:00',
    closing_time TIME NOT NULL DEFAULT '20:00:00',
    slot_interval_minutes INTEGER NOT NULL DEFAULT 30
        CHECK (slot_interval_minutes IN (0, 15, 20, 30, 45, 60, 90, 120)),
    dias_abertos TEXT[] NOT NULL DEFAULT ARRAY['seg','ter','qua','qui','sex']::TEXT[]
        CHECK (dias_abertos <@ ARRAY['seg','ter','qua','qui','sex','sab','dom']::TEXT[] AND cardinality(dias_abertos) > 0),
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

-- Índices para melhorar performance

-- Appointments: busca por barbearia + data (query mais frequente)
CREATE INDEX IF NOT EXISTS idx_appointments_barbershop_date ON appointments(barbershop_id, date);
CREATE INDEX IF NOT EXISTS idx_appointments_barber_date ON appointments(barber_id, date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status) WHERE status = 'confirmado';

-- Clients: busca por telefone dentro da barbearia
CREATE INDEX IF NOT EXISTS idx_clients_barbershop ON clients(barbershop_id);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);

-- Earnings/Expenses: relatórios financeiros por período
CREATE INDEX IF NOT EXISTS idx_earnings_barbershop_date ON earnings(barbershop_id, date);
CREATE INDEX IF NOT EXISTS idx_expenses_barbershop_date ON expenses(barbershop_id, date);

-- Refresh tokens: busca por hash e limpeza de expirados
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_users_email_not_blocked ON users(email) WHERE blocked = false;
CREATE INDEX IF NOT EXISTS idx_users_barbershop_blocked ON users(barbershop_id, blocked);
CREATE INDEX IF NOT EXISTS idx_users_email_verification_token_hash ON users(email_verification_token_hash) WHERE email_verification_token_hash IS NOT NULL;

-- Stripe billing
CREATE INDEX IF NOT EXISTS idx_barbershops_subscription_status ON barbershops(subscription_status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_barbershops_whatsapp_instance_name_norm
    ON barbershops ((lower(btrim(whatsapp_instance_name))))
    WHERE NULLIF(btrim(whatsapp_instance_name), '') IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_barbershops_stripe_customer ON barbershops(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_created_at ON subscription_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_barbershops_provider ON barbershops(provider);
CREATE INDEX IF NOT EXISTS idx_barbershops_asaas_customer ON barbershops(asaas_customer_id);
CREATE INDEX IF NOT EXISTS idx_barbershops_provider_customer ON barbershops(provider_customer_id);
CREATE INDEX IF NOT EXISTS idx_barbershops_provider_subscription ON barbershops(provider_subscription_id);
CREATE INDEX IF NOT EXISTS idx_barbershops_provider_payment ON barbershops(provider_payment_id);
CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_provider_event ON billing_webhook_events(provider, event_id);
CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_created_at ON billing_webhook_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_payments_barbershop ON billing_payments(barbershop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_payments_subscription ON billing_payments(provider_subscription_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user ON audit_logs(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_user ON audit_logs(target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON audit_logs(action_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- WhatsApp
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_phone ON whatsapp_sessions(phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_ratings_barbershop ON whatsapp_ratings(barbershop_id);
CREATE INDEX IF NOT EXISTS idx_barbershop_settings_barbershop_id ON barbershop_settings(barbershop_id);

-- Barbers/Services: filtros ativos
CREATE INDEX IF NOT EXISTS idx_barbers_barbershop_active ON barbers(barbershop_id) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_services_barbershop_active ON services(barbershop_id) WHERE active = true;

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers de updated_at
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY['barbershops','users','barbers','services','clients','appointments','expenses','whatsapp_sessions','whatsapp_bot_config','barbershop_settings','billing_payments'])
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
