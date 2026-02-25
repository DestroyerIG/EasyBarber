-- Criação das tabelas do banco de dados

-- Tabela de barbearias
CREATE TABLE IF NOT EXISTS barbershops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    owner_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    whatsapp VARCHAR(20) NOT NULL,
    plan VARCHAR(50) NOT NULL DEFAULT 'basico',
    instagram_handle VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active BOOLEAN DEFAULT true
);

-- Tabela de usuários (login)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'admin',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de barbeiros
CREATE TABLE IF NOT EXISTS barbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    photo TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de serviços
CREATE TABLE IF NOT EXISTS services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    duration_minutes INTEGER NOT NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    status VARCHAR(20) NOT NULL DEFAULT 'confirmado',
    reminder_sent BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de ganhos
CREATE TABLE IF NOT EXISTS earnings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    amount DECIMAL(10, 2) NOT NULL,
    date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de gastos
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
    description VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    date DATE NOT NULL,
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

Me chame de *BarberBot* 🤖 e estou aqui para agilizar seu atendimento.

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

-- Índices para melhorar performance
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);
CREATE INDEX IF NOT EXISTS idx_appointments_barbershop ON appointments(barbershop_id);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_phone ON whatsapp_sessions(phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_ratings_barbershop ON whatsapp_ratings(barbershop_id);
CREATE INDEX IF NOT EXISTS idx_earnings_date ON earnings(date);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
