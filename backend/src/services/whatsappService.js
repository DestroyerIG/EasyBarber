import pool from '../config/database.js';
import { getWhatsAppClient } from './whatsappClient.js';

/**
 * Envia mensagem via whatsapp-web.js
 * @param {string} phone - Número do telefone (ex: 5511999999999)
 * @param {string} message - Texto da mensagem
 */
export const sendWhatsAppMessage = async (phone, message) => {
  try {
    const client = getWhatsAppClient();
    if (!client) {
      console.error('⚠️  WhatsApp não está conectado. Mensagem não enviada.');
      return false;
    }

    // Formato do chatId no whatsapp-web.js: número@c.us
    const chatId = `${phone}@c.us`;
    await client.sendMessage(chatId, message);
    console.log(`✅ Mensagem enviada para ${phone}`);
    return true;
  } catch (error) {
    console.error('❌ Erro ao enviar mensagem WhatsApp:', error);
    return false;
  }
};

/**
 * Busca configuração de mensagens do bot
 */
const getBotConfig = async (barbershopId) => {
  try {
    const result = await pool.query(
      'SELECT * FROM whatsapp_bot_config WHERE barbershop_id = $1',
      [barbershopId]
    );

    const defaultConfig = {
      welcome_message: 'Olá 👋 Bem-vindo à {nome_barbearia}!\n\nMe chame de *BarberBot* 🤖 e estou aqui para agilizar seu atendimento.\n\nComo posso ajudar hoje?\n\n1️⃣ *Agendar um horário*\n2️⃣ Ver nossos serviços\n3️⃣ Falar com um humano 👨‍💼',
      ask_name_message: 'Vejo que é sua primeira vez aqui! 😊\n\nQual o seu *nome completo*?',
      attendant_message: 'Um atendente entrará em contato em breve! 👨‍💼',
      confirmation_message: '✅ Seu horário foi agendado com sucesso! 💈\n\n📋 Serviço: {servico}\n👨‍🦱 Barbeiro: {barbeiro}\n📅 Data: {data}\n⏰ Horário: {horario}\n💰 Valor: R$ {valor}\n\nAté lá! 👋',
      invalid_option_message: 'Opção inválida. Por favor, escolha um número da lista.',
      session_expired_message: '⏰ Sua sessão expirou por inatividade.\n\nDigite qualquer coisa para começar novamente.'
    };

    if (result.rows.length > 0) {
      const dbConfig = result.rows[0];
      // Mesclar com padrões para evitar nulos
      return {
        welcome_message: dbConfig.welcome_message || defaultConfig.welcome_message,
        ask_name_message: dbConfig.ask_name_message || defaultConfig.ask_name_message,
        attendant_message: dbConfig.attendant_message || defaultConfig.attendant_message,
        confirmation_message: dbConfig.confirmation_message || defaultConfig.confirmation_message,
        invalid_option_message: dbConfig.invalid_option_message || defaultConfig.invalid_option_message,
        session_expired_message: dbConfig.session_expired_message || defaultConfig.session_expired_message
      };
    }

    return defaultConfig;
  } catch (error) {
    console.error('Erro ao buscar config do bot:', error);
    return {
      welcome_message: 'Olá 👋 Bem-vindo!',
      ask_name_message: 'Qual o seu nome?',
      attendant_message: 'Aguarde um momento.',
      confirmation_message: 'Agendado!',
      invalid_option_message: 'Opção inválida.',
      session_expired_message: 'Sessão expirada.'
    };
  }
};

/**
 * Substitui placeholders nas mensagens
 */
const formatMessage = (template, data = {}) => {
  if (!template) return '';

  let message = template;
  const placeholders = {
    '{nome_barbearia}': data.barbershopName || '',
    '{servico}': data.serviceName || '',
    '{barbeiro}': data.barberName || '',
    '{data}': data.dateFormatted || '',
    '{horario}': data.time || '',
    '{valor}': data.servicePrice || '',
    '{nome_cliente}': data.clientName || ''
  };

  for (const [key, value] of Object.entries(placeholders)) {
    message = message.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value || '');
  }

  return message;
};

/**
 * Handler para mensagens recebidas via whatsapp-web.js
 * Chamado pelo whatsappClient.js no evento 'message'
 */
export const handleIncomingMessage = async (phone, text) => {
  try {
    if (!phone) {
      console.warn('⚠️  Recebida mensagem sem número de telefone.');
      return;
    }

    const normalizedPhone = String(phone).replace(/\D/g, '');
    const messageText = text || '';

    // Buscar a barbearia que tem esse bot ativo
    const barbershopResult = await pool.query('SELECT id, name FROM barbershops ORDER BY created_at ASC LIMIT 1');
    if (!barbershopResult.rows || barbershopResult.rows.length === 0) {
      console.log('⚠️  Nenhuma barbearia cadastrada. O bot não pode responder.');
      return;
    }

    const barbershopId = barbershopResult.rows[0].id;
    const barbershopName = barbershopResult.rows[0].name || 'Barbearia';

    const config = await getBotConfig(barbershopId);

    // Verificar sessão existente
    const sessionResult = await pool.query(
      'SELECT * FROM whatsapp_sessions WHERE phone = $1 AND barbershop_id = $2 ORDER BY updated_at DESC LIMIT 1',
      [normalizedPhone, barbershopId]
    );

    const hasNoSession = !sessionResult.rows || sessionResult.rows.length === 0;
    const isSessionExpired = !hasNoSession && (new Date() - new Date(sessionResult.rows[0].updated_at)) > 1800000;

    if (hasNoSession || isSessionExpired) {
      if (!hasNoSession) {
        // Limpar sessões antigas
        await pool.query('DELETE FROM whatsapp_sessions WHERE phone = $1 AND barbershop_id = $2', [normalizedPhone, barbershopId]);
      }

      await pool.query(
        `INSERT INTO whatsapp_sessions (phone, barbershop_id, step, data)
         VALUES ($1, $2, 'menu', '{}')`,
        [normalizedPhone, barbershopId]
      );

      const welcomeMessage = formatMessage(config.welcome_message, { barbershopName });
      await sendWhatsAppMessage(normalizedPhone, welcomeMessage);
      return;
    }

    const session = sessionResult.rows[0];
    console.log(`🔄 Continuando sessão de ${normalizedPhone} no passo ${session.step}`);

    const response = await processMessage(normalizedPhone, messageText, session, barbershopId, config);
    if (response && response.message) {
      await sendWhatsAppMessage(normalizedPhone, response.message);
    }
  } catch (error) {
    console.error('❌ Erro ao processar mensagem recebida:', error.message);
  }
};

/**
 * Handler do webhook — mantido para o simulador local-test
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
      if (!firstBarbershop.rows || firstBarbershop.rows.length === 0) {
        return res.status(400).json({ error: 'Nenhuma barbearia cadastrada' });
      }
      finalBarbershopId = firstBarbershop.rows[0].id;
    }

    const barbershopResult = await pool.query('SELECT name FROM barbershops WHERE id = $1', [finalBarbershopId]);
    if (!barbershopResult.rows || barbershopResult.rows.length === 0) {
      return res.status(404).json({ error: 'Barbearia não encontrada' });
    }

    const barbershopName = barbershopResult.rows[0].name || 'Barbearia';
    const config = await getBotConfig(finalBarbershopId);

    let sessionResult = await pool.query(
      'SELECT * FROM whatsapp_sessions WHERE phone = $1 AND barbershop_id = $2 ORDER BY updated_at DESC LIMIT 1',
      [normalizedPhone, finalBarbershopId]
    );

    const hasNoSession = !sessionResult.rows || sessionResult.rows.length === 0;
    const isSessionExpired = !hasNoSession && (new Date() - new Date(sessionResult.rows[0].updated_at)) > 1800000;

    if (hasNoSession || isSessionExpired) {
      if (!hasNoSession) {
        await pool.query('DELETE FROM whatsapp_sessions WHERE phone = $1 AND barbershop_id = $2', [normalizedPhone, finalBarbershopId]);
      }

      await pool.query(
        `INSERT INTO whatsapp_sessions (phone, barbershop_id, step, data)
         VALUES ($1, $2, 'menu', '{}')`,
        [normalizedPhone, finalBarbershopId]
      );

      const welcomeMessage = formatMessage(config.welcome_message, { barbershopName });

      if (barbershopId === 'local-test') {
        return res.json({ success: true, botResponse: welcomeMessage });
      }

      await sendWhatsAppMessage(normalizedPhone, welcomeMessage);
      return res.json({ success: true });
    }

    const session = sessionResult.rows[0];
    const response = await processMessage(normalizedPhone, messageText, session, finalBarbershopId, config);

    if (barbershopId === 'local-test') {
      return res.json({ success: true, botResponse: response?.message || 'Sem resposta' });
    }

    if (response && response.message) {
      await sendWhatsAppMessage(normalizedPhone, response.message);
    }
    res.json({ success: true });

  } catch (error) {
    console.error('❌ Erro no webhook WhatsApp:', error.message);
    res.status(500).json({ error: 'Erro ao processar mensagem', details: error.message });
  }
};

// ==================== LÓGICA DO BOT ====================

const processMessage = async (phone, message, session, barbershopId, config) => {
  const step = session.step;
  const data = session.data || {};

  switch (step) {
    case 'menu':
      return await handleMenuChoice(phone, message, barbershopId, config);

    case 'choose_service':
      return await handleServiceChoice(phone, message, barbershopId, data, config);

    case 'ask_name':
      return await handleNameCapture(phone, message, barbershopId, data, config);

    case 'choose_barber':
      return await handleBarberChoice(phone, message, barbershopId, data, config);

    case 'choose_date':
      return await handleDateChoice(phone, message, barbershopId, data, config);

    case 'choose_time':
      return await handleTimeChoice(phone, message, barbershopId, data, config);

    default:
      return { message: formatMessage(config.session_expired_message) };
  }
};

const handleMenuChoice = async (phone, choice, barbershopId, config) => {
  if (choice === '1') {
    await updateSession(phone, barbershopId, 'choose_service', {});

    const services = await pool.query(
      'SELECT * FROM services WHERE barbershop_id = $1 AND active = true',
      [barbershopId]
    );

    let message = '💈 Escolha o serviço:\n\n';
    services.rows.forEach((service, index) => {
      message += `${index + 1}️⃣ ${service.name} - R$ ${service.price}\n`;
    });

    return { message };

  } else if (choice === '2') {
    const services = await pool.query(
      'SELECT * FROM services WHERE barbershop_id = $1 AND active = true',
      [barbershopId]
    );

    let message = '📋 Nossos serviços:\n\n';
    services.rows.forEach(service => {
      message += `💈 ${service.name}\n`;
      message += `💰 R$ ${service.price}\n`;
      message += `⏱️ ${service.duration_minutes} minutos\n\n`;
    });

    message += 'Digite qualquer coisa para voltar ao menu.';
    return { message };

  } else if (choice === '3') {
    return { message: formatMessage(config.attendant_message) };
  }

  return { message: formatMessage(config.invalid_option_message) };
};

const handleServiceChoice = async (phone, choice, barbershopId, data, config) => {
  const serviceIndex = parseInt(choice) - 1;

  const services = await pool.query(
    'SELECT * FROM services WHERE barbershop_id = $1 AND active = true ORDER BY name',
    [barbershopId]
  );

  if (serviceIndex < 0 || serviceIndex >= services.rows.length) {
    return { message: formatMessage(config.invalid_option_message) };
  }

  const selectedService = services.rows[serviceIndex];
  data.serviceId = selectedService.id;
  data.serviceName = selectedService.name;
  data.servicePrice = selectedService.price;
  data.serviceDuration = selectedService.duration_minutes;

  // Verificar se o cliente já existe
  const client = await pool.query(
    'SELECT name FROM clients WHERE barbershop_id = $1 AND phone = $2',
    [barbershopId, phone]
  );

  if (client.rows.length > 0) {
    data.clientName = client.rows[0].name;
    await updateSession(phone, barbershopId, 'choose_barber', data);
    return await listBarbers(barbershopId);
  } else {
    await updateSession(phone, barbershopId, 'ask_name', data);
    return { message: formatMessage(config.ask_name_message) };
  }
};

const handleNameCapture = async (phone, name, barbershopId, data, config) => {
  if (name.length < 3) {
    return { message: 'Por favor, digite seu nome completo para continuarmos.' };
  }

  data.clientName = name;
  await updateSession(phone, barbershopId, 'choose_barber', data);
  return await listBarbers(barbershopId);
};

const listBarbers = async (barbershopId) => {
  const barbers = await pool.query(
    'SELECT * FROM barbers WHERE barbershop_id = $1 AND active = true ORDER BY name',
    [barbershopId]
  );

  let message = '👨‍🦱 *Escolha o barbeiro:*\n\n';
  barbers.rows.forEach((barber, index) => {
    message += `${index + 1}️⃣ ${barber.name}\n`;
  });

  return { message };
};

const handleBarberChoice = async (phone, choice, barbershopId, data, config) => {
  const barberIndex = parseInt(choice) - 1;

  const barbers = await pool.query(
    'SELECT * FROM barbers WHERE barbershop_id = $1 AND active = true ORDER BY name',
    [barbershopId]
  );

  if (barberIndex < 0 || barberIndex >= barbers.rows.length) {
    return { message: formatMessage(config.invalid_option_message) };
  }

  const selectedBarber = barbers.rows[barberIndex];
  data.barberId = selectedBarber.id;
  data.barberName = selectedBarber.name;

  await updateSession(phone, barbershopId, 'choose_date', data);

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

  return { message };
};

const handleDateChoice = async (phone, choice, barbershopId, data, config) => {
  const dateIndex = parseInt(choice) - 1;

  if (dateIndex < 0 || dateIndex >= 7) {
    return { message: formatMessage(config.invalid_option_message) };
  }

  const selectedDate = new Date();
  selectedDate.setDate(selectedDate.getDate() + dateIndex);
  data.date = selectedDate.toISOString().split('T')[0];

  await updateSession(phone, barbershopId, 'choose_time', data);

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
    return { message: 'Infelizmente não há horários disponíveis com este barbeiro nesta data. Escolha outra data ou barbeiro.' };
  }

  let message = '⏰ *Escolha o melhor horário:*\n\n';
  slots.forEach((slot, index) => {
    message += `${index + 1}️⃣ ${slot}\n`;
  });

  data.availableSlots = slots;
  await updateSession(phone, barbershopId, 'choose_time', data);

  return { message };
};

const handleTimeChoice = async (phone, choice, barbershopId, data, config) => {
  const timeIndex = parseInt(choice) - 1;

  if (timeIndex < 0 || timeIndex >= data.availableSlots.length) {
    return { message: formatMessage(config.invalid_option_message) };
  }

  const selectedTime = data.availableSlots[timeIndex];

  let client = await pool.query(
    'SELECT id FROM clients WHERE barbershop_id = $1 AND phone = $2',
    [barbershopId, phone]
  );

  if (client.rows.length === 0) {
    client = await pool.query(
      `INSERT INTO clients (barbershop_id, phone, name)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [barbershopId, phone, data.clientName || 'Cliente WhatsApp']
    );
  }

  const clientId = client.rows[0].id;

  await pool.query(
    `INSERT INTO appointments 
     (barbershop_id, client_id, barber_id, service_id, date, time, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'confirmado')`,
    [barbershopId, clientId, data.barberId, data.serviceId, data.date, selectedTime + ':00']
  );

  await pool.query(
    'DELETE FROM whatsapp_sessions WHERE phone = $1 AND barbershop_id = $2',
    [phone, barbershopId]
  );

  const dateFormatted = new Date(data.date).toLocaleDateString('pt-BR');

  const message = formatMessage(config.confirmation_message, {
    serviceName: data.serviceName,
    barberName: data.barberName,
    dateFormatted: dateFormatted,
    time: selectedTime,
    servicePrice: data.servicePrice
  });

  return { message };
};

const updateSession = async (phone, barbershopId, step, data) => {
  await pool.query(
    `UPDATE whatsapp_sessions 
     SET step = $1, data = $2, updated_at = CURRENT_TIMESTAMP
     WHERE phone = $3 AND barbershop_id = $4`,
    [step, JSON.stringify(data), phone, barbershopId]
  );
};
