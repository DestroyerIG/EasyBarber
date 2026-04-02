-- Migration v3: Dynamic WhatsApp Bot Menu + All Messages Configurable
-- Run this on existing databases to upgrade from v2

BEGIN;

-- 1. Add new configurable message columns to whatsapp_bot_config
ALTER TABLE whatsapp_bot_config ADD COLUMN IF NOT EXISTS welcome_header TEXT DEFAULT 'Olá 👋 Bem-vindo à {nome_barbearia}!

Me chame de *EasyBarber Bot* 🤖 e estou aqui para agilizar seu atendimento.

Como posso ajudar hoje?';

ALTER TABLE whatsapp_bot_config ADD COLUMN IF NOT EXISTS end_session_message TEXT DEFAULT '✅ Atendimento encerrado.

Se precisar novamente, é só mandar uma nova mensagem.';

ALTER TABLE whatsapp_bot_config ADD COLUMN IF NOT EXISTS name_validation_message TEXT DEFAULT 'Por favor, digite seu nome completo para continuarmos.

0️⃣ Ou digite 0 para voltar ao menu de atendimento';

ALTER TABLE whatsapp_bot_config ADD COLUMN IF NOT EXISTS no_slots_message TEXT DEFAULT 'Infelizmente não há horários disponíveis com este barbeiro nesta data. Escolha outra data ou barbeiro.

0️⃣ Voltar ao menu de atendimento';

ALTER TABLE whatsapp_bot_config ADD COLUMN IF NOT EXISTS cancel_no_appointments_message TEXT DEFAULT '📋 Você não tem agendamentos próximos para cancelar.

Se deseja agendar, escolha a opção 1️⃣';

ALTER TABLE whatsapp_bot_config ADD COLUMN IF NOT EXISTS cancel_list_message TEXT DEFAULT '❌ Seus agendamentos próximos:';

ALTER TABLE whatsapp_bot_config ADD COLUMN IF NOT EXISTS cancel_success_message TEXT DEFAULT '✅ Seu agendamento foi cancelado com sucesso!

Se deseja remarcar ou agende um novo horário.';

ALTER TABLE whatsapp_bot_config ADD COLUMN IF NOT EXISTS reschedule_no_appointments_message TEXT DEFAULT '📋 Você não tem agendamentos para reagendar.

Se deseja agendar, escolha a opção 1️⃣';

ALTER TABLE whatsapp_bot_config ADD COLUMN IF NOT EXISTS reschedule_list_message TEXT DEFAULT '🔄 Seus agendamentos disponíveis para reagendamento:';

ALTER TABLE whatsapp_bot_config ADD COLUMN IF NOT EXISTS no_previous_appointments_message TEXT DEFAULT '📊 Você não tem atendimentos anteriores para avaliar.

Volte após seu próximo corte! 💇';

ALTER TABLE whatsapp_bot_config ADD COLUMN IF NOT EXISTS rating_question_message TEXT DEFAULT '⭐ *Como foi seu atendimento?*

1️⃣ Excelente! 😍
2️⃣ Bom 😊
3️⃣ Pode melhorar 😐
4️⃣ Ruim 😞

0️⃣ Voltar ao menu de atendimento

Sua opinião nos ajuda a melhorar cada vez mais!';

ALTER TABLE whatsapp_bot_config ADD COLUMN IF NOT EXISTS rating_confirmation_message TEXT DEFAULT '✅ Obrigado pela sua avaliação: {avaliacao}

Sua opinião é muito importante para melhorarmos cada vez mais!

👉 O que mais podemos fazer por você?';

ALTER TABLE whatsapp_bot_config ADD COLUMN IF NOT EXISTS promotions_message TEXT DEFAULT '🎉 *Promoções e Ofertas Especiais!*

💈 *Desconto de 10%* em todos os serviços para clientes frequentes!

💝 *Promoção do Mês:* Corte + Barba por apenas R$ 49,90
(Válido até o final do mês)

🎁 *Indique um amigo* e ganhe 5% em seu próximo atendimento!

Para aproveitar as promoções, agende agora!';

ALTER TABLE whatsapp_bot_config ADD COLUMN IF NOT EXISTS instagram_message TEXT DEFAULT '📱 *Nos acompanhe no Instagram!*

🎨 Veja nossos trabalhos, dicas de estilo e tendências!

👉 {instagram_handle}

📸 Siga-nos para:
✨ Vê os melhores cortes
💡 Receber dicas de beleza
🎯 Acompanhar promoções exclusivas

📲 Clique no link para nos seguir!';

-- 2. Create whatsapp_menu_options table
CREATE TABLE IF NOT EXISTS whatsapp_menu_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
    option_order INTEGER NOT NULL,
    label VARCHAR(100) NOT NULL,
    emoji VARCHAR(10) DEFAULT '',
    type VARCHAR(10) NOT NULL DEFAULT 'custom' CHECK (type IN ('system', 'custom')),
    handler VARCHAR(50),
    response_message TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(barbershop_id, option_order)
);

CREATE INDEX IF NOT EXISTS idx_menu_options_barbershop ON whatsapp_menu_options(barbershop_id);
CREATE INDEX IF NOT EXISTS idx_menu_options_active ON whatsapp_menu_options(barbershop_id, active) WHERE active = true;

-- 3. Seed default menu options for existing barbershops
INSERT INTO whatsapp_menu_options (barbershop_id, option_order, label, emoji, type, handler, active)
SELECT id, 1, 'Agendar um horário', '💈', 'system', 'schedule', true FROM barbershops
ON CONFLICT DO NOTHING;

INSERT INTO whatsapp_menu_options (barbershop_id, option_order, label, emoji, type, handler, active)
SELECT id, 2, 'Ver nossos serviços', '📋', 'system', 'view_services', true FROM barbershops
ON CONFLICT DO NOTHING;

INSERT INTO whatsapp_menu_options (barbershop_id, option_order, label, emoji, type, handler, active)
SELECT id, 3, 'Cancelar agendamento', '❌', 'system', 'cancel', true FROM barbershops
ON CONFLICT DO NOTHING;

INSERT INTO whatsapp_menu_options (barbershop_id, option_order, label, emoji, type, handler, active)
SELECT id, 4, 'Reagendamento', '🔄', 'system', 'reschedule', true FROM barbershops
ON CONFLICT DO NOTHING;

INSERT INTO whatsapp_menu_options (barbershop_id, option_order, label, emoji, type, handler, active)
SELECT id, 5, 'Avaliação pós-atendimento', '⭐', 'system', 'rating', true FROM barbershops
ON CONFLICT DO NOTHING;

INSERT INTO whatsapp_menu_options (barbershop_id, option_order, label, emoji, type, handler, active)
SELECT id, 6, 'Promoções', '🎉', 'system', 'promotions', true FROM barbershops
ON CONFLICT DO NOTHING;

INSERT INTO whatsapp_menu_options (barbershop_id, option_order, label, emoji, type, handler, active)
SELECT id, 7, 'Instagram', '📱', 'system', 'instagram', true FROM barbershops
ON CONFLICT DO NOTHING;

INSERT INTO whatsapp_menu_options (barbershop_id, option_order, label, emoji, type, handler, active)
SELECT id, 8, 'Falar com um humano', '👨‍💼', 'system', 'attendant', true FROM barbershops
ON CONFLICT DO NOTHING;

INSERT INTO whatsapp_menu_options (barbershop_id, option_order, label, emoji, type, handler, active)
SELECT id, 9, 'Encerrar atendimento', '🚪', 'system', 'end_session', true FROM barbershops
ON CONFLICT DO NOTHING;

COMMIT;
