import pool from '../config/database.js';
import { getWhatsAppClient } from './whatsappClient.js';
import logger from '../utils/logger.js';

/**
 * Valida resultado de query e extrai um ID com segurança
 * @param {Object} queryResult - Resultado da query do PostgreSQL
 * @param {string} context - Descrição do contexto (para logging)
 * @returns {number|null} ID extraído ou null se inválido
 * @throws {Error} Se resultado está malformado
 */
const safeExtractId = (queryResult, context) => {
  if (!queryResult) {
    logger.error({ context }, 'Query result é null/undefined');
    throw new Error(`${context}: query result malformado`);
  }
  
  if (!queryResult.rows) {
    logger.error({ context, queryResult }, 'Query result não tem propriedade rows');
    throw new Error(`${context}: rows property missing`);
  }
  
  if (!Array.isArray(queryResult.rows) || queryResult.rows.length === 0) {
    logger.warn({ context }, 'Nenhuma linha retornada pela query');
    return null;
  }
  
  const id = queryResult.rows[0].id;
  if (typeof id === 'undefined' || id === null) {
    logger.error({ context, row: queryResult.rows[0] }, 'ID é undefined/null');
    throw new Error(`${context}: id property missing or null`);
  }
  
  return id;
};

/**
 * Envia mensagem via whatsapp-web.js
 * @param {string} phone - Número do telefone (ex: 5511999999999)
 * @param {string} message - Texto da mensagem
 */
export const sendWhatsAppMessage = async (phone, message) => {
  try {
    const client = getWhatsAppClient();
    if (!client) {
      logger.warn('WhatsApp não conectado. Mensagem não enviada.');
      return false;
    }

    const chatId = `${phone}@c.us`;
    await client.sendMessage(chatId, message);
    logger.debug({ phone }, 'Mensagem enviada');
    return true;
  } catch (error) {
    logger.error({ err: error, phone }, 'Erro ao enviar mensagem WhatsApp');
    return false;
  }
};

/**
 * Busca configuração de mensagens do bot (todas as mensagens configuráveis)
 */
const getBotConfig = async (barbershopId) => {
  try {
    const result = await pool.query(
      'SELECT * FROM whatsapp_bot_config WHERE barbershop_id = $1',
      [barbershopId]
    );

    const defaultConfig = {
      welcome_header: 'Olá 👋 Bem-vindo à {nome_barbearia}!\n\nMe chame de *EasyBarber Bot* 🤖 e estou aqui para agilizar seu atendimento.\n\nComo posso ajudar hoje?',
      ask_name_message: 'Vejo que é sua primeira vez aqui! 😊\n\nQual o seu *nome completo*?',
      attendant_message: 'Um atendente entrará em contato em breve! 👨‍💼',
      confirmation_message: '✅ Seu horário foi agendado com sucesso! 💈\n\n📋 Serviço: {servico}\n👨‍🦱 Barbeiro: {barbeiro}\n📅 Data: {data}\n⏰ Horário: {horario}\n💰 Valor: R$ {valor}\n\nAté lá! 👋',
      reminder_message: '⏰ Lembrete!\n\nOlá {nome_cliente}!\n\nSeu horário é daqui a 2 horas:\n📋 {servico}\n👨‍🦱 Barbeiro: {barbeiro}\n⏰ {horario}\n\nTe esperamos! 💈',
      invalid_option_message: 'Opção inválida. Por favor, escolha um número da lista.',
      session_expired_message: '⏰ Sua sessão expirou por inatividade.\n\nDigite qualquer coisa para começar novamente.',
      end_session_message: '✅ Atendimento encerrado.\n\nSe precisar novamente, é só mandar uma nova mensagem.',
      name_validation_message: 'Por favor, digite seu nome completo para continuarmos.\n\n0️⃣ Ou digite 0 para voltar ao menu de atendimento',
      no_slots_message: 'Infelizmente não há horários disponíveis com este barbeiro nesta data. Escolha outra data ou barbeiro.\n\n0️⃣ Voltar ao menu de atendimento',
      cancel_no_appointments_message: '📋 Você não tem agendamentos próximos para cancelar.\n\nSe deseja agendar, escolha a opção 1️⃣',
      cancel_list_message: '❌ Seus agendamentos próximos:',
      cancel_success_message: '✅ Seu agendamento foi cancelado com sucesso!\n\nSe deseja remarcar ou agende um novo horário.',
      reschedule_no_appointments_message: '📋 Você não tem agendamentos para reagendar.\n\nSe deseja agendar, escolha a opção 1️⃣',
      reschedule_list_message: '🔄 Seus agendamentos disponíveis para reagendamento:',
      no_previous_appointments_message: '📊 Você não tem atendimentos anteriores para avaliar.\n\nVolte após seu próximo corte! 💇',
      rating_question_message: '⭐ *Como foi seu atendimento?*\n\n1️⃣ Excelente! 😍\n2️⃣ Bom 😊\n3️⃣ Pode melhorar 😐\n4️⃣ Ruim 😞\n\n0️⃣ Voltar ao menu de atendimento\n\nSua opinião nos ajuda a melhorar cada vez mais!',
      rating_confirmation_message: '✅ Obrigado pela sua avaliação: {avaliacao}\n\nSua opinião é muito importante para melhorarmos cada vez mais!\n\n👉 O que mais podemos fazer por você?',
      promotions_message: '🎉 *Promoções e Ofertas Especiais!*\n\n💈 *Desconto de 10%* em todos os serviços para clientes frequentes!\n\n💝 *Promoção do Mês:* Corte + Barba por apenas R$ 49,90\n(Válido até o final do mês)\n\n🎁 *Indique um amigo* e ganhe 5% em seu próximo atendimento!\n\nPara aproveitar as promoções, agende agora!',
      instagram_message: '📱 *Nos acompanhe no Instagram!*\n\n🎨 Veja nossos trabalhos, dicas de estilo e tendências!\n\n👉 {instagram_handle}\n\n📸 Siga-nos para:\n✨ Vê os melhores cortes\n💡 Receber dicas de beleza\n🎯 Acompanhar promoções exclusivas\n\n📲 Clique no link para nos seguir!',
    };

    if (result.rows.length > 0) {
      const dbConfig = result.rows[0];
      const merged = {};
      for (const [key, defaultValue] of Object.entries(defaultConfig)) {
        merged[key] = dbConfig[key] || defaultValue;
      }
      return merged;
    }

    return defaultConfig;
  } catch (error) {
    logger.error({ err: error }, 'Erro ao buscar config do bot');
    return {
      welcome_header: 'Olá 👋 Bem-vindo!',
      ask_name_message: 'Qual o seu nome?',
      attendant_message: 'Aguarde um momento.',
      confirmation_message: 'Agendado!',
      reminder_message: 'Lembrete: seu horário é em breve!',
      invalid_option_message: 'Opção inválida.',
      session_expired_message: 'Sessão expirada.',
      end_session_message: 'Atendimento encerrado.',
      name_validation_message: 'Digite seu nome completo.',
      no_slots_message: 'Sem horários disponíveis.',
      cancel_no_appointments_message: 'Sem agendamentos para cancelar.',
      cancel_list_message: 'Seus agendamentos:',
      cancel_success_message: 'Cancelado com sucesso!',
      reschedule_no_appointments_message: 'Sem agendamentos para reagendar.',
      reschedule_list_message: 'Seus agendamentos:',
      no_previous_appointments_message: 'Sem atendimentos anteriores.',
      rating_question_message: 'Como foi seu atendimento? (1-4)',
      rating_confirmation_message: 'Obrigado pela avaliação!',
      promotions_message: 'Confira nossas promoções!',
      instagram_message: 'Siga-nos no Instagram!',
    };
  }
};

/**
 * Busca opções do menu dinâmico do bot
 */
const getMenuOptions = async (barbershopId) => {
  try {
    const result = await pool.query(
      `SELECT * FROM whatsapp_menu_options 
       WHERE barbershop_id = $1 AND active = true 
       ORDER BY option_order ASC`,
      [barbershopId]
    );

    if (result.rows.length > 0) {
      return result.rows;
    }

    // Se não há opções, criar as padrões
    await seedDefaultMenuOptions(barbershopId);
    const seeded = await pool.query(
      `SELECT * FROM whatsapp_menu_options 
       WHERE barbershop_id = $1 AND active = true 
       ORDER BY option_order ASC`,
      [barbershopId]
    );
    return seeded.rows;
  } catch (error) {
    logger.error({ err: error }, 'Erro ao buscar opções do menu');
    return [];
  }
};

/**
 * Seed de opções padrão do menu para uma barbearia
 */
const seedDefaultMenuOptions = async (barbershopId) => {
  const defaults = [
    { order: 1, label: 'Agendar um horário', emoji: '💈', handler: 'schedule' },
    { order: 2, label: 'Ver nossos serviços', emoji: '📋', handler: 'view_services' },
    { order: 3, label: 'Cancelar agendamento', emoji: '❌', handler: 'cancel' },
    { order: 4, label: 'Reagendamento', emoji: '🔄', handler: 'reschedule' },
    { order: 5, label: 'Avaliação pós-atendimento', emoji: '⭐', handler: 'rating' },
    { order: 6, label: 'Promoções', emoji: '🎉', handler: 'promotions' },
    { order: 7, label: 'Instagram', emoji: '📱', handler: 'instagram' },
    { order: 8, label: 'Falar com um humano', emoji: '👨‍💼', handler: 'attendant' },
    { order: 9, label: 'Encerrar atendimento', emoji: '🚪', handler: 'end_session' },
  ];

  for (const opt of defaults) {
    await pool.query(
      `INSERT INTO whatsapp_menu_options (barbershop_id, option_order, label, emoji, type, handler, active)
       VALUES ($1, $2, $3, $4, 'system', $5, true)
       ON CONFLICT (barbershop_id, option_order) DO NOTHING`,
      [barbershopId, opt.order, opt.label, opt.emoji, opt.handler]
    );
  }
};

/**
 * Gera a welcome message dinamicamente a partir do header + opções do menu
 */
const buildWelcomeMessage = (welcomeHeader, menuOptions, barbershopName) => {
  const header = formatMessage(welcomeHeader || 'Olá 👋 Bem-vindo!', { barbershopName });
  
  const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
  
  let menuText = '';
  menuOptions.forEach((opt, index) => {
    const num = index < 10 ? numberEmojis[index] : `${index + 1}.`;
    const emoji = opt.emoji ? ` ${opt.emoji}` : '';
    menuText += `\n${num} *${opt.label}*${emoji}`;
  });
  
  return header + '\n' + menuText;
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
    '{nome_cliente}': data.clientName || '',
    '{avaliacao}': data.ratingText || '',
    '{instagram_handle}': data.instagramHandle || '',
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
      logger.warn('Recebida mensagem sem número de telefone');
      return;
    }

    const normalizedPhone = String(phone).replace(/\D/g, '');
    const messageText = text || '';

    // Buscar a barbearia que tem esse bot ativo
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

      const welcomeMessage = buildWelcomeMessage(config.welcome_header, menuOptions, barbershopName);
      await sendWhatsAppMessage(normalizedPhone, welcomeMessage);
      return;
    }

    const session = sessionResult.rows[0];
    logger.debug({ phone: normalizedPhone, step: session.step }, 'Continuando sessão');

    const response = await processMessage(normalizedPhone, messageText, session, barbershopId, config, menuOptions);
    if (response && response.message) {
      await sendWhatsAppMessage(normalizedPhone, response.message);
    }
  } catch (error) {
    logger.error({ err: error }, 'Erro ao processar mensagem recebida');
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
    if (!barbershopResult.rows || barbershopResult.rows.length === 0) {
      return res.status(404).json({ error: 'Barbearia não encontrada' });
    }

    const barbershopName = barbershopResult.rows[0].name || 'Barbearia';
    const config = await getBotConfig(finalBarbershopId);
    const menuOptions = await getMenuOptions(finalBarbershopId);

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

      const welcomeMessage = buildWelcomeMessage(config.welcome_header, menuOptions, barbershopName);

      if (barbershopId === 'local-test') {
        return res.json({ success: true, botResponse: welcomeMessage });
      }

      await sendWhatsAppMessage(normalizedPhone, welcomeMessage);
      return res.json({ success: true });
    }

    const session = sessionResult.rows[0];
    const response = await processMessage(normalizedPhone, messageText, session, finalBarbershopId, config, menuOptions);

    if (barbershopId === 'local-test') {
      return res.json({ success: true, botResponse: response?.message || 'Sem resposta' });
    }

    if (response && response.message) {
      await sendWhatsAppMessage(normalizedPhone, response.message);
    }
    res.json({ success: true });

  } catch (error) {
    logger.error({ err: error }, 'Erro no webhook WhatsApp');
    res.status(500).json({ error: 'Erro ao processar mensagem', details: error.message });
  }
};

// ==================== LÓGICA DO BOT ====================

const processMessage = async (phone, message, session, barbershopId, config, menuOptions) => {
  const step = session.step;
  const data = session.data || {};

  const trimmed = (message || '').trim();

  // Encerrar atendimento em qualquer etapa — detecta dinamicamente a posição do end_session
  const endSessionOption = menuOptions.find(o => o.handler === 'end_session');
  if (endSessionOption) {
    const endIndex = menuOptions.indexOf(endSessionOption) + 1;
    if (trimmed === String(endIndex)) {
      return await endSession(phone, barbershopId, config);
    }
  }

  switch (step) {
    case 'menu':
      return await handleMenuChoice(phone, message, barbershopId, config, menuOptions);

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

    case 'confirm_cancel':
      return await handleConfirmCancel(phone, message, barbershopId, data, config);

    case 'confirm_reschedule':
      return await handleConfirmReschedule(phone, message, barbershopId, data, config);

    case 'send_rating':
      return await handleSendRating(phone, message, barbershopId, data, config);

    case 'view_services':
      return await handleViewServices(phone, message, barbershopId, config);

    default:
      return { message: formatMessage(config.session_expired_message) };
  }
};

const handleMenuChoice = async (phone, choice, barbershopId, config, menuOptions) => {
  const choiceIndex = parseInt(choice) - 1;

  if (isNaN(choiceIndex) || choiceIndex < 0 || choiceIndex >= menuOptions.length) {
    return { message: formatMessage(config.invalid_option_message) };
  }

  const selected = menuOptions[choiceIndex];

  // Opção de sistema — despachar para handler interno
  if (selected.type === 'system') {
    switch (selected.handler) {
      case 'schedule': {
        await updateSession(phone, barbershopId, 'choose_service', {});
        const services = await pool.query(
          'SELECT * FROM services WHERE barbershop_id = $1 AND active = true',
          [barbershopId]
        );
        let message = '💈 Escolha o serviço:\n\n';
        services.rows.forEach((service, index) => {
          message += `${index + 1}️⃣ ${service.name} - R$ ${service.price}\n`;
        });
        message += '\n0️⃣ Voltar ao menu de atendimento';
        return { message };
      }
      case 'view_services': {
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
        await updateSession(phone, barbershopId, 'view_services', {});
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
        return await handleAutomaticPromotions(phone, barbershopId, config);
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

  // Opção customizada — retorna a response_message configurada
  if (selected.type === 'custom' && selected.response_message) {
    return { message: selected.response_message };
  }

  return { message: formatMessage(config.invalid_option_message) };
};

const handleServiceChoice = async (phone, choice, barbershopId, data, config) => {
  // Voltar ao menu
  if (choice === '0') {
    return await goBackToMainMenu(phone, barbershopId);
  }

  const serviceIndex = parseInt(choice) - 1;

  const services = await pool.query(
    'SELECT * FROM services WHERE barbershop_id = $1 AND active = true ORDER BY name',
    [barbershopId]
  );

  if (serviceIndex < 0 || serviceIndex >= services.rows.length) {
    return { message: formatMessage(config.invalid_option_message) };
  }

  const selectedService = services.rows[serviceIndex];
  
  if (!selectedService || typeof selectedService.id === 'undefined') {
    logger.error({ selectedService }, 'handleServiceChoice: selectedService.id é undefined');
    return { message: formatMessage(config.invalid_option_message) };
  }
  
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
  // Voltar ao menu
  if (name === '0') {
    return await goBackToMainMenu(phone, barbershopId);
  }

  if (name.length < 3) {
    return { message: formatMessage(config.name_validation_message) };
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
  message += '\n0️⃣ Voltar ao menu de atendimento';

  return { message };
};

const handleBarberChoice = async (phone, choice, barbershopId, data, config) => {
  // Voltar ao menu
  if (choice === '0') {
    return await goBackToMainMenu(phone, barbershopId);
  }

  const barberIndex = parseInt(choice) - 1;

  const barbers = await pool.query(
    'SELECT * FROM barbers WHERE barbershop_id = $1 AND active = true ORDER BY name',
    [barbershopId]
  );

  if (barberIndex < 0 || barberIndex >= barbers.rows.length) {
    return { message: formatMessage(config.invalid_option_message) + '\n\n0️⃣ Voltar ao menu de atendimento' };
  }

  const selectedBarber = barbers.rows[barberIndex];
  
  if (!selectedBarber || typeof selectedBarber.id === 'undefined') {
    logger.error({ selectedBarber }, 'handleBarberChoice: selectedBarber.id é undefined');
    return { message: formatMessage(config.invalid_option_message) };
  }
  
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
  message += '\n0️⃣ Voltar ao menu de atendimento';

  return { message };
};

const handleDateChoice = async (phone, choice, barbershopId, data, config) => {
  // Voltar ao menu
  if (choice === '0') {
    return await goBackToMainMenu(phone, barbershopId);
  }

  const dateIndex = parseInt(choice) - 1;

  if (dateIndex < 0 || dateIndex >= 7) {
    return { message: formatMessage(config.invalid_option_message) + '\n\n0️⃣ Voltar ao menu de atendimento' };
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
    return { message: formatMessage(config.no_slots_message) };
  }

  let message = '⏰ *Escolha o melhor horário:*\n\n';
  slots.forEach((slot, index) => {
    message += `${index + 1}️⃣ ${slot}\n`;
  });
  message += '\n0️⃣ Voltar ao menu de atendimento';

  data.availableSlots = slots;
  await updateSession(phone, barbershopId, 'choose_time', data);

  return { message };
};

const handleTimeChoice = async (phone, choice, barbershopId, data, config) => {
  // Voltar ao menu
  if (choice === '0') {
    return await goBackToMainMenu(phone, barbershopId);
  }

  const timeIndex = parseInt(choice) - 1;

  if (timeIndex < 0 || timeIndex >= data.availableSlots.length) {
    return { message: formatMessage(config.invalid_option_message) + '\n\n0️⃣ Voltar ao menu de atendimento' };
  }

  const selectedTime = data.availableSlots[timeIndex];

  let client;
  let clientId;
  
  try {
    client = await pool.query(
      'SELECT id FROM clients WHERE barbershop_id = $1 AND phone = $2',
      [barbershopId, phone]
    );

    if (client.rows && client.rows.length > 0) {
      clientId = client.rows[0].id;
      if (typeof clientId === 'undefined' || clientId === null) {
        logger.warn('handleTimeChoice: Client SELECT retornou row sem id');
        clientId = undefined;
      }
    } else {
      clientId = undefined;
    }

    // Se não encontrou cliente, inserir novo (ON CONFLICT protege contra race condition)
    if (!clientId) {
      const insertResult = await pool.query(
        `INSERT INTO clients (barbershop_id, phone, name)
         VALUES ($1, $2, $3)
         ON CONFLICT (barbershop_id, phone) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [barbershopId, phone, data.clientName || 'Cliente WhatsApp']
      );
      
      if (!insertResult || !insertResult.rows || insertResult.rows.length === 0) {
        logger.error({ insertResult }, 'handleTimeChoice: INSERT clients failed');
        throw new Error('Falha ao criar cliente no banco de dados');
      }
      
      clientId = insertResult.rows[0].id;
      if (typeof clientId === 'undefined' || clientId === null) {
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

const handleViewServices = async (phone, choice, barbershopId, config) => {
  if (choice === '0') {
    return await goBackToMainMenu(phone, barbershopId);
  }

  // Qualquer outra entrada após visualizar serviços volta para o menu
  const menuOptions = await getMenuOptions(barbershopId);
  await updateSession(phone, barbershopId, 'menu', {});
  return await handleMenuChoice(phone, choice, barbershopId, config, menuOptions);
};

const goBackToMainMenu = async (phone, barbershopId) => {
  await updateSession(phone, barbershopId, 'menu', {});
  const barbershop = await pool.query('SELECT name FROM barbershops WHERE id = $1', [barbershopId]);
  const barbershopName = barbershop.rows[0]?.name || 'Barbearia';
  const configData = await getBotConfig(barbershopId);
  const menuOptions = await getMenuOptions(barbershopId);
  const message = buildWelcomeMessage(configData.welcome_header, menuOptions, barbershopName);
  return { message };
};

const endSession = async (phone, barbershopId, config) => {
  await pool.query(
    'DELETE FROM whatsapp_sessions WHERE phone = $1 AND barbershop_id = $2',
    [phone, barbershopId]
  );

  return {
    message: formatMessage(config.end_session_message)
  };
};
/**
 * Handler para cancelar agendamento
 */
const handleCancelAppointment = async (phone, barbershopId, config) => {
  try {
    const appointments = await pool.query(
      `SELECT id, date, time, status FROM appointments 
       WHERE barbershop_id = $1 AND client_id = (
         SELECT id FROM clients WHERE phone = $2 AND barbershop_id = $1
       ) AND status = 'confirmado' AND date >= CURRENT_DATE
       ORDER BY date DESC LIMIT 5`,
      [barbershopId, phone]
    );

    if (!appointments.rows || appointments.rows.length === 0) {
      return { message: formatMessage(config.cancel_no_appointments_message) };
    }

    let message = formatMessage(config.cancel_list_message) + '\n\n';
    appointments.rows.forEach((appointment, index) => {
      const date = new Date(appointment.date).toLocaleDateString('pt-BR');
      message += `${index + 1}️⃣ ${date} às ${appointment.time.substring(0, 5)}\n`;
    });
    message += '\n⚠️ Clique no número do agendamento para cancelar ou digite 0️⃣ para voltar ao menu de atendimento';

    await updateSession(phone, barbershopId, 'confirm_cancel', { appointments: appointments.rows });
    return { message };
  } catch (error) {
    logger.error({ err: error }, 'Erro ao listar agendamentos para cancelamento');
    return { message: 'Desculpe, ocorreu um erro ao listar os agendamentos. Tente novamente mais tarde.' };
  }
};

/**
 * Handler para reagendamento
 */
const handleRescheduleAppointment = async (phone, barbershopId, config) => {
  try {
    const appointments = await pool.query(
      `SELECT id, date, time, service_id, barber_id FROM appointments 
       WHERE barbershop_id = $1 AND client_id = (
         SELECT id FROM clients WHERE phone = $2 AND barbershop_id = $1
       ) AND status = 'confirmado' AND date >= CURRENT_DATE
       ORDER BY date DESC LIMIT 5`,
      [barbershopId, phone]
    );

    if (!appointments.rows || appointments.rows.length === 0) {
      return { message: formatMessage(config.reschedule_no_appointments_message) };
    }

    let message = formatMessage(config.reschedule_list_message) + '\n\n';
    appointments.rows.forEach((appointment, index) => {
      const date = new Date(appointment.date).toLocaleDateString('pt-BR');
      message += `${index + 1}️⃣ ${date} às ${appointment.time.substring(0, 5)}\n`;
    });
    message += '\n👉 Clique no número para reagendar ou digite 0️⃣ para voltar ao menu de atendimento';

    await updateSession(phone, barbershopId, 'confirm_reschedule', { appointments: appointments.rows });
    return { message };
  } catch (error) {
    logger.error({ err: error }, 'Erro ao listar agendamentos para reagendamento');
    return { message: 'Desculpe, ocorreu um erro ao listar os agendamentos. Tente novamente mais tarde.' };
  }
};

/**
 * Handler para avaliação pós-atendimento
 */
const handlePostAttendanceEvaluation = async (phone, barbershopId, config) => {
  try {
    const lastAppointment = await pool.query(
      `SELECT id, date, time FROM appointments 
       WHERE barbershop_id = $1 AND client_id = (
         SELECT id FROM clients WHERE phone = $2 AND barbershop_id = $1
       ) AND status = 'confirmado' AND date < CURRENT_DATE
       ORDER BY date DESC LIMIT 1`,
      [barbershopId, phone]
    );

    if (!lastAppointment.rows || lastAppointment.rows.length === 0) {
      return { message: formatMessage(config.no_previous_appointments_message) };
    }

    const message = formatMessage(config.rating_question_message);

    await updateSession(phone, barbershopId, 'send_rating', { appointmentId: lastAppointment.rows[0].id });
    return { message };
  } catch (error) {
    logger.error({ err: error }, 'Erro ao buscar avaliação');
    return { message: 'Desculpe, ocorreu um erro ao processar sua avaliação. Tente novamente mais tarde.' };
  }
};

/**
 * Handler para promoções automáticas
 */
const handleAutomaticPromotions = async (phone, barbershopId, config) => {
  return { message: formatMessage(config.promotions_message) };
};

/**
 * Handler para integração com Instagram
 */
const handleInstagramIntegration = async (phone, barbershopId, config) => {
  try {
    const barbershop = await pool.query(
      'SELECT instagram_handle FROM barbershops WHERE id = $1',
      [barbershopId]
    );

    let instagramHandle = '@barbearia_nome';
    if (barbershop.rows && barbershop.rows[0] && barbershop.rows[0].instagram_handle) {
      instagramHandle = barbershop.rows[0].instagram_handle;
    }

    return { message: formatMessage(config.instagram_message, { instagramHandle }) };
  } catch (error) {
    logger.error({ err: error }, 'Erro ao buscar informações do Instagram');
    return { message: formatMessage(config.instagram_message, { instagramHandle: '@suabarbearia' }) };
  }
};

/**
 * Handler para confirmar cancelamento de agendamento
 */
const handleConfirmCancel = async (phone, choice, barbershopId, data, config) => {
  // Voltar ao menu
  if (choice === '0' || choice.toLowerCase() === 'menu') {
    return await goBackToMainMenu(phone, barbershopId);
  }

  const appointmentIndex = parseInt(choice) - 1;

  if (!data.appointments || appointmentIndex < 0 || appointmentIndex >= data.appointments.length) {
    return { message: 'Opção inválida. Por favor, escolha um número válido.' };
  }

  const appointmentId = data.appointments[appointmentIndex].id;

  try {
    await pool.query(
      'UPDATE appointments SET status = $1 WHERE id = $2',
      ['cancelado', appointmentId]
    );

    const mainMenu = await goBackToMainMenu(phone, barbershopId);
    return { 
      message: formatMessage(config.cancel_success_message) + '\n\n' + mainMenu.message 
    };
  } catch (error) {
    logger.error({ err: error }, 'Erro ao cancelar agendamento');
    return { message: 'Desculpe, ocorreu um erro ao cancelar o agendamento. Tente novamente.' };
  }
};

/**
 * Handler para confirmar reagendamento
 */
const handleConfirmReschedule = async (phone, choice, barbershopId, data, config) => {
  // Voltar ao menu
  if (choice === '0' || choice.toLowerCase() === 'menu') {
    return await goBackToMainMenu(phone, barbershopId);
  }

  const appointmentIndex = parseInt(choice) - 1;

  if (!data.appointments || appointmentIndex < 0 || appointmentIndex >= data.appointments.length) {
    return { message: 'Opção inválida. Por favor, escolha um número válido.' };
  }

  const appointment = data.appointments[appointmentIndex];
  const newData = {
    appointmentId: appointment.id,
    serviceId: appointment.service_id,
    barberId: appointment.barber_id
  };

  await updateSession(phone, barbershopId, 'choose_date', newData);
  
  const today = new Date();
  const dates = [];

  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    dates.push(date);
  }

  let message = '📅 Escolha a nova data para reagendar:\n\n';
  dates.forEach((date, index) => {
    const day = date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
    message += `${index + 1}️⃣ ${day}\n`;
  });

  return { message };
};

/**
 * Handler para guardar avaliação do cliente
 */
const handleSendRating = async (phone, choice, barbershopId, data, config) => {
  // Voltar ao menu
  if (choice === '0') {
    return await goBackToMainMenu(phone, barbershopId);
  }

  const rating = parseInt(choice);

  if (rating < 1 || rating > 4) {
    return { message: 'Por favor, escolha uma opção válida de 1️⃣ a 4️⃣, digite 0️⃣ para voltar ao menu de atendimento ou 9️⃣ para encerrar atendimento' };
  }

  try {
    const ratingTexts = {
      1: 'Excelente! 😍',
      2: 'Bom 😊',
      3: 'Pode melhorar 😐',
      4: 'Ruim 😞'
    };

    await pool.query(
      `INSERT INTO whatsapp_ratings (barbershop_id, appointment_id, rating, created_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (appointment_id) DO UPDATE SET rating = $3`,
      [barbershopId, data.appointmentId, rating]
    );

    const mainMenu = await goBackToMainMenu(phone, barbershopId);

    return { 
      message: formatMessage(config.rating_confirmation_message, { ratingText: ratingTexts[rating] }) + '\n\n' + mainMenu.message 
    };
  } catch (error) {
    logger.error({ err: error }, 'Erro ao guardar avaliação');
    return { message: 'Obrigado pela avaliação! Seus comentários nos ajudam a melhorar.' };
  }
};