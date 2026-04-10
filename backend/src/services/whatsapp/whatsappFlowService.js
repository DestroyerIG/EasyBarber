import logger from '../../utils/logger.js';
import pool from '../../config/database.js';
import { sendWhatsAppMessage, buildWelcomeMessage } from './whatsappMessageService.js';

const normalizePhone = (value) => String(value || '').replace(/\D/g, '');
const normalizeText = (value) => String(value || '').trim();

const isValidPhone = (phone) => {
  const digits = normalizePhone(phone);
  return digits.length >= 10 && digits.length <= 15;
};

const normalizeChoice = (text) => {
  const cleaned = normalizeText(text).toLowerCase();

  if (!cleaned) return null;

  const numericMatch = cleaned.match(/^(\d{1,2})$/);
  if (numericMatch) {
    return Number(numericMatch[1]);
  }

  const emojiMap = {
    '1️⃣': 1,
    '2️⃣': 2,
    '3️⃣': 3,
    '4️⃣': 4,
    '5️⃣': 5,
    '6️⃣': 6,
    '7️⃣': 7,
    '8️⃣': 8,
    '9️⃣': 9,
    '🔟': 10,
  };

  if (emojiMap[cleaned]) {
    return emojiMap[cleaned];
  }

  return null;
};

const isGreeting = (text) => {
  const normalized = normalizeText(text).toLowerCase();
  return [
    'oi',
    'ola',
    'olá',
    'menu',
    'inicio',
    'início',
    'bom dia',
    'boa tarde',
    'boa noite',
  ].includes(normalized);
};

const getBotConfig = async () => {
  try {
    const configResult = await pool.query(`
      SELECT *
      FROM whatsapp_bot_config
      ORDER BY updated_at DESC NULLS LAST, id DESC
      LIMIT 1
    `);

    return configResult.rows[0] || null;
  } catch (error) {
    logger.warn({ err: error }, 'Falha ao buscar configuracao do bot WhatsApp');
    return null;
  }
};

const getMenuOptions = async () => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM whatsapp_menu_options
      WHERE active = true
      ORDER BY option_order ASC
    `);

    return result.rows || [];
  } catch (error) {
    logger.warn({ err: error }, 'Falha ao buscar opcoes do menu WhatsApp');
    return [];
  }
};

const getBarbershopName = async () => {
  try {
    const result = await pool.query(`
      SELECT name
      FROM barbershops
      ORDER BY id ASC
      LIMIT 1
    `);

    return result.rows[0]?.name || 'EasyBarber';
  } catch (error) {
    logger.warn({ err: error }, 'Falha ao buscar nome da barbearia');
    return 'EasyBarber';
  }
};

const buildFallbackWelcomeMessage = (barbershopName) => {
  return [
    `Olá 👋 Bem-vindo à ${barbershopName}!`,
    '',
    'Digite uma opção:',
    '1️⃣ *Agendar um horário* 💈',
    '2️⃣ *Ver nossos serviços* 📋',
    '3️⃣ *Cancelar agendamento* ❌',
    '4️⃣ *Reagendamento* 🔄',
    '5️⃣ *Avaliação pós-atendimento* ⭐',
    '6️⃣ *Promoções* 🎉',
    '7️⃣ *Instagram* 📱',
    '8️⃣ *Falar com um humano* 👨‍💼',
    '9️⃣ *Encerrar atendimento* 🚪',
  ].join('\n');
};

const buildMenuMessage = async () => {
  const [config, options, barbershopName] = await Promise.all([
    getBotConfig(),
    getMenuOptions(),
    getBarbershopName(),
  ]);

  if (!options.length) {
    return buildFallbackWelcomeMessage(barbershopName);
  }

  return buildWelcomeMessage(
    config?.welcome_header || 'Olá 👋 Bem-vindo!',
    options.map((item) => ({
      label: item.label,
      emoji: item.emoji,
    })),
    barbershopName
  );
};

const getMenuOptionByChoice = async (choice) => {
  if (!choice) return null;

  try {
    const result = await pool.query(
      `
      SELECT *
      FROM whatsapp_menu_options
      WHERE active = true
        AND option_order = $1
      LIMIT 1
      `,
      [choice]
    );

    return result.rows[0] || null;
  } catch (error) {
    logger.warn({ err: error, choice }, 'Falha ao buscar opcao de menu');
    return null;
  }
};

const buildSystemHandlerResponse = async (option) => {
  const config = await getBotConfig();

  switch (option.handler) {
    case 'schedule':
      return config?.ask_name_message || 'Perfeito. Para iniciar seu agendamento, envie seu nome completo.';

    case 'view_services':
      return option.response_message || 'Em breve vou listar nossos serviços disponíveis.';

    case 'cancel':
      return config?.cancel_list_message || 'Para cancelamento, envie seu nome completo para localizar seus agendamentos.';

    case 'reschedule':
      return config?.reschedule_list_message || 'Para reagendar, envie seu nome completo para localizar seus agendamentos.';

    case 'rating':
      return config?.rating_question_message || 'Como foi seu atendimento? Responda com uma nota de 1 a 5.';

    case 'promotions':
      return config?.promotions_message || 'No momento não há promoções ativas.';

    case 'instagram':
      return config?.instagram_message || 'Siga nosso Instagram para novidades.';

    case 'attendant':
      return config?.attendant_message || 'Certo. Vou encaminhar você para atendimento humano.';

    case 'end_session':
      return config?.end_session_message || 'Atendimento encerrado. Quando quiser, envie "oi" para começar novamente.';

    default:
      return option.response_message || 'Opção recebida com sucesso.';
  }
};

const buildInvalidOptionMessage = async () => {
  const config = await getBotConfig();
  const menuMessage = await buildMenuMessage();

  return [
    config?.invalid_option_message || 'Opção inválida. Escolha uma opção do menu.',
    '',
    menuMessage,
  ].join('\n');
};

const extractPhoneFromWebhook = (payload = {}) => {
  const candidates = [
    payload?.phone,
    payload?.from,
    payload?.sender,
    payload?.senderNumber,
    payload?.number,
    payload?.key?.remoteJid,
    payload?.key?.participant,
    payload?.data?.from,
    payload?.data?.sender,
    payload?.data?.phone,
    payload?.data?.key?.remoteJid,
    payload?.message?.from,
    payload?.message?.sender,
    payload?.message?.phone,
  ];

  for (const candidate of candidates) {
    const normalized = normalizePhone(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return '';
};

const extractTextFromWebhook = (payload = {}) => {
  const candidates = [
    payload?.text,
    payload?.body,
    payload?.message,
    payload?.content,
    payload?.data?.text,
    payload?.data?.body,
    payload?.data?.message,
    payload?.data?.content,
    payload?.message?.text,
    payload?.message?.body,
    payload?.message?.conversation,
    payload?.message?.extendedTextMessage?.text,
    payload?.data?.message?.conversation,
    payload?.data?.message?.extendedTextMessage?.text,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return '';
};

const isIncomingMessageEvent = (payload = {}) => {
  const eventName = String(
    payload?.event ||
      payload?.type ||
      payload?.data?.event ||
      payload?.data?.type ||
      ''
  ).toLowerCase();

  if (!eventName) {
    return true;
  }

  const allowedEvents = [
    'messages.upsert',
    'message.upsert',
    'message',
    'messages',
    'new_message',
    'incoming_message',
    'message_received',
    'messageset',
    'messages-set',
  ];

  return allowedEvents.includes(eventName);
};

const isFromMe = (payload = {}) => {
  return Boolean(
    payload?.fromMe === true ||
      payload?.key?.fromMe === true ||
      payload?.data?.fromMe === true ||
      payload?.data?.key?.fromMe === true
  );
};

export const handleIncomingMessage = async (phone, text) => {
  const normalizedPhone = normalizePhone(phone);
  const normalizedText = normalizeText(text);

  try {
    if (!normalizedPhone || !isValidPhone(normalizedPhone)) {
      logger.warn({ phone }, 'Mensagem recebida ignorada: telefone invalido');
      return { ok: false, ignored: true, reason: 'invalid_phone' };
    }

    if (!normalizedText) {
      logger.debug({ phone: normalizedPhone }, 'Mensagem recebida ignorada: texto vazio');
      return { ok: false, ignored: true, reason: 'empty_text' };
    }

    logger.info(
      {
        phone: normalizedPhone,
        text: normalizedText,
      },
      'Processando mensagem recebida no fluxo WhatsApp'
    );

    if (isGreeting(normalizedText)) {
      const menuMessage = await buildMenuMessage();
      const sent = await sendWhatsAppMessage(normalizedPhone, menuMessage);

      return {
        ok: sent,
        ignored: false,
        reason: sent ? null : 'send_failed',
      };
    }

    const choice = normalizeChoice(normalizedText);

    if (!choice) {
      const invalidMessage = await buildInvalidOptionMessage();
      const sent = await sendWhatsAppMessage(normalizedPhone, invalidMessage);

      return {
        ok: sent,
        ignored: false,
        reason: sent ? null : 'send_failed',
      };
    }

    const option = await getMenuOptionByChoice(choice);

    if (!option) {
      const invalidMessage = await buildInvalidOptionMessage();
      const sent = await sendWhatsAppMessage(normalizedPhone, invalidMessage);

      return {
        ok: sent,
        ignored: false,
        reason: sent ? null : 'send_failed',
      };
    }

    let reply = null;

    if (option.type === 'custom') {
      reply = option.response_message || 'Opção personalizada recebida.';
    } else {
      reply = await buildSystemHandlerResponse(option);
    }

    if (!reply || !String(reply).trim()) {
      logger.warn(
        {
          phone: normalizedPhone,
          optionOrder: option.option_order,
          handler: option.handler,
        },
        'Resposta do fluxo WhatsApp vazia'
      );

      return { ok: false, ignored: true, reason: 'empty_reply' };
    }

    const sent = await sendWhatsAppMessage(normalizedPhone, reply);

    if (!sent) {
      logger.warn({ phone: normalizedPhone }, 'Mensagem nao enviada pelo provider WhatsApp');
      return { ok: false, ignored: false, reason: 'send_failed' };
    }

    logger.info(
      {
        phone: normalizedPhone,
        optionOrder: option.option_order,
        handler: option.handler,
      },
      'Resposta enviada com sucesso no fluxo WhatsApp'
    );

    return {
      ok: true,
      ignored: false,
      reason: null,
    };
  } catch (error) {
    logger.error(
      {
        err: error,
        phone: normalizedPhone,
        text: normalizedText,
      },
      'Erro ao processar fluxo de mensagem WhatsApp'
    );

    return {
      ok: false,
      ignored: false,
      reason: 'flow_error',
      error: error?.message || 'Erro interno no fluxo WhatsApp',
    };
  }
};

export const handleWebhook = async (req, res) => {
  try {
    const payload = req.body ?? {};

    logger.info({ payload }, 'Webhook WhatsApp recebido');

    if (isFromMe(payload)) {
      return res.status(200).json({
        success: true,
        message: 'Evento ignorado: mensagem enviada pela própria instância.',
      });
    }

    if (!isIncomingMessageEvent(payload)) {
      return res.status(200).json({
        success: true,
        message: 'Evento ignorado: não é mensagem de entrada.',
      });
    }

    const phone = extractPhoneFromWebhook(payload);
    const text = extractTextFromWebhook(payload);

    if (!phone) {
      logger.warn({ payload }, 'Webhook ignorado: telefone não identificado');
      return res.status(200).json({
        success: true,
        message: 'Webhook recebido, mas sem telefone identificável.',
      });
    }

    if (!text) {
      logger.warn({ payload, phone }, 'Webhook ignorado: texto não identificado');
      return res.status(200).json({
        success: true,
        message: 'Webhook recebido, mas sem texto processável.',
      });
    }

    const result = await handleIncomingMessage(phone, text);

    return res.status(200).json({
      success: true,
      data: {
        phone,
        text,
        result,
      },
    });
  } catch (error) {
    logger.error({ err: error, body: req.body }, 'Erro ao processar webhook WhatsApp');

    return res.status(500).json({
      success: false,
      message: 'Erro ao processar webhook WhatsApp',
      error: {
        code: 'WHATSAPP_WEBHOOK_ERROR',
        message: error?.message || 'Erro interno no webhook WhatsApp',
      },
    });
  }
};