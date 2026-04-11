/**
 * whatsappBookingService.js — CORRIGIDO
 *
 * FIX Bug 5 (reagendamento): handleConfirmReschedule usava new Date(today)
 * e setDate() sem fuso local, gerando datas com offset UTC incorreto.
 * Corrigido via generateNextDays() que usa localToDateStr().
 */

import pool from '../../config/database.js';
import logger from '../../utils/logger.js';
import { STEPS, RATING_TEXTS } from './whatsappConstants.js';
import { updateSession } from './whatsappSessionService.js';
import { formatMessage } from './whatsappMessageService.js';
import { goBackToMainMenu } from './whatsappFlowService.js';

// ==================== UTILITÁRIO DE DATA (FIX Bug 5) ====================

const localToDateStr = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const generateNextDays = (count = 7) => {
  const today = new Date();
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    return localToDateStr(date);
  });
};

const formatDateBR = (dateStr, options = {}) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR', options);
};

// ==================== CANCELAMENTO ====================

export const handleCancelAppointment = async (phone, barbershopId, config) => {
  try {
    const appointments = await pool.query(
      `SELECT id, date, time, status FROM appointments
       WHERE barbershop_id=$1 AND client_id=(
         SELECT id FROM clients WHERE phone=$2 AND barbershop_id=$1
       ) AND status='confirmado' AND date>=CURRENT_DATE
       ORDER BY date DESC LIMIT 5`,
      [barbershopId, phone]
    );

    if (!appointments.rows?.length) {
      return { message: formatMessage(config.cancel_no_appointments_message) };
    }

    let message = formatMessage(config.cancel_list_message) + '\n\n';
    appointments.rows.forEach((appointment, index) => {
      const date = new Date(appointment.date).toLocaleDateString('pt-BR');
      message += `${index + 1}️⃣ ${date} às ${appointment.time.substring(0, 5)}\n`;
    });
    message += '\n⚠️ Clique no número do agendamento para cancelar ou digite 0️⃣ para voltar ao menu de atendimento';

    await updateSession(phone, barbershopId, STEPS.CONFIRM_CANCEL, { appointments: appointments.rows });
    return { message };
  } catch (error) {
    logger.error({ err: error }, 'Erro ao listar agendamentos para cancelamento');
    return { message: 'Desculpe, ocorreu um erro ao listar os agendamentos. Tente novamente mais tarde.' };
  }
};

export const handleConfirmCancel = async (phone, choice, barbershopId, data, config) => {
  if (choice === '0' || choice.toLowerCase() === 'menu') {
    return await goBackToMainMenu(phone, barbershopId);
  }

  const appointmentIndex = parseInt(choice) - 1;

  if (!data.appointments || appointmentIndex < 0 || appointmentIndex >= data.appointments.length) {
    return { message: 'Opção inválida. Por favor, escolha um número válido.' };
  }

  const appointmentId = data.appointments[appointmentIndex].id;

  try {
    await pool.query(`UPDATE appointments SET status=$1 WHERE id=$2`, ['cancelado', appointmentId]);
    const mainMenu = await goBackToMainMenu(phone, barbershopId);
    return { message: formatMessage(config.cancel_success_message) + '\n\n' + mainMenu.message };
  } catch (error) {
    logger.error({ err: error }, 'Erro ao cancelar agendamento');
    return { message: 'Desculpe, ocorreu um erro ao cancelar o agendamento. Tente novamente.' };
  }
};

// ==================== REAGENDAMENTO ====================

export const handleRescheduleAppointment = async (phone, barbershopId, config) => {
  try {
    const appointments = await pool.query(
      `SELECT id, date, time, service_id, barber_id FROM appointments
       WHERE barbershop_id=$1 AND client_id=(
         SELECT id FROM clients WHERE phone=$2 AND barbershop_id=$1
       ) AND status='confirmado' AND date>=CURRENT_DATE
       ORDER BY date DESC LIMIT 5`,
      [barbershopId, phone]
    );

    if (!appointments.rows?.length) {
      return { message: formatMessage(config.reschedule_no_appointments_message) };
    }

    let message = formatMessage(config.reschedule_list_message) + '\n\n';
    appointments.rows.forEach((appointment, index) => {
      const date = new Date(appointment.date).toLocaleDateString('pt-BR');
      message += `${index + 1}️⃣ ${date} às ${appointment.time.substring(0, 5)}\n`;
    });
    message += '\n👉 Clique no número para reagendar ou digite 0️⃣ para voltar ao menu de atendimento';

    await updateSession(phone, barbershopId, STEPS.CONFIRM_RESCHEDULE, { appointments: appointments.rows });
    return { message };
  } catch (error) {
    logger.error({ err: error }, 'Erro ao listar agendamentos para reagendamento');
    return { message: 'Desculpe, ocorreu um erro ao listar os agendamentos. Tente novamente mais tarde.' };
  }
};

export const handleConfirmReschedule = async (phone, choice, barbershopId, data, config) => {
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
    barberId: appointment.barber_id,
  };

  await updateSession(phone, barbershopId, STEPS.CHOOSE_DATE, newData);

  /**
   * FIX Bug 5 — reagendamento: o código original usava new Date(today) com
   * date.setDate() e depois toLocaleDateString(), que misturava UTC com local.
   * generateNextDays() garante strings YYYY-MM-DD no fuso local.
   */
  const dates = generateNextDays(7);

  let message = '📅 Escolha a nova data para reagendar:\n\n';
  dates.forEach((dateStr, index) => {
    const day = formatDateBR(dateStr, { weekday: 'short', day: '2-digit', month: '2-digit' });
    message += `${index + 1}️⃣ ${day}\n`;
  });

  // Persiste availableDates para que handleChooseDateStep encontre as datas corretas
  await updateSession(phone, barbershopId, STEPS.CHOOSE_DATE, {
    ...newData,
    availableDates: dates,
  });

  return { message };
};

// ==================== AVALIAÇÃO ====================

export const handlePostAttendanceEvaluation = async (phone, barbershopId, config) => {
  try {
    const lastAppointment = await pool.query(
      `SELECT id, date, time FROM appointments
       WHERE barbershop_id=$1 AND client_id=(
         SELECT id FROM clients WHERE phone=$2 AND barbershop_id=$1
       ) AND status='confirmado' AND date<CURRENT_DATE
       ORDER BY date DESC LIMIT 1`,
      [barbershopId, phone]
    );

    if (!lastAppointment.rows?.length) {
      return { message: formatMessage(config.no_previous_appointments_message) };
    }

    const message = formatMessage(config.rating_question_message);
    await updateSession(phone, barbershopId, STEPS.SEND_RATING, { appointmentId: lastAppointment.rows[0].id });
    return { message };
  } catch (error) {
    logger.error({ err: error }, 'Erro ao buscar avaliação');
    return { message: 'Desculpe, ocorreu um erro ao processar sua avaliação. Tente novamente mais tarde.' };
  }
};

export const handleSendRating = async (phone, choice, barbershopId, data, config) => {
  if (choice === '0') {
    return await goBackToMainMenu(phone, barbershopId);
  }

  const rating = parseInt(choice);

  if (rating < 1 || rating > 4) {
    return { message: 'Por favor, escolha uma opção válida de 1️⃣ a 4️⃣, digite 0️⃣ para voltar ao menu de atendimento ou 9️⃣ para encerrar atendimento' };
  }

  try {
    await pool.query(
      `INSERT INTO whatsapp_ratings (barbershop_id, appointment_id, rating, created_at)
       VALUES ($1,$2,$3,CURRENT_TIMESTAMP)
       ON CONFLICT (appointment_id) DO UPDATE SET rating=$3`,
      [barbershopId, data.appointmentId, rating]
    );

    const mainMenu = await goBackToMainMenu(phone, barbershopId);
    return {
      message: formatMessage(config.rating_confirmation_message, { ratingText: RATING_TEXTS[rating] }) + '\n\n' + mainMenu.message,
    };
  } catch (error) {
    logger.error({ err: error }, 'Erro ao guardar avaliação');
    return { message: 'Obrigado pela avaliação! Seus comentários nos ajudam a melhorar.' };
  }
};