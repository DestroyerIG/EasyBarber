/**
 * whatsappBookingService.ts — CORRIGIDO
 *
 * FIX Bug 5 (reagendamento): handleConfirmReschedule usava new Date(today)
 * e setDate() sem fuso local, gerando datas com offset UTC incorreto.
 * Corrigido via generateNextDays() que usa localToDateStr().
 */

import { Prisma } from '@prisma/client';
import logger from '../../utils/logger.js';
import { prisma } from '../../config/prisma.js';
import { STEPS, RATING_TEXTS, BotConfig } from './whatsappConstants.js';
import { updateSession } from './whatsappSessionService.js';
import { formatMessage } from './whatsappMessageService.js';
import { goBackToMainMenu } from './whatsappFlowService.js';
import { formatTimeHm } from './utils/timeUtils.js';

// ==================== UTILITÁRIO DE DATA (FIX Bug 5) ====================

const localToDateStr = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const generateNextDays = (count = 7): string[] => {
  const today = new Date();
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    return localToDateStr(date);
  });
};

const formatDateBR = (dateStr: string, options: Intl.DateTimeFormatOptions = {}): string => {
  const parts = dateStr.split('-').map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR', options);
};

// ── Appointment row shapes from raw SQL ───────────────────────────────────────

interface AppointmentListRow {
  id: string;
  date: Date;
  time: string;
  status: string;
  service_id?: string;
  barber_id?: string;
}

interface BookingMessageResult {
  message: string;
}

// ==================== CANCELAMENTO ====================

export const handleCancelAppointment = async (
  phone: string,
  barbershopId: string,
  config: BotConfig,
): Promise<BookingMessageResult> => {
  try {
    const appointments = await prisma.$queryRaw<AppointmentListRow[]>(Prisma.sql`
      SELECT id, date, time, status FROM appointments
       WHERE barbershop_id = ${barbershopId}::uuid
         AND client_id = (
           SELECT id FROM clients WHERE phone = ${phone} AND barbershop_id = ${barbershopId}::uuid
         )
         AND status = 'confirmado'
         AND date >= CURRENT_DATE
       ORDER BY date DESC LIMIT 5
    `);

    if (!appointments?.length) {
      return { message: formatMessage(config.cancel_no_appointments_message) };
    }

    let message = formatMessage(config.cancel_list_message) + '\n\n';
    appointments.forEach((appointment, index) => {
      const date = new Date(appointment.date).toLocaleDateString('pt-BR');
      message += `${index + 1}️⃣ ${date} às ${formatTimeHm(appointment.time)}\n`;
    });
    message += '\n⚠️ Clique no número do agendamento para cancelar ou digite 0️⃣ para voltar ao menu de atendimento';

    await updateSession(phone, barbershopId, STEPS.CONFIRM_CANCEL, { appointments });
    return { message };
  } catch (error) {
    logger.error({ err: error }, 'Erro ao listar agendamentos para cancelamento');
    return { message: 'Desculpe, ocorreu um erro ao listar os agendamentos. Tente novamente mais tarde.' };
  }
};

export const handleConfirmCancel = async (
  phone: string,
  choice: string,
  barbershopId: string,
  data: Record<string, unknown>,
  config: BotConfig,
): Promise<BookingMessageResult> => {
  if (choice === '0' || choice.toLowerCase() === 'menu') {
    return goBackToMainMenu(phone, barbershopId);
  }

  const appointmentIndex = parseInt(choice) - 1;
  const appointments = data.appointments as AppointmentListRow[] | undefined;

  if (!appointments || appointmentIndex < 0 || appointmentIndex >= appointments.length) {
    return { message: 'Opção inválida. Por favor, escolha um número válido.' };
  }

  const selectedAppointment = appointments[appointmentIndex];
  if (!selectedAppointment) {
    return { message: 'Opção inválida. Por favor, escolha um número válido.' };
  }
  const appointmentId = selectedAppointment.id;

  try {
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'cancelado' },
    });
    const mainMenu = await goBackToMainMenu(phone, barbershopId);
    return { message: formatMessage(config.cancel_success_message) + '\n\n' + mainMenu.message };
  } catch (error) {
    logger.error({ err: error }, 'Erro ao cancelar agendamento');
    return { message: 'Desculpe, ocorreu um erro ao cancelar o agendamento. Tente novamente.' };
  }
};

// ==================== REAGENDAMENTO ====================

export const handleRescheduleAppointment = async (
  phone: string,
  barbershopId: string,
  config: BotConfig,
): Promise<BookingMessageResult> => {
  try {
    const appointments = await prisma.$queryRaw<AppointmentListRow[]>(Prisma.sql`
      SELECT id, date, time, service_id, barber_id FROM appointments
       WHERE barbershop_id = ${barbershopId}::uuid
         AND client_id = (
           SELECT id FROM clients WHERE phone = ${phone} AND barbershop_id = ${barbershopId}::uuid
         )
         AND status = 'confirmado'
         AND date >= CURRENT_DATE
       ORDER BY date DESC LIMIT 5
    `);

    if (!appointments?.length) {
      return { message: formatMessage(config.reschedule_no_appointments_message) };
    }

    let message = formatMessage(config.reschedule_list_message) + '\n\n';
    appointments.forEach((appointment, index) => {
      const date = new Date(appointment.date).toLocaleDateString('pt-BR');
      message += `${index + 1}️⃣ ${date} às ${formatTimeHm(appointment.time)}\n`;
    });
    message += '\n👉 Clique no número para reagendar ou digite 0️⃣ para voltar ao menu de atendimento';

    await updateSession(phone, barbershopId, STEPS.CONFIRM_RESCHEDULE, { appointments });
    return { message };
  } catch (error) {
    logger.error({ err: error }, 'Erro ao listar agendamentos para reagendamento');
    return { message: 'Desculpe, ocorreu um erro ao listar os agendamentos. Tente novamente mais tarde.' };
  }
};

export const handleConfirmReschedule = async (
  phone: string,
  choice: string,
  barbershopId: string,
  data: Record<string, unknown>,
  config: BotConfig,
): Promise<BookingMessageResult> => {
  if (choice === '0' || choice.toLowerCase() === 'menu') {
    return goBackToMainMenu(phone, barbershopId);
  }

  const appointmentIndex = parseInt(choice) - 1;
  const appointments = data.appointments as AppointmentListRow[] | undefined;

  if (!appointments || appointmentIndex < 0 || appointmentIndex >= appointments.length) {
    return { message: 'Opção inválida. Por favor, escolha um número válido.' };
  }

  const appointment = appointments[appointmentIndex];
  if (!appointment) {
    return { message: 'Opção inválida. Por favor, escolha um número válido.' };
  }
  const newData: Record<string, unknown> = {
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

export const handlePostAttendanceEvaluation = async (
  phone: string,
  barbershopId: string,
  config: BotConfig,
): Promise<BookingMessageResult> => {
  try {
    const lastAppointments = await prisma.$queryRaw<{ id: string; date: Date; time: string }[]>(Prisma.sql`
      SELECT id, date, time FROM appointments
       WHERE barbershop_id = ${barbershopId}::uuid
         AND client_id = (
           SELECT id FROM clients WHERE phone = ${phone} AND barbershop_id = ${barbershopId}::uuid
         )
         AND status = 'confirmado'
         AND date < CURRENT_DATE
       ORDER BY date DESC LIMIT 1
    `);

    if (!lastAppointments?.length) {
      return { message: formatMessage(config.no_previous_appointments_message) };
    }

    const message = formatMessage(config.rating_question_message);
    const firstAppointment = lastAppointments[0];
    await updateSession(phone, barbershopId, STEPS.SEND_RATING, { appointmentId: firstAppointment?.id ?? '' });
    return { message };
  } catch (error) {
    logger.error({ err: error }, 'Erro ao buscar avaliação');
    return { message: 'Desculpe, ocorreu um erro ao processar sua avaliação. Tente novamente mais tarde.' };
  }
};

export const handleSendRating = async (
  phone: string,
  choice: string,
  barbershopId: string,
  data: Record<string, unknown>,
  config: BotConfig,
): Promise<BookingMessageResult> => {
  if (choice === '0') {
    return goBackToMainMenu(phone, barbershopId);
  }

  const rating = parseInt(choice);

  if (rating < 1 || rating > 4) {
    return { message: 'Por favor, escolha uma opção válida de 1️⃣ a 4️⃣, digite 0️⃣ para voltar ao menu de atendimento ou 9️⃣ para encerrar atendimento' };
  }

  try {
    const appointmentId = data.appointmentId as string;
    await prisma.whatsappRating.upsert({
      where: { appointmentId },
      create: {
        barbershopId,
        appointmentId,
        rating,
      },
      update: { rating },
    });

    const mainMenu = await goBackToMainMenu(phone, barbershopId);
    return {
      message: formatMessage(config.rating_confirmation_message, { ratingText: RATING_TEXTS[rating] ?? '' }) + '\n\n' + mainMenu.message,
    };
  } catch (error) {
    logger.error({ err: error }, 'Erro ao guardar avaliação');
    return { message: 'Obrigado pela avaliação! Seus comentários nos ajudam a melhorar.' };
  }
};
