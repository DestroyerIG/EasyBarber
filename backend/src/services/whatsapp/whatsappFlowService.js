/**
 * whatsappFlowService.js
 *
 * Fluxo completo do bot WhatsApp com máquina de estados baseada em sessões.
 * Restaura: menu → serviço → nome → barbeiro → data → hora → confirmação
 */

import logger from '../../utils/logger.js';
import pool from '../../config/database.js';
import { sendWhatsAppMessage, buildWelcomeMessage } from './whatsappMessageService.js';
import { getWhatsAppStatus } from '../whatsappClient.js';
import {
  normalizeWhatsAppNumber,
  extractWhatsAppPhoneFromWebhookDetailed,
  extractWhatsAppInstanceNumbersFromWebhook,
  extractWhatsAppRemoteJidFromWebhook,
} from '../../utils/whatsapp.js';
import {
  getSession,
  isSessionExpired,
  createSession,
  updateSession,
  deleteSession,
} from './whatsappSessionService.js';
import { getBotConfig, getMenuOptions } from './whatsappConfigService.js';
import { STEPS, RATING_TEXTS } from './whatsappConstants.js';
import {
  handleCancelAppointment,
  handleConfirmCancel,
  handleRescheduleAppointment,
  handleConfirmReschedule,
  handlePostAttendanceEvaluation,
  handleSendRating,
} from './whatsappBookingService.js';

// ==================== HELPERS INTERNOS ====================

const normalizeText = (value) => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value).trim();
  return '';
};

const normalizeWebhookEventName = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[._\s]+/g, '-');

const isWebhookBooleanTrue = (value) => {
  if (value === true || value === 1) return true;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1';
};

const INCOMING_MESSAGE_EVENTS = new Set([
  'messages-upsert',
  'message-upsert',
  'messages',
  'message',
  'new-message',
  'incoming-message',
  'message-received',
  'messages-set',
  'messageset',
]);

const isGreeting = (text) => {
  const normalized = normalizeText(text).toLowerCase();
  return [
    'oi', 'ola', 'olá', 'menu', 'inicio', 'início',
    'bom dia', 'boa tarde', 'boa noite',
  ].includes(normalized);
};

const normalizeChoice = (text) => {
  const cleaned = normalizeText(text).toLowerCase();
  if (!cleaned) return null;

  const numericMatch = cleaned.match(/^(\d{1,2})$/);
  if (numericMatch) return Number(numericMatch[1]);

  const emojiMap = {
    '1️⃣': 1, '2️⃣': 2, '3️⃣': 3, '4️⃣': 4, '5️⃣': 5,
    '6️⃣': 6, '7️⃣': 7, '8️⃣': 8, '9️⃣': 9, '🔟': 10,
  };
  if (emojiMap[cleaned]) return emojiMap[cleaned];

  return null;
};

const isFromMe = (payload = {}) => {
  const candidates = [
    payload?.fromMe,
    payload?.key?.fromMe,
    payload?.data?.fromMe,
    payload?.data?.key?.fromMe,
    payload?.data?.messages?.[0]?.key?.fromMe,
    payload?.messages?.[0]?.key?.fromMe,
  ];
  return candidates.some((value) => isWebhookBooleanTrue(value));
};

const isIncomingMessageEvent = (payload = {}) => {
  const eventName = normalizeWebhookEventName(
    payload?.event || payload?.type || payload?.data?.event || payload?.data?.type || ''
  );
  if (!eventName) return true;
  return INCOMING_MESSAGE_EVENTS.has(eventName);
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
    payload?.data?.messages?.[0]?.message?.conversation,
    payload?.data?.messages?.[0]?.message?.extendedTextMessage?.text,
    payload?.messages?.[0]?.message?.conversation,
    payload?.messages?.[0]?.message?.extendedTextMessage?.text,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (normalized) return normalized;
  }
  return '';
};

const buildWebhookPayloadSummary = (payload = {}) => ({
  event: payload?.event || payload?.type || payload?.data?.event || payload?.data?.type || null,
  keyRemoteJid: payload?.key?.remoteJid || payload?.data?.key?.remoteJid || null,
  messageKeyRemoteJid: payload?.message?.key?.remoteJid || null,
  sender: payload?.sender || payload?.data?.sender || null,
  participant:
    payload?.key?.participant ||
    payload?.data?.key?.participant ||
    payload?.message?.key?.participant ||
    payload?.data?.participant ||
    null,
  from: payload?.from || payload?.data?.from || null,
  fromMe:
    payload?.fromMe || payload?.key?.fromMe || payload?.data?.fromMe ||
    payload?.data?.key?.fromMe || null,
});

const mergeKnownInstanceNumbers = (values = []) => {
  const normalized = new Set();
  for (const value of values) {
    const phone = normalizeWhatsAppNumber(value);
    if (phone) normalized.add(phone);
  }
  return Array.from(normalized);
};

const resolveConnectedNumber = () =>
  normalizeWhatsAppNumber(getWhatsAppStatus()?.connectedNumber);

// ==================== RESOLUÇÃO DE BARBERSHOP ====================

const resolveFlowBarbershopId = async () => {
  const connectedNumber = resolveConnectedNumber();

  if (connectedNumber) {
    try {
      // Tenta match exato primeiro
      const result = await pool.query(
        `SELECT id FROM barbershops
         WHERE regexp_replace(COALESCE(whatsapp, ''), '\\D', '', 'g') = $1
            OR regexp_replace(COALESCE(whatsapp, ''), '\\D', '', 'g') = $2
         ORDER BY created_at ASC NULLS LAST, id ASC
         LIMIT 2`,
        [connectedNumber, connectedNumber.replace(/^55/, '')]
      );

      if (result.rows.length > 1) {
        logger.warn(
          { connectedNumber, matches: result.rows.length },
          'Multiplas barbearias encontradas para o mesmo WhatsApp conectado; usando o primeiro match'
        );
      }

      if (result.rows.length > 0) {
        return result.rows[0].id;
      }
    } catch (error) {
      logger.warn({ err: error, connectedNumber }, 'Falha ao resolver barbershop pelo numero conectado do WhatsApp');
    }
  }

  const configuredId = typeof process.env.WHATSAPP_DEFAULT_BARBERSHOP_ID === 'string' &&
    process.env.WHATSAPP_DEFAULT_BARBERSHOP_ID.trim()
    ? process.env.WHATSAPP_DEFAULT_BARBERSHOP_ID.trim()
    : null;

  if (configuredId) return configuredId;

  try {
    const result = await pool.query(
      `SELECT id FROM barbershops WHERE active = true ORDER BY id ASC LIMIT 1`
    );
    return result.rows[0]?.id || null;
  } catch (error) {
    logger.warn({ err: error }, 'Falha ao resolver barbershop fallback no fluxo WhatsApp');
    return null;
  }
};

// ==================== CONSTRUÇÃO DO MENU ====================

const getBarbershopName = async (barbershopId) => {
  if (!barbershopId) return 'EasyBarber';
  try {
    const result = await pool.query(
      `SELECT name FROM barbershops WHERE id = $1 LIMIT 1`,
      [barbershopId]
    );
    return result.rows[0]?.name || 'EasyBarber';
  } catch (error) {
    logger.warn({ err: error, barbershopId }, 'Falha ao buscar nome da barbearia');
    return 'EasyBarber';
  }
};

const buildFallbackWelcomeMessage = (barbershopName) => {
  return [
    `Olá 👋 Bem-vindo à *${barbershopName}*!`,
    '',
    'Me chame de *EasyBarber Bot* 🤖 e estou aqui para agilizar seu atendimento.',
    '',
    'Como posso ajudar hoje?',
    '',
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

const buildMenuMessage = async (barbershopId) => {
  const [config, options, barbershopName] = await Promise.all([
    getBotConfig(barbershopId),
    getMenuOptions(barbershopId),
    getBarbershopName(barbershopId),
  ]);

  if (!options || !options.length) {
    return buildFallbackWelcomeMessage(barbershopName);
  }

  return buildWelcomeMessage(
    config?.welcome_header || 'Olá 👋 Bem-vindo à {nome_barbearia}!\n\nComo posso ajudar hoje?',
    options.map((item) => ({ label: item.label, emoji: item.emoji })),
    barbershopName
  );
};

// Exportada para uso no whatsappBookingService
export const goBackToMainMenu = async (phone, barbershopId) => {
  await deleteSession(phone, barbershopId);
  await createSession(phone, barbershopId);
  const menuMessage = await buildMenuMessage(barbershopId);
  return { message: menuMessage };
};

// ==================== HANDLERS DE STEPS ====================

const handleMenuStep = async (phone, text, barbershopId, config, sendContext) => {
  const choice = normalizeChoice(text);

  if (!choice) {
    const menu = await buildMenuMessage(barbershopId);
    await sendWhatsAppMessage(phone, config.invalid_option_message + '\n\n' + menu, sendContext);
    return { ok: true };
  }

  // Busca opção do menu
  const optionResult = await pool.query(
    `SELECT * FROM whatsapp_menu_options
     WHERE active = true AND barbershop_id = $1 AND option_order = $2
     LIMIT 1`,
    [barbershopId, choice]
  );

  if (!optionResult.rows.length) {
    const menu = await buildMenuMessage(barbershopId);
    await sendWhatsAppMessage(phone, config.invalid_option_message + '\n\n' + menu, sendContext);
    return { ok: true };
  }

  const option = optionResult.rows[0];

  // Opção personalizada (type=custom)
  if (option.type === 'custom' && option.response_message) {
    await sendWhatsAppMessage(phone, option.response_message, sendContext);
    await deleteSession(phone, barbershopId);
    return { ok: true };
  }

  // Handlers de sistema
  switch (option.handler) {
    case 'schedule': {
      // Verifica se cliente já tem nome cadastrado
      const clientResult = await pool.query(
        `SELECT id, name FROM clients WHERE phone = $1 AND barbershop_id = $2 LIMIT 1`,
        [phone, barbershopId]
      );

      if (clientResult.rows.length > 0) {
        // Cliente já cadastrado, vai direto para serviço
        await updateSession(phone, barbershopId, STEPS.CHOOSE_SERVICE, {
          clientId: clientResult.rows[0].id,
          clientName: clientResult.rows[0].name,
        });
        const services = await pool.query(
          `SELECT id, name, price, duration_minutes FROM services WHERE barbershop_id = $1 AND active = true ORDER BY name`,
          [barbershopId]
        );
        if (!services.rows.length) {
          await sendWhatsAppMessage(phone, 'Desculpe, não há serviços disponíveis no momento.', sendContext);
          await deleteSession(phone, barbershopId);
          return { ok: true };
        }
        let msg = '💈 *Escolha o serviço:*\n\n';
        services.rows.forEach((s, i) => {
          msg += `${i + 1}️⃣ *${s.name}* — R$ ${Number(s.price).toFixed(2)} (${s.duration_minutes} min)\n`;
        });
        msg += '\n0️⃣ Voltar ao menu';
        await sendWhatsAppMessage(phone, msg, sendContext);
        await updateSession(phone, barbershopId, STEPS.CHOOSE_SERVICE, {
          clientId: clientResult.rows[0].id,
          clientName: clientResult.rows[0].name,
          services: services.rows,
        });
      } else {
        // Cliente novo, pede o nome
        await updateSession(phone, barbershopId, STEPS.ASK_NAME, {});
        await sendWhatsAppMessage(phone, config.ask_name_message, sendContext);
      }
      return { ok: true };
    }

    case 'view_services': {
      const services = await pool.query(
        `SELECT name, price, duration_minutes FROM services WHERE barbershop_id = $1 AND active = true ORDER BY name`,
        [barbershopId]
      );
      if (!services.rows.length) {
        await sendWhatsAppMessage(phone, 'Não há serviços cadastrados no momento.', sendContext);
      } else {
        let msg = '📋 *Nossos serviços:*\n\n';
        services.rows.forEach((s) => {
          msg += `💈 *${s.name}* — R$ ${Number(s.price).toFixed(2)} (${s.duration_minutes} min)\n`;
        });
        await sendWhatsAppMessage(phone, msg, sendContext);
      }
      await deleteSession(phone, barbershopId);
      return { ok: true };
    }

    case 'cancel': {
      const result = await handleCancelAppointment(phone, barbershopId, config);
      await sendWhatsAppMessage(phone, result.message, sendContext);
      return { ok: true };
    }

    case 'reschedule': {
      const result = await handleRescheduleAppointment(phone, barbershopId, config);
      await sendWhatsAppMessage(phone, result.message, sendContext);
      return { ok: true };
    }

    case 'rating': {
      const result = await handlePostAttendanceEvaluation(phone, barbershopId, config);
      await sendWhatsAppMessage(phone, result.message, sendContext);
      return { ok: true };
    }

    case 'promotions': {
      await sendWhatsAppMessage(phone, config.promotions_message, sendContext);
      await deleteSession(phone, barbershopId);
      return { ok: true };
    }

    case 'instagram': {
      const barbershopResult = await pool.query(
        `SELECT instagram_handle FROM barbershops WHERE id = $1 LIMIT 1`,
        [barbershopId]
      );
      const instagramHandle = barbershopResult.rows[0]?.instagram_handle || '@suabarbearia';
      const msg = config.instagram_message.replace('{instagram_handle}', instagramHandle);
      await sendWhatsAppMessage(phone, msg, sendContext);
      await deleteSession(phone, barbershopId);
      return { ok: true };
    }

    case 'attendant': {
      await sendWhatsAppMessage(phone, config.attendant_message, sendContext);
      await deleteSession(phone, barbershopId);
      return { ok: true };
    }

    case 'end_session': {
      await sendWhatsAppMessage(phone, config.end_session_message, sendContext);
      await deleteSession(phone, barbershopId);
      return { ok: true };
    }

    default: {
      const menu = await buildMenuMessage(barbershopId);
      await sendWhatsAppMessage(phone, config.invalid_option_message + '\n\n' + menu, sendContext);
      return { ok: true };
    }
  }
};

const handleAskNameStep = async (phone, text, barbershopId, config, sendContext) => {
  if (text === '0' || text.toLowerCase() === 'menu') {
    const result = await goBackToMainMenu(phone, barbershopId);
    await sendWhatsAppMessage(phone, result.message, sendContext);
    return { ok: true };
  }

  const name = text.trim();
  if (name.split(' ').length < 2 || name.length < 3) {
    await sendWhatsAppMessage(phone, config.name_validation_message, sendContext);
    return { ok: true };
  }

  // Cria ou atualiza o cliente
  const existingClient = await pool.query(
    `SELECT id FROM clients WHERE phone = $1 AND barbershop_id = $2 LIMIT 1`,
    [phone, barbershopId]
  );

  let clientId;
  if (existingClient.rows.length > 0) {
    clientId = existingClient.rows[0].id;
    await pool.query(
      `UPDATE clients SET name = $1 WHERE id = $2`,
      [name, clientId]
    );
  } else {
    const newClient = await pool.query(
      `INSERT INTO clients (barbershop_id, name, phone) VALUES ($1, $2, $3) RETURNING id`,
      [barbershopId, name, phone]
    );
    clientId = newClient.rows[0].id;
  }

  // Busca serviços
  const services = await pool.query(
    `SELECT id, name, price, duration_minutes FROM services WHERE barbershop_id = $1 AND active = true ORDER BY name`,
    [barbershopId]
  );

  if (!services.rows.length) {
    await sendWhatsAppMessage(phone, 'Desculpe, não há serviços disponíveis no momento.', sendContext);
    await deleteSession(phone, barbershopId);
    return { ok: true };
  }

  let msg = `✅ Olá, *${name}*! Bem-vindo!\n\n💈 *Escolha o serviço:*\n\n`;
  services.rows.forEach((s, i) => {
    msg += `${i + 1}️⃣ *${s.name}* — R$ ${Number(s.price).toFixed(2)} (${s.duration_minutes} min)\n`;
  });
  msg += '\n0️⃣ Voltar ao menu';

  await updateSession(phone, barbershopId, STEPS.CHOOSE_SERVICE, {
    clientId,
    clientName: name,
    services: services.rows,
  });

  await sendWhatsAppMessage(phone, msg, sendContext);
  return { ok: true };
};

const handleChooseServiceStep = async (phone, text, barbershopId, sessionData, config, sendContext) => {
  if (text === '0' || text.toLowerCase() === 'menu') {
    const result = await goBackToMainMenu(phone, barbershopId);
    await sendWhatsAppMessage(phone, result.message, sendContext);
    return { ok: true };
  }

  const choice = normalizeChoice(text);
  const services = sessionData.services || [];

  if (!choice || choice < 1 || choice > services.length) {
    let msg = `${config.invalid_option_message}\n\n💈 *Escolha o serviço:*\n\n`;
    services.forEach((s, i) => {
      msg += `${i + 1}️⃣ *${s.name}* — R$ ${Number(s.price).toFixed(2)} (${s.duration_minutes} min)\n`;
    });
    msg += '\n0️⃣ Voltar ao menu';
    await sendWhatsAppMessage(phone, msg, sendContext);
    return { ok: true };
  }

  const selectedService = services[choice - 1];

  // Busca barbeiros ativos
  const barbers = await pool.query(
    `SELECT id, name FROM barbers WHERE barbershop_id = $1 AND active = true ORDER BY name`,
    [barbershopId]
  );

  if (!barbers.rows.length) {
    await sendWhatsAppMessage(phone, 'Desculpe, não há barbeiros disponíveis no momento.', sendContext);
    await deleteSession(phone, barbershopId);
    return { ok: true };
  }

  await updateSession(phone, barbershopId, STEPS.CHOOSE_BARBER, {
    ...sessionData,
    serviceId: selectedService.id,
    serviceName: selectedService.name,
    servicePrice: selectedService.price,
    serviceDuration: selectedService.duration_minutes,
    barbers: barbers.rows,
  });

  let msg = `✅ *${selectedService.name}* selecionado!\n\n👨‍🦱 *Escolha o barbeiro:*\n\n`;
  barbers.rows.forEach((b, i) => {
    msg += `${i + 1}️⃣ *${b.name}*\n`;
  });
  msg += '\n0️⃣ Voltar ao menu';

  await sendWhatsAppMessage(phone, msg, sendContext);
  return { ok: true };
};

const handleChooseBarberStep = async (phone, text, barbershopId, sessionData, config, sendContext) => {
  if (text === '0' || text.toLowerCase() === 'menu') {
    const result = await goBackToMainMenu(phone, barbershopId);
    await sendWhatsAppMessage(phone, result.message, sendContext);
    return { ok: true };
  }

  const choice = normalizeChoice(text);
  const barbers = sessionData.barbers || [];

  if (!choice || choice < 1 || choice > barbers.length) {
    let msg = `${config.invalid_option_message}\n\n👨‍🦱 *Escolha o barbeiro:*\n\n`;
    barbers.forEach((b, i) => {
      msg += `${i + 1}️⃣ *${b.name}*\n`;
    });
    msg += '\n0️⃣ Voltar ao menu';
    await sendWhatsAppMessage(phone, msg, sendContext);
    return { ok: true };
  }

  const selectedBarber = barbers[choice - 1];

  // Gera os próximos 7 dias
  const today = new Date();
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    dates.push(date);
  }

  await updateSession(phone, barbershopId, STEPS.CHOOSE_DATE, {
    ...sessionData,
    barberId: selectedBarber.id,
    barberName: selectedBarber.name,
    availableDates: dates.map((d) => d.toISOString().split('T')[0]),
  });

  let msg = `✅ *${selectedBarber.name}* selecionado!\n\n📅 *Escolha a data:*\n\n`;
  dates.forEach((date, index) => {
    const day = date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
    msg += `${index + 1}️⃣ ${day}\n`;
  });
  msg += '\n0️⃣ Voltar ao menu';

  await sendWhatsAppMessage(phone, msg, sendContext);
  return { ok: true };
};

const handleChooseDateStep = async (phone, text, barbershopId, sessionData, config, sendContext) => {
  if (text === '0' || text.toLowerCase() === 'menu') {
    const result = await goBackToMainMenu(phone, barbershopId);
    await sendWhatsAppMessage(phone, result.message, sendContext);
    return { ok: true };
  }

  const choice = normalizeChoice(text);
  const availableDates = sessionData.availableDates || [];

  if (!choice || choice < 1 || choice > availableDates.length) {
    let msg = `${config.invalid_option_message}\n\n📅 *Escolha a data:*\n\n`;
    availableDates.forEach((dateStr, index) => {
      const date = new Date(dateStr + 'T12:00:00');
      const day = date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
      msg += `${index + 1}️⃣ ${day}\n`;
    });
    msg += '\n0️⃣ Voltar ao menu';
    await sendWhatsAppMessage(phone, msg, sendContext);
    return { ok: true };
  }

  const selectedDate = availableDates[choice - 1];

  // Busca horários já ocupados para o barbeiro nessa data
  const bookedResult = await pool.query(
    `SELECT time FROM appointments
     WHERE barbershop_id = $1 AND barber_id = $2 AND date = $3 AND status != 'cancelado'`,
    [barbershopId, sessionData.barberId, selectedDate]
  );
  const bookedTimes = new Set(bookedResult.rows.map((r) => r.time.substring(0, 5)));

  // Busca configurações de horário da barbearia
  const settingsResult = await pool.query(
    `SELECT opening_time, closing_time, slot_interval_minutes FROM barbershop_settings WHERE barbershop_id = $1 LIMIT 1`,
    [barbershopId]
  );

  const openingTime = settingsResult.rows[0]?.opening_time || '09:00:00';
  const closingTime = settingsResult.rows[0]?.closing_time || '19:00:00';
  const slotInterval = settingsResult.rows[0]?.slot_interval_minutes || 30;
  const serviceDuration = sessionData.serviceDuration || slotInterval;

  const openingMinutes = parseInt(openingTime.split(':')[0]) * 60 + parseInt(openingTime.split(':')[1]);
  const closingMinutes = parseInt(closingTime.split(':')[0]) * 60 + parseInt(closingTime.split(':')[1]);

  const availableSlots = [];
  for (let minutes = openingMinutes; minutes + serviceDuration <= closingMinutes; minutes += slotInterval) {
    const h = String(Math.floor(minutes / 60)).padStart(2, '0');
    const m = String(minutes % 60).padStart(2, '0');
    const timeStr = `${h}:${m}`;
    if (!bookedTimes.has(timeStr)) {
      availableSlots.push(timeStr);
    }
  }

  if (!availableSlots.length) {
    await sendWhatsAppMessage(phone, config.no_slots_message, sendContext);
    return { ok: true };
  }

  await updateSession(phone, barbershopId, STEPS.CHOOSE_TIME, {
    ...sessionData,
    selectedDate,
    availableSlots,
  });

  const dateFormatted = new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: '2-digit',
  });

  let msg = `📅 *${dateFormatted}*\n\n⏰ *Horários disponíveis:*\n\n`;
  availableSlots.forEach((slot, index) => {
    msg += `${index + 1}️⃣ ${slot}\n`;
  });
  msg += '\n0️⃣ Voltar ao menu';

  await sendWhatsAppMessage(phone, msg, sendContext);
  return { ok: true };
};

const handleChooseTimeStep = async (phone, text, barbershopId, sessionData, config, sendContext) => {
  if (text === '0' || text.toLowerCase() === 'menu') {
    const result = await goBackToMainMenu(phone, barbershopId);
    await sendWhatsAppMessage(phone, result.message, sendContext);
    return { ok: true };
  }

  const choice = normalizeChoice(text);
  const availableSlots = sessionData.availableSlots || [];

  if (!choice || choice < 1 || choice > availableSlots.length) {
    let msg = `${config.invalid_option_message}\n\n⏰ *Horários disponíveis:*\n\n`;
    availableSlots.forEach((slot, index) => {
      msg += `${index + 1}️⃣ ${slot}\n`;
    });
    msg += '\n0️⃣ Voltar ao menu';
    await sendWhatsAppMessage(phone, msg, sendContext);
    return { ok: true };
  }

  const selectedTime = availableSlots[choice - 1];
  const selectedDate = sessionData.selectedDate;

  // Verifica conflito de última hora (race condition)
  const conflictCheck = await pool.query(
    `SELECT id FROM appointments
     WHERE barbershop_id = $1 AND barber_id = $2 AND date = $3 AND time = $4 AND status != 'cancelado'`,
    [barbershopId, sessionData.barberId, selectedDate, selectedTime + ':00']
  );

  if (conflictCheck.rows.length > 0) {
    await sendWhatsAppMessage(
      phone,
      '⚠️ Este horário acabou de ser reservado. Por favor, escolha outro horário.',
      sendContext
    );
    // Recarrega horários disponíveis
    const bookedResult = await pool.query(
      `SELECT time FROM appointments
       WHERE barbershop_id = $1 AND barber_id = $2 AND date = $3 AND status != 'cancelado'`,
      [barbershopId, sessionData.barberId, selectedDate]
    );
    const bookedTimes = new Set(bookedResult.rows.map((r) => r.time.substring(0, 5)));
    const newSlots = availableSlots.filter((s) => !bookedTimes.has(s));

    if (!newSlots.length) {
      await sendWhatsAppMessage(phone, config.no_slots_message, sendContext);
      return { ok: true };
    }

    let msg = `⏰ *Horários disponíveis:*\n\n`;
    newSlots.forEach((slot, index) => {
      msg += `${index + 1}️⃣ ${slot}\n`;
    });
    msg += '\n0️⃣ Voltar ao menu';

    await updateSession(phone, barbershopId, STEPS.CHOOSE_TIME, {
      ...sessionData,
      availableSlots: newSlots,
    });

    await sendWhatsAppMessage(phone, msg, sendContext);
    return { ok: true };
  }

  // Cria o agendamento
  const newAppointment = await pool.query(
    `INSERT INTO appointments (barbershop_id, client_id, barber_id, service_id, date, time, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'confirmado') RETURNING id`,
    [
      barbershopId,
      sessionData.clientId,
      sessionData.barberId,
      sessionData.serviceId,
      selectedDate,
      selectedTime + ':00',
    ]
  );

  logger.info(
    { appointmentId: newAppointment.rows[0].id, phone, barbershopId },
    'Agendamento criado via WhatsApp bot'
  );

  const dateFormatted = new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

  const confirmationMsg = config.confirmation_message
    .replace('{servico}', sessionData.serviceName || '')
    .replace('{barbeiro}', sessionData.barberName || '')
    .replace('{data}', dateFormatted)
    .replace('{horario}', selectedTime)
    .replace('{valor}', Number(sessionData.servicePrice).toFixed(2));

  await sendWhatsAppMessage(phone, confirmationMsg, sendContext);
  await deleteSession(phone, barbershopId);
  return { ok: true };
};

// ==================== HANDLER PRINCIPAL ====================

const resolveIncomingMessageInput = (phoneOrPayload, text, options = {}) => {
  const isPayloadInput =
    phoneOrPayload && typeof phoneOrPayload === 'object' && !Array.isArray(phoneOrPayload);
  const preExtractedPhone = normalizeWhatsAppNumber(options?.preExtractedPhone);
  const preExtractedText = normalizeText(options?.preExtractedText);
  const connectedNumber = resolveConnectedNumber();
  const preExtractedInstanceNumbers = Array.isArray(options?.preExtractedInstanceNumbers)
    ? options.preExtractedInstanceNumbers
    : [];

  const baseKnownInstanceNumbers = mergeKnownInstanceNumbers([
    connectedNumber,
    ...preExtractedInstanceNumbers,
  ]);

  if (!isPayloadInput) {
    const normalizedPhone = normalizeWhatsAppNumber(phoneOrPayload);
    return {
      normalizedPhone,
      normalizedText: normalizeText(text),
      remoteJidOriginal:
        typeof phoneOrPayload === 'string' && phoneOrPayload.includes('@')
          ? phoneOrPayload.trim()
          : null,
      payloadSummary: null,
      phoneExtraction: null,
      knownInstanceNumbers: baseKnownInstanceNumbers,
    };
  }

  const extraction = extractWhatsAppPhoneFromWebhookDetailed(phoneOrPayload, {
    connectedNumbers: baseKnownInstanceNumbers,
    messageText: preExtractedText || normalizeText(text),
  });

  const payloadInstanceNumbers = extractWhatsAppInstanceNumbersFromWebhook(phoneOrPayload, {
    connectedNumbers: baseKnownInstanceNumbers,
  });
  const knownInstanceNumbers = mergeKnownInstanceNumbers([
    ...baseKnownInstanceNumbers,
    ...payloadInstanceNumbers,
    ...(Array.isArray(extraction.instanceNumbers) ? extraction.instanceNumbers : []),
  ]);

  return {
    normalizedPhone: preExtractedPhone || extraction.phone,
    normalizedText: preExtractedText || extractTextFromWebhook(phoneOrPayload),
    remoteJidOriginal: extractWhatsAppRemoteJidFromWebhook(phoneOrPayload),
    payloadSummary: buildWebhookPayloadSummary(phoneOrPayload),
    phoneExtraction: extraction,
    knownInstanceNumbers,
  };
};

export const handleIncomingMessage = async (phoneOrPayload, text, options = {}) => {
  const payloadFromMe =
    phoneOrPayload &&
    typeof phoneOrPayload === 'object' &&
    !Array.isArray(phoneOrPayload) &&
    isFromMe(phoneOrPayload);

  const {
    normalizedPhone,
    normalizedText,
    remoteJidOriginal,
    payloadSummary,
    phoneExtraction,
    knownInstanceNumbers,
  } = resolveIncomingMessageInput(phoneOrPayload, text, options);

  const sendContext = remoteJidOriginal ? { remoteJidOriginal } : {};

  try {
    // Guard: mensagem enviada pela própria instância
    if (payloadFromMe) {
      logger.debug(
        { remoteJid: remoteJidOriginal, eventName: options?.eventName || null },
        'Mensagem recebida ignorada: payload marcado como fromMe'
      );
      return { ok: false, ignored: true, reason: 'self_target' };
    }

    // Guard: telefone não identificado
    if (!normalizedPhone) {
      logger.warn(
        {
          authorPhone: null,
          sourcePath: phoneExtraction?.sourcePath || null,
          confidence: phoneExtraction?.confidence || null,
          remoteJid: remoteJidOriginal,
          payload: payloadSummary,
          knownInstanceNumbers,
          text: normalizedText || null,
          eventName: options?.eventName || null,
        },
        'Mensagem recebida ignorada: telefone nao confiavel para resposta'
      );
      return { ok: false, ignored: true, reason: 'ambiguous_phone' };
    }

    // Guard: texto vazio
    if (!normalizedText) {
      logger.debug(
        { phone: normalizedPhone, eventName: options?.eventName || null },
        'Mensagem recebida ignorada: texto vazio'
      );
      return { ok: false, ignored: true, reason: 'empty_text' };
    }

    // Guard: mensagem da própria instância
    if (knownInstanceNumbers.includes(normalizedPhone)) {
      logger.warn(
        { phone: normalizedPhone, knownInstanceNumbers, eventName: options?.eventName || null },
        'Mensagem recebida ignorada: destino resolve para numero da instancia'
      );
      return { ok: false, ignored: true, reason: 'self_target' };
    }

    // Resolve a barbearia
    const barbershopId = await resolveFlowBarbershopId();
    if (!barbershopId) {
      logger.warn(
        { phone: normalizedPhone, eventName: options?.eventName || null },
        'Mensagem recebida ignorada: barbershop nao resolvido para o fluxo WhatsApp'
      );
      return { ok: false, ignored: true, reason: 'barbershop_not_resolved' };
    }

    logger.info(
      {
        phone: normalizedPhone,
        text: normalizedText,
        sourcePath: phoneExtraction?.sourcePath || null,
        confidence: phoneExtraction?.confidence || null,
        remoteJidOriginal,
        barbershopId,
        eventName: options?.eventName || null,
        dedupeKey: options?.dedupeKey || null,
        messageId: options?.messageId || null,
      },
      'Processando mensagem recebida no fluxo WhatsApp'
    );

    // Busca config do bot
    const config = await getBotConfig(barbershopId);

    // Saudação → reseta sessão e exibe menu
    if (isGreeting(normalizedText)) {
      await deleteSession(normalizedPhone, barbershopId);
      await createSession(normalizedPhone, barbershopId);
      const menuMessage = await buildMenuMessage(barbershopId);
      const sent = await sendWhatsAppMessage(normalizedPhone, menuMessage, sendContext);
      return { ok: sent, ignored: false, reason: sent ? null : 'send_failed' };
    }

    // Busca sessão atual
    let session = await getSession(normalizedPhone, barbershopId);

    // Sessão expirada ou inexistente → exibe menu
    if (!session || isSessionExpired(session)) {
      if (session) {
        await deleteSession(normalizedPhone, barbershopId);
        const expiredMsg = config.session_expired_message ||
          '⏰ Sua sessão expirou. Digite qualquer coisa para começar novamente.';
        await sendWhatsAppMessage(normalizedPhone, expiredMsg, sendContext);
      }
      await createSession(normalizedPhone, barbershopId);
      const menuMessage = await buildMenuMessage(barbershopId);
      const sent = await sendWhatsAppMessage(normalizedPhone, menuMessage, sendContext);
      return { ok: sent, ignored: false, reason: sent ? null : 'send_failed' };
    }

    const currentStep = session.step;
    const sessionData = typeof session.data === 'object' ? session.data : {};

    logger.debug(
      { phone: normalizedPhone, barbershopId, step: currentStep, text: normalizedText },
      'Processando step do fluxo WhatsApp'
    );

    let stepResult = { ok: false };

    switch (currentStep) {
      case STEPS.MENU:
        stepResult = await handleMenuStep(normalizedPhone, normalizedText, barbershopId, config, sendContext);
        break;

      case STEPS.ASK_NAME:
        stepResult = await handleAskNameStep(normalizedPhone, normalizedText, barbershopId, config, sendContext);
        break;

      case STEPS.CHOOSE_SERVICE:
        stepResult = await handleChooseServiceStep(normalizedPhone, normalizedText, barbershopId, sessionData, config, sendContext);
        break;

      case STEPS.CHOOSE_BARBER:
        stepResult = await handleChooseBarberStep(normalizedPhone, normalizedText, barbershopId, sessionData, config, sendContext);
        break;

      case STEPS.CHOOSE_DATE:
        stepResult = await handleChooseDateStep(normalizedPhone, normalizedText, barbershopId, sessionData, config, sendContext);
        break;

      case STEPS.CHOOSE_TIME:
        stepResult = await handleChooseTimeStep(normalizedPhone, normalizedText, barbershopId, sessionData, config, sendContext);
        break;

      case STEPS.CONFIRM_CANCEL: {
        const result = await handleConfirmCancel(normalizedPhone, normalizedText, barbershopId, sessionData, config);
        await sendWhatsAppMessage(normalizedPhone, result.message, sendContext);
        stepResult = { ok: true };
        break;
      }

      case STEPS.CONFIRM_RESCHEDULE: {
        const result = await handleConfirmReschedule(normalizedPhone, normalizedText, barbershopId, sessionData, config);
        await sendWhatsAppMessage(normalizedPhone, result.message, sendContext);
        stepResult = { ok: true };
        break;
      }

      case STEPS.SEND_RATING: {
        const result = await handleSendRating(normalizedPhone, normalizedText, barbershopId, sessionData, config);
        await sendWhatsAppMessage(normalizedPhone, result.message, sendContext);
        stepResult = { ok: true };
        break;
      }

      default: {
        // Step desconhecido → reseta para o menu
        logger.warn({ phone: normalizedPhone, step: currentStep }, 'Step desconhecido, resetando sessão');
        await deleteSession(normalizedPhone, barbershopId);
        await createSession(normalizedPhone, barbershopId);
        const menuMessage = await buildMenuMessage(barbershopId);
        const sent = await sendWhatsAppMessage(normalizedPhone, menuMessage, sendContext);
        stepResult = { ok: sent };
        break;
      }
    }

    return {
      ok: stepResult.ok,
      ignored: false,
      reason: stepResult.ok ? null : 'send_failed',
    };
  } catch (error) {
    logger.error(
      {
        err: error,
        phone: normalizedPhone,
        remoteJid: remoteJidOriginal,
        payload: payloadSummary,
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

// ==================== WEBHOOK HANDLER ====================

export const handleWebhook = async (req, res) => {
  try {
    const payload = req.body ?? {};
    const payloadSummary = buildWebhookPayloadSummary(payload);

    logger.info({ payload: payloadSummary }, 'Webhook WhatsApp recebido');

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

    const text = extractTextFromWebhook(payload);
    const connectedNumber = resolveConnectedNumber();
    const extraction = extractWhatsAppPhoneFromWebhookDetailed(payload, {
      connectedNumbers: mergeKnownInstanceNumbers([connectedNumber]),
      messageText: text,
    });
    const phone = extraction.phone;
    const eventName = normalizeWebhookEventName(
      payload?.event || payload?.type || payload?.data?.event || payload?.data?.type || ''
    );

    const result = await handleIncomingMessage(payload, text, {
      preExtractedPhone: phone,
      preExtractedText: text,
      preExtractedInstanceNumbers: extraction.instanceNumbers,
      preExtractedSourcePath: extraction.sourcePath,
      preExtractedConfidence: extraction.confidence,
      eventName,
    });

    return res.status(200).json({
      success: true,
      data: { phone, text, result },
    });
  } catch (error) {
    logger.error(
      { err: error, payload: buildWebhookPayloadSummary(req.body ?? {}) },
      'Erro ao processar webhook WhatsApp'
    );

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