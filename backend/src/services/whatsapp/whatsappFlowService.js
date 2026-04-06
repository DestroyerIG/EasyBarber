/**
 * Fluxo principal do bot — processamento de mensagens, roteamento de steps,
 * handlers de agendamento (choose_service → choose_time).
 */

import pool from '../../config/database.js';
import logger from '../../utils/logger.js';
import { STEPS } from './whatsappConstants.js';
import { updateSession, deleteSession, getSession, isSessionExpired, createSession } from './whatsappSessionService.js';
import { sendWhatsAppMessage, formatMessage, buildWelcomeMessage } from './whatsappMessageService.js';
import { getBotConfig, getMenuOptions } from './whatsappConfigService.js';
import {
  handleCancelAppointment,
  handleConfirmCancel,
  handleRescheduleAppointment,
  handleConfirmReschedule,
  handlePostAttendanceEvaluation,
  handleSendRating,
} from './whatsappBookingService.js';

/**
 * Valida resultado de query e extrai um ID com segurança.
 */
const safeExtractId = (queryResult, context) => {
  if (!queryResult?.rows) {
    logger.error({ context }, 'Query result malformado');
    throw new Error(`${context}: query result malformado`);
  }
  if (!Array.isArray(queryResult.rows) || queryResult.rows.length === 0) {
    logger.warn({ context }, 'Nenhuma linha retornada pela query');
    return null;
  }
  const id = queryResult.rows[0].id;
  if (id === undefined || id === null) {
    logger.error({ context, row: queryResult.rows[0] }, 'ID é undefined/null');
    throw new Error(`${context}: id property missing or null`);
  }
  return id;
};

// ==================== FLUXO PRINCIPAL ====================

/**
 * Handler para mensagens recebidas via whatsapp-web.js.
 */
export const handleIncomingMessage = async (phone, text) => {
  try {
    if (!phone) {
      logger.warn('Recebida mensagem sem número de telefone');
      return;
    }

    const normalizedPhone = String(phone).replace(/\D/g, '');
    const messageText = text || '';

    const barbershopResult = await pool.query('SELECT id, name FROM barbershops ORDER BY created_at ASC LIMIT 1');
    
    let barbershopId, barbershopName;
    try {
      barbershopId = safeExtractId(barbershopResult, 'handleIncomingMessage - SELECT barbershops');
      if (!barbershopId) {
        logger.warn('Nenhuma barbearia cadastrada');
        return;
      }
      barbershopName = barbershopResult.rows[0].name || 'Barbearia';
    } catch (error) {
      logger.error({ err: error }, 'Erro ao extrair barbershop ID');
      return;
    }

    const config = await getBotConfig(barbershopId);
    const menuOptions = await getMenuOptions(barbershopId);

    const session = await getSession(normalizedPhone, barbershopId);

    if (!session || isSessionExpired(session)) {
      if (session) {
        await deleteSession(normalizedPhone, barbershopId);
      }
      await createSession(normalizedPhone, barbershopId);
      const welcomeMessage = buildWelcomeMessage(config.welcome_header, menuOptions, barbershopName);
      await sendWhatsAppMessage(normalizedPhone, welcomeMessage);
      return;
    }

    logger.debug({ phone: normalizedPhone, step: session.step }, 'Continuando sessão');

    const response = await processMessage(normalizedPhone, messageText, session, barbershopId, config, menuOptions);
    if (response?.message) {
      await sendWhatsAppMessage(normalizedPhone, response.message);
    }
  } catch (error) {
    logger.error({ err: error }, 'Erro ao processar mensagem recebida');
  }
};

/**
 * Handler do webhook — mantido para o simulador local-test.
 */
export const handleWebhook = async (req, res) => {
  try {
    const { phone, message, barbershopId } = req.body || {};

    if (!phone) {
      return res.status(400).json({ error: 'Número de telefone é obrigatório' });
    }

    const normalizedPhone = String(phone).replace(/\D/g, '');
    const messageText = message || '';
    let finalBarbershopId = barbershopId;

    if (barbershopId === 'local-test') {
      const firstBarbershop = await pool.query('SELECT id, name FROM barbershops ORDER BY created_at ASC LIMIT 1');
      try {
        finalBarbershopId = safeExtractId(firstBarbershop, 'handleWebhook - SELECT barbershops (local-test)');
        if (!finalBarbershopId) {
          return res.status(400).json({ error: 'Nenhuma barbearia cadastrada' });
        }
      } catch (error) {
        logger.error({ err: error }, 'Erro ao extrair barbershop ID no webhook');
        return res.status(500).json({ error: 'Erro ao processar: ' + error.message });
      }
    }

    const barbershopResult = await pool.query('SELECT name FROM barbershops WHERE id = $1', [finalBarbershopId]);
    if (!barbershopResult.rows?.length) {
      return res.status(404).json({ error: 'Barbearia não encontrada' });
    }

    const barbershopName = barbershopResult.rows[0].name || 'Barbearia';
    const config = await getBotConfig(finalBarbershopId);
    const menuOptions = await getMenuOptions(finalBarbershopId);

    const session = await getSession(normalizedPhone, finalBarbershopId);

    if (!session || isSessionExpired(session)) {
      if (session) {
        await deleteSession(normalizedPhone, finalBarbershopId);
      }
      await createSession(normalizedPhone, finalBarbershopId);

      const welcomeMessage = buildWelcomeMessage(config.welcome_header, menuOptions, barbershopName);

      if (barbershopId === 'local-test') {
        return res.json({ success: true, botResponse: welcomeMessage });
      }

      await sendWhatsAppMessage(normalizedPhone, welcomeMessage);
      return res.json({ success: true });
    }

    const response = await processMessage(normalizedPhone, messageText, session, finalBarbershopId, config, menuOptions);

    if (barbershopId === 'local-test') {
      return res.json({ success: true, botResponse: response?.message || 'Sem resposta' });
    }

    if (response?.message) {
      await sendWhatsAppMessage(normalizedPhone, response.message);
    }
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Erro no webhook WhatsApp');
    res.status(500).json({ error: 'Erro ao processar mensagem', details: error.message });
  }
};

// ==================== PROCESS MESSAGE ====================

const processMessage = async (phone, message, session, barbershopId, config, menuOptions) => {
  const step = session.step;
  const data = session.data || {};
  const trimmed = (message || '').trim();

  // Encerrar atendimento em qualquer etapa
  const endSessionOption = menuOptions.find(o => o.handler === 'end_session');
  if (endSessionOption) {
    const endIndex = menuOptions.indexOf(endSessionOption) + 1;
    if (trimmed === String(endIndex)) {
      return await endSession(phone, barbershopId, config);
    }
  }

  switch (step) {
    case STEPS.MENU:
      return await handleMenuChoice(phone, message, barbershopId, config, menuOptions);
    case STEPS.CHOOSE_SERVICE:
      return await handleServiceChoice(phone, message, barbershopId, data, config);
    case STEPS.ASK_NAME:
      return await handleNameCapture(phone, message, barbershopId, data, config);
    case STEPS.CHOOSE_BARBER:
      return await handleBarberChoice(phone, message, barbershopId, data, config);
    case STEPS.CHOOSE_DATE:
      return await handleDateChoice(phone, message, barbershopId, data, config);
    case STEPS.CHOOSE_TIME:
      return await handleTimeChoice(phone, message, barbershopId, data, config);
    case STEPS.CONFIRM_CANCEL:
      return await handleConfirmCancel(phone, message, barbershopId, data, config);
    case STEPS.CONFIRM_RESCHEDULE:
      return await handleConfirmReschedule(phone, message, barbershopId, data, config);
    case STEPS.SEND_RATING:
      return await handleSendRating(phone, message, barbershopId, data, config);
    case STEPS.VIEW_SERVICES:
      return await handleViewServices(phone, message, barbershopId, config);
    default:
      return { message: formatMessage(config.session_expired_message) };
  }
};

// ==================== MENU ====================

const handleMenuChoice = async (phone, choice, barbershopId, config, menuOptions) => {
  const choiceIndex = parseInt(choice) - 1;

  if (isNaN(choiceIndex) || choiceIndex < 0 || choiceIndex >= menuOptions.length) {
    return { message: formatMessage(config.invalid_option_message) };
  }

  const selected = menuOptions[choiceIndex];

  if (selected.type === 'system') {
    switch (selected.handler) {

      // ── AGENDAR ──────────────────────────────────────────────────────────
      case 'schedule': {
        const services = await pool.query(
          'SELECT * FROM services WHERE barbershop_id = $1 AND active = true ORDER BY name',
          [barbershopId]
        );

        logger.info({ barbershopId, count: services.rows.length }, '[schedule] Serviços encontrados');

        if (!services.rows.length) {
          return {
            message:
              '⚠️ Nenhum serviço cadastrado no momento.\n\n0️⃣ Voltar ao menu de atendimento',
          };
        }

        await updateSession(phone, barbershopId, STEPS.CHOOSE_SERVICE, {});

        let message = '💈 Escolha o serviço:\n\n';
        services.rows.forEach((service, index) => {
          message += `${index + 1}️⃣ ${service.name} - R$ ${parseFloat(service.price).toFixed(2)}\n`;
        });
        message += '\n0️⃣ Voltar ao menu de atendimento';
        return { message };
      }

      // ── VER SERVIÇOS ─────────────────────────────────────────────────────
      case 'view_services': {
        const services = await pool.query(
          'SELECT * FROM services WHERE barbershop_id = $1 AND active = true ORDER BY name',
          [barbershopId]
        );

        logger.info({ barbershopId, count: services.rows.length }, '[view_services] Serviços encontrados');

        if (!services.rows.length) {
          await updateSession(phone, barbershopId, STEPS.VIEW_SERVICES, {});
          return {
            message:
              '⚠️ Nenhum serviço cadastrado no momento.\n\n0️⃣ Voltar ao menu de atendimento',
          };
        }

        let message = '📋 Nossos serviços:\n\n';
        services.rows.forEach(service => {
          message += `💈 ${service.name}\n`;
          message += `💰 R$ ${parseFloat(service.price).toFixed(2)}\n`;
          message += `⏱️ ${service.duration_minutes} minutos\n\n`;
        });

        await updateSession(phone, barbershopId, STEPS.VIEW_SERVICES, {});
        message += '0️⃣ Voltar ao menu de atendimento';
        return { message };
      }

      case 'cancel':
        return await handleCancelAppointment(phone, barbershopId, config);
      case 'reschedule':
        return await handleRescheduleAppointment(phone, barbershopId, config);
      case 'rating':
        return await handlePostAttendanceEvaluation(phone, barbershopId, config);
      case 'promotions':
        return { message: formatMessage(config.promotions_message) };
      case 'instagram':
        return await handleInstagramIntegration(phone, barbershopId, config);
      case 'attendant':
        return { message: formatMessage(config.attendant_message) };
      case 'end_session':
        return await endSession(phone, barbershopId, config);
      default:
        return { message: formatMessage(config.invalid_option_message) };
    }
  }

  if (selected.type === 'custom' && selected.response_message) {
    return { message: selected.response_message };
  }

  return { message: formatMessage(config.invalid_option_message) };
};

// ==================== SCHEDULING FLOW ====================

const handleServiceChoice = async (phone, choice, barbershopId, data, config) => {
  if (choice === '0') return await goBackToMainMenu(phone, barbershopId);

  const serviceIndex = parseInt(choice) - 1;
  const services = await pool.query(
    'SELECT * FROM services WHERE barbershop_id = $1 AND active = true ORDER BY name',
    [barbershopId]
  );

  if (isNaN(serviceIndex) || serviceIndex < 0 || serviceIndex >= services.rows.length) {
    return { message: formatMessage(config.invalid_option_message) };
  }

  const selectedService = services.rows[serviceIndex];
  if (!selectedService?.id) {
    logger.error({ selectedService }, 'handleServiceChoice: selectedService.id é undefined');
    return { message: formatMessage(config.invalid_option_message) };
  }

  data.serviceId = selectedService.id;
  data.serviceName = selectedService.name;
  data.servicePrice = selectedService.price;
  data.serviceDuration = selectedService.duration_minutes;

  const client = await pool.query(
    'SELECT name FROM clients WHERE barbershop_id = $1 AND phone = $2',
    [barbershopId, phone]
  );

  if (client.rows.length > 0) {
    data.clientName = client.rows[0].name;
    await updateSession(phone, barbershopId, STEPS.CHOOSE_BARBER, data);
    return await listBarbers(barbershopId);
  } else {
    await updateSession(phone, barbershopId, STEPS.ASK_NAME, data);
    return { message: formatMessage(config.ask_name_message) };
  }
};

const handleNameCapture = async (phone, name, barbershopId, data, config) => {
  if (name === '0') return await goBackToMainMenu(phone, barbershopId);

  if (name.length < 3) {
    return { message: formatMessage(config.name_validation_message) };
  }

  data.clientName = name;
  await updateSession(phone, barbershopId, STEPS.CHOOSE_BARBER, data);
  return await listBarbers(barbershopId);
};

const listBarbers = async (barbershopId) => {
  const barbers = await pool.query(
    'SELECT * FROM barbers WHERE barbershop_id = $1 AND active = true ORDER BY name',
    [barbershopId]
  );

  if (!barbers.rows.length) {
    return { message: '⚠️ Nenhum barbeiro disponível no momento.\n\n0️⃣ Voltar ao menu de atendimento' };
  }

  let message = '👨‍🦱 *Escolha o barbeiro:*\n\n';
  barbers.rows.forEach((barber, index) => {
    message += `${index + 1}️⃣ ${barber.name}\n`;
  });
  message += '\n0️⃣ Voltar ao menu de atendimento';
  return { message };
};

const handleBarberChoice = async (phone, choice, barbershopId, data, config) => {
  if (choice === '0') return await goBackToMainMenu(phone, barbershopId);

  const barberIndex = parseInt(choice) - 1;
  const barbers = await pool.query(
    'SELECT * FROM barbers WHERE barbershop_id = $1 AND active = true ORDER BY name',
    [barbershopId]
  );

  if (isNaN(barberIndex) || barberIndex < 0 || barberIndex >= barbers.rows.length) {
    return { message: formatMessage(config.invalid_option_message) + '\n\n0️⃣ Voltar ao menu de atendimento' };
  }

  const selectedBarber = barbers.rows[barberIndex];
  if (!selectedBarber?.id) {
    logger.error({ selectedBarber }, 'handleBarberChoice: selectedBarber.id é undefined');
    return { message: formatMessage(config.invalid_option_message) };
  }

  data.barberId = selectedBarber.id;
  data.barberName = selectedBarber.name;

  await updateSession(phone, barbershopId, STEPS.CHOOSE_DATE, data);

  const today = new Date();
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    dates.push(date);
  }

  let message = '📅 Escolha a data:\n\n';
  dates.forEach((date, index) => {
    const day = date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
    message += `${index + 1}️⃣ ${day}\n`;
  });
  message += '\n0️⃣ Voltar ao menu de atendimento';
  return { message };
};

const handleDateChoice = async (phone, choice, barbershopId, data, config) => {
  if (choice === '0') return await goBackToMainMenu(phone, barbershopId);

  const dateIndex = parseInt(choice) - 1;
  if (isNaN(dateIndex) || dateIndex < 0 || dateIndex >= 7) {
    return { message: formatMessage(config.invalid_option_message) + '\n\n0️⃣ Voltar ao menu de atendimento' };
  }

  const selectedDate = new Date();
  selectedDate.setDate(selectedDate.getDate() + dateIndex);
  data.date = selectedDate.toISOString().split('T')[0];

  await updateSession(phone, barbershopId, STEPS.CHOOSE_TIME, data);

  const bookedSlots = await pool.query(
    `SELECT time FROM appointments 
     WHERE barbershop_id = $1 AND barber_id = $2 
     AND date = $3 AND status != 'cancelado'`,
    [barbershopId, data.barberId, data.date]
  );

  const bookedTimes = bookedSlots.rows.map(row => row.time);
  const slots = [];
  const duration = data.serviceDuration || 30;

  for (let hour = 9; hour < 19; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;

      if (!bookedTimes.includes(time)) {
        if (duration > 30) {
          const nextMinute = minute + 30;
          const nextHour = nextMinute >= 60 ? hour + 1 : hour;
          const nextTime = `${String(nextHour).padStart(2, '0')}:${String(nextMinute % 60).padStart(2, '0')}:00`;
          if (bookedTimes.includes(nextTime)) continue;
        }
        slots.push(time.substring(0, 5));
      }
    }
  }

  if (slots.length === 0) {
    return { message: formatMessage(config.no_slots_message) };
  }

  let message = '⏰ *Escolha o melhor horário:*\n\n';
  slots.forEach((slot, index) => {
    message += `${index + 1}️⃣ ${slot}\n`;
  });
  message += '\n0️⃣ Voltar ao menu de atendimento';

  data.availableSlots = slots;
  await updateSession(phone, barbershopId, STEPS.CHOOSE_TIME, data);
  return { message };
};

const handleTimeChoice = async (phone, choice, barbershopId, data, config) => {
  if (choice === '0') return await goBackToMainMenu(phone, barbershopId);

  const timeIndex = parseInt(choice) - 1;
  if (isNaN(timeIndex) || timeIndex < 0 || timeIndex >= data.availableSlots.length) {
    return { message: formatMessage(config.invalid_option_message) + '\n\n0️⃣ Voltar ao menu de atendimento' };
  }

  const selectedTime = data.availableSlots[timeIndex];
  let clientId;

  try {
    const clientResult = await pool.query(
      'SELECT id FROM clients WHERE barbershop_id = $1 AND phone = $2',
      [barbershopId, phone]
    );

    if (clientResult.rows?.length > 0 && clientResult.rows[0].id) {
      clientId = clientResult.rows[0].id;
    }

    if (!clientId) {
      const insertResult = await pool.query(
        `INSERT INTO clients (barbershop_id, phone, name)
         VALUES ($1, $2, $3)
         ON CONFLICT (barbershop_id, phone) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [barbershopId, phone, data.clientName || 'Cliente WhatsApp']
      );

      if (!insertResult?.rows?.length) {
        logger.error({ insertResult }, 'handleTimeChoice: INSERT clients failed');
        throw new Error('Falha ao criar cliente no banco de dados');
      }

      clientId = insertResult.rows[0].id;
      if (!clientId) {
        logger.error({ row: insertResult.rows[0] }, 'handleTimeChoice: INSERT clients retornou id undefined');
        throw new Error('INSERT cliente retornou id undefined/null');
      }
    }
  } catch (error) {
    logger.error({ err: error, phone, barbershopId }, 'handleTimeChoice: Erro ao buscar ou criar cliente');
    throw error;
  }

  await pool.query(
    `INSERT INTO appointments 
     (barbershop_id, client_id, barber_id, service_id, date, time, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'confirmado')`,
    [barbershopId, clientId, data.barberId, data.serviceId, data.date, selectedTime + ':00']
  );

  await deleteSession(phone, barbershopId);

  const dateFormatted = new Date(data.date).toLocaleDateString('pt-BR');
  const message = formatMessage(config.confirmation_message, {
    serviceName: data.serviceName,
    barberName: data.barberName,
    dateFormatted,
    time: selectedTime,
    servicePrice: data.servicePrice,
  });

  logger.info(
    { phone, barbershopId, serviceId: data.serviceId, barberId: data.barberId, date: data.date, time: selectedTime },
    'Agendamento criado via WhatsApp bot'
  );

  return { message };
};

// ==================== NAVIGATION ====================

const handleViewServices = async (phone, choice, barbershopId, config) => {
  if (choice === '0') return await goBackToMainMenu(phone, barbershopId);

  const menuOptions = await getMenuOptions(barbershopId);
  await updateSession(phone, barbershopId, STEPS.MENU, {});
  return await handleMenuChoice(phone, choice, barbershopId, config, menuOptions);
};

export const goBackToMainMenu = async (phone, barbershopId) => {
  await updateSession(phone, barbershopId, STEPS.MENU, {});
  const barbershop = await pool.query('SELECT name FROM barbershops WHERE id = $1', [barbershopId]);
  const barbershopName = barbershop.rows[0]?.name || 'Barbearia';
  const configData = await getBotConfig(barbershopId);
  const menuOptions = await getMenuOptions(barbershopId);
  const message = buildWelcomeMessage(configData.welcome_header, menuOptions, barbershopName);
  return { message };
};

const endSession = async (phone, barbershopId, config) => {
  await deleteSession(phone, barbershopId);
  return { message: formatMessage(config.end_session_message) };
};

const handleInstagramIntegration = async (phone, barbershopId, config) => {
  try {
    const barbershop = await pool.query(
      'SELECT instagram_handle FROM barbershops WHERE id = $1',
      [barbershopId]
    );

    let instagramHandle = '@barbearia_nome';
    if (barbershop.rows?.[0]?.instagram_handle) {
      instagramHandle = barbershop.rows[0].instagram_handle;
    }

    return { message: formatMessage(config.instagram_message, { instagramHandle }) };
  } catch (error) {
    logger.error({ err: error }, 'Erro ao buscar informações do Instagram');
    return { message: formatMessage(config.instagram_message, { instagramHandle: '@suabarbearia' }) };
  }
};