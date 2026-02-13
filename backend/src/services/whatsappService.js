import axios from 'axios';
import pool from '../config/database.js';

const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL;
const WHATSAPP_API_KEY = process.env.WHATSAPP_API_KEY;

export const sendWhatsAppMessage = async (phone, message) => {
  try {
    await axios.post(
      `${WHATSAPP_API_URL}/send-text`,
      {
        phone: phone,
        message: message
      },
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return true;
  } catch (error) {
    console.error('Erro ao enviar mensagem WhatsApp:', error);
    return false;
  }
};

export const handleWebhook = async (req, res) => {
  try {
    const { phone, message, barbershopId } = req.body;

    const normalizedPhone = phone.replace(/\D/g, '');

    let session = await pool.query(
      'SELECT * FROM whatsapp_sessions WHERE phone = $1 AND barbershop_id = $2 ORDER BY updated_at DESC LIMIT 1',
      [normalizedPhone, barbershopId]
    );

    if (session.rows.length === 0 || 
        (new Date() - new Date(session.rows[0].updated_at)) > 1800000) {
      
      await pool.query(
        `INSERT INTO whatsapp_sessions (phone, barbershop_id, step, data)
         VALUES ($1, $2, 'menu', '{}')`,
        [normalizedPhone, barbershopId]
      );

      const barbershop = await pool.query(
        'SELECT name FROM barbershops WHERE id = $1',
        [barbershopId]
      );

      const welcomeMessage = `Olá 👋 Bem-vindo à ${barbershop.rows[0].name}\n\n` +
        `Escolha uma opção:\n` +
        `1️⃣ Agendar horário\n` +
        `2️⃣ Ver serviços\n` +
        `3️⃣ Falar com atendente`;

      await sendWhatsAppMessage(normalizedPhone, welcomeMessage);
      return res.json({ success: true });
    }

    session = session.rows[0];

    const response = await processMessage(normalizedPhone, message, session, barbershopId);
    
    await sendWhatsAppMessage(normalizedPhone, response.message);

    res.json({ success: true });

  } catch (error) {
    console.error('Erro no webhook WhatsApp:', error);
    res.status(500).json({ error: 'Erro ao processar mensagem' });
  }
};

const processMessage = async (phone, message, session, barbershopId) => {
  const step = session.step;
  const data = session.data || {};

  switch (step) {
    case 'menu':
      return await handleMenuChoice(phone, message, barbershopId);

    case 'choose_service':
      return await handleServiceChoice(phone, message, barbershopId, data);

    case 'choose_barber':
      return await handleBarberChoice(phone, message, barbershopId, data);

    case 'choose_date':
      return await handleDateChoice(phone, message, barbershopId, data);

    case 'choose_time':
      return await handleTimeChoice(phone, message, barbershopId, data);

    default:
      return { message: 'Algo deu errado. Digite qualquer coisa para voltar ao menu.' };
  }
};

const handleMenuChoice = async (phone, choice, barbershopId) => {
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
    return { message: 'Um atendente entrará em contato em breve! 👨‍💼' };
  }

  return { message: 'Opção inválida. Por favor, escolha 1, 2 ou 3.' };
};

const handleServiceChoice = async (phone, choice, barbershopId, data) => {
  const serviceIndex = parseInt(choice) - 1;

  const services = await pool.query(
    'SELECT * FROM services WHERE barbershop_id = $1 AND active = true ORDER BY name',
    [barbershopId]
  );

  if (serviceIndex < 0 || serviceIndex >= services.rows.length) {
    return { message: 'Serviço inválido. Escolha um número da lista.' };
  }

  const selectedService = services.rows[serviceIndex];
  data.serviceId = selectedService.id;
  data.serviceName = selectedService.name;
  data.servicePrice = selectedService.price;

  await updateSession(phone, barbershopId, 'choose_barber', data);

  const barbers = await pool.query(
    'SELECT * FROM barbers WHERE barbershop_id = $1 AND active = true ORDER BY name',
    [barbershopId]
  );

  let message = '👨‍🦱 Escolha o barbeiro:\n\n';
  barbers.rows.forEach((barber, index) => {
    message += `${index + 1}️⃣ ${barber.name}\n`;
  });

  return { message };
};

const handleBarberChoice = async (phone, choice, barbershopId, data) => {
  const barberIndex = parseInt(choice) - 1;

  const barbers = await pool.query(
    'SELECT * FROM barbers WHERE barbershop_id = $1 AND active = true ORDER BY name',
    [barbershopId]
  );

  if (barberIndex < 0 || barberIndex >= barbers.rows.length) {
    return { message: 'Barbeiro inválido. Escolha um número da lista.' };
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

const handleDateChoice = async (phone, choice, barbershopId, data) => {
  const dateIndex = parseInt(choice) - 1;

  if (dateIndex < 0 || dateIndex >= 7) {
    return { message: 'Data inválida. Escolha um número da lista.' };
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
  for (let hour = 9; hour < 19; hour++) {
    for (let minute = 0; minute < 60; minute += 60) {
      const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
      if (!bookedTimes.includes(time)) {
        slots.push(time.substring(0, 5));
      }
    }
  }

  let message = '⏰ Escolha o horário:\n\n';
  slots.forEach((slot, index) => {
    message += `${index + 1}️⃣ ${slot}\n`;
  });

  data.availableSlots = slots;
  await updateSession(phone, barbershopId, 'choose_time', data);

  return { message };
};

const handleTimeChoice = async (phone, choice, barbershopId, data) => {
  const timeIndex = parseInt(choice) - 1;

  if (timeIndex < 0 || timeIndex >= data.availableSlots.length) {
    return { message: 'Horário inválido. Escolha um número da lista.' };
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
      [barbershopId, phone, 'Cliente WhatsApp']
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

  const message = `✅ Seu horário foi agendado com sucesso! 💈\n\n` +
    `📋 Serviço: ${data.serviceName}\n` +
    `👨‍🦱 Barbeiro: ${data.barberName}\n` +
    `📅 Data: ${dateFormatted}\n` +
    `⏰ Horário: ${selectedTime}\n` +
    `💰 Valor: R$ ${data.servicePrice}\n\n` +
    `Até lá! 👋`;

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
