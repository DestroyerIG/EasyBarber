import { prisma } from '../../config/prisma.js';
import logger from '../../utils/logger.js';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  ForbiddenError,
} from '../../utils/errors.js';
import { appointmentsPrismaRepository } from './appointments.repository.js';
import { generateAvailableTimeSlots, getBarbershopBusinessSettings } from '../../services/barbershopBusinessSettingsService.js';
import type {
  CreateAppointmentInput,
  UpdateAppointmentInput,
  GetAppointmentsQuery,
  GetAvailableSlotsQuery,
  AppointmentWithRelations,
  VALID_STATUS_TRANSITIONS,
} from './appointments.types.js';
import { VALID_STATUS_TRANSITIONS as TRANSITIONS } from './appointments.types.js';
import type { AppointmentStatus } from '../../types/domain.js';

export const appointmentsService = {
  async getAll(
    barbershopId: string,
    filters: GetAppointmentsQuery
  ): Promise<AppointmentWithRelations[]> {
    return appointmentsPrismaRepository.findAll(barbershopId, filters);
  },

  async create(
    barbershopId: string,
    data: CreateAppointmentInput
  ): Promise<AppointmentWithRelations> {
    const ownership = await appointmentsPrismaRepository.validateOwnership(barbershopId, data);
    const errors: string[] = [];
    if (!ownership.clientOk) errors.push('Cliente não pertence a esta barbearia');
    if (!ownership.barberOk) errors.push('Barbeiro não pertence a esta barbearia ou está inativo');
    if (!ownership.serviceOk) errors.push('Serviço não pertence a esta barbearia ou está inativo');
    if (errors.length > 0) throw new ForbiddenError(errors.join('. '));

    const time = data.time.length === 5 ? `${data.time}:00` : data.time;
    const conflict = await appointmentsPrismaRepository.hasConflict(
      barbershopId, data.barberId, data.date, time
    );
    if (conflict) throw new ConflictError('Horário já ocupado para este barbeiro');

    const result = await appointmentsPrismaRepository.create({ ...data, barbershopId });
    logger.info({ appointmentId: result.id, barbershopId }, 'Agendamento criado');
    return result;
  },

  async updateStatus(
    id: string,
    barbershopId: string,
    newStatus: AppointmentStatus
  ): Promise<AppointmentWithRelations> {
    const appointment = await appointmentsPrismaRepository.findById(id, barbershopId);
    if (!appointment) throw new NotFoundError('Agendamento');

    const currentStatus = appointment.status;
    const allowed = TRANSITIONS[currentStatus];

    if (!allowed.includes(newStatus)) {
      throw new ValidationError(
        `Transição de status inválida: ${currentStatus} → ${newStatus}`,
        [
          `Transições permitidas de '${currentStatus}': ${
            allowed.length ? allowed.join(', ') : 'nenhuma (estado terminal)'
          }`,
        ]
      );
    }

    const result = await appointmentsPrismaRepository.updateStatus(id, barbershopId, newStatus);
    if (!result) throw new NotFoundError('Agendamento');

    if (newStatus === 'concluido') {
      const service = await appointmentsPrismaRepository.getServiceDetails(
        appointment.serviceId,
        barbershopId
      );
      if (service) {
        await prisma.$transaction([
          prisma.earning.create({
            data: {
              barbershopId,
              appointmentId: id,
              amount: service.price,
              date: appointment.date,
            },
          }),
        ]);
      }
    }

    logger.info({ appointmentId: id, from: currentStatus, to: newStatus }, 'Status atualizado');
    return result;
  },

  async update(
    id: string,
    barbershopId: string,
    data: UpdateAppointmentInput
  ): Promise<AppointmentWithRelations> {
    if (data.clientId || data.barberId || data.serviceId) {
      const ownership = await appointmentsPrismaRepository.validateOwnership(barbershopId, {
        clientId: data.clientId ?? '',
        barberId: data.barberId ?? '',
        serviceId: data.serviceId ?? '',
      });
      const errors: string[] = [];
      if (data.clientId && !ownership.clientOk) errors.push('Cliente não pertence a esta barbearia');
      if (data.barberId && !ownership.barberOk) errors.push('Barbeiro não pertence a esta barbearia ou está inativo');
      if (data.serviceId && !ownership.serviceOk) errors.push('Serviço não pertence a esta barbearia ou está inativo');
      if (errors.length > 0) throw new ForbiddenError(errors.join('. '));
    }

    if (data.date && data.time && data.barberId) {
      const time = data.time.length === 5 ? `${data.time}:00` : data.time;
      const conflict = await appointmentsPrismaRepository.hasConflict(
        barbershopId, data.barberId, data.date, time, id
      );
      if (conflict) throw new ConflictError('Horário já ocupado para este barbeiro');
    }

    const result = await appointmentsPrismaRepository.update(id, barbershopId, data);
    if (!result) throw new NotFoundError('Agendamento (ou não pode ser editado)');
    return result;
  },

  async delete(id: string, barbershopId: string): Promise<void> {
    const deleted = await appointmentsPrismaRepository.softDelete(id, barbershopId);
    if (!deleted) throw new NotFoundError('Agendamento');
    logger.info({ appointmentId: id, barbershopId }, 'Agendamento cancelado');
  },

  async getAvailableSlots(
    barbershopId: string,
    query: GetAvailableSlotsQuery
  ): Promise<unknown> {
    const { barberId, date, serviceId } = query;

    const businessSettings = await getBarbershopBusinessSettings(barbershopId);
    let duration: number = (businessSettings as { slotIntervalMinutes?: number }).slotIntervalMinutes ?? 60;

    if (serviceId) {
      const service = await appointmentsPrismaRepository.getServiceDetails(serviceId, barbershopId);
      if (service) duration = service.durationMinutes;
    }

    const bookedTimes = await appointmentsPrismaRepository.getBookedSlots(
      barbershopId, barberId, date
    );

    return (generateAvailableTimeSlots as Function)(businessSettings, date, {
      serviceDurationMinutes: duration,
      bookedTimes,
    });
  },
};
