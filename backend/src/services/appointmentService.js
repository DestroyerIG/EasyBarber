import { appointmentRepository } from '../repositories/appointmentRepository.js';
import { serviceRepository } from '../repositories/serviceRepository.js';
import { clientRepository } from '../repositories/clientRepository.js';
import { financeRepository } from '../repositories/financeRepository.js';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  ForbiddenError,
} from '../utils/errors.js';
import logger from '../utils/logger.js';
import { getLocalDate } from '../utils/date.js';

const VALID_TRANSITIONS = {
  confirmado: ['concluido', 'cancelado'],
  concluido: [],
  cancelado: [],
};

export const appointmentService = {
  async getAll(barbershopId, filters) {
    return appointmentRepository.findAll(barbershopId, filters);
  },

  async create(barbershopId, data) {
    const client = await appointmentRepository.getClient();
    try {
      await client.query('BEGIN');

      // Validar propriedade das entidades
      const ownership = await appointmentRepository.validateEntityOwnership(
        client, barbershopId, data
      );
      const errors = [];
      if (parseInt(ownership.client_ok) === 0) errors.push('Cliente não pertence a esta barbearia');
      if (parseInt(ownership.barber_ok) === 0) errors.push('Barbeiro não pertence a esta barbearia ou está inativo');
      if (parseInt(ownership.service_ok) === 0) errors.push('Serviço não pertence a esta barbearia ou está inativo');
      if (errors.length > 0) throw new ForbiddenError(errors.join('. '));

      const time = data.time + ':00';
      const conflict = await appointmentRepository.findConflict(
        client, barbershopId, data.barberId, data.date, time
      );
      if (conflict) throw new ConflictError('Horário já ocupado para este barbeiro');

      const result = await appointmentRepository.create(client, {
        barbershopId, clientId: data.clientId, barberId: data.barberId,
        serviceId: data.serviceId, date: data.date, time,
      });

      await client.query('COMMIT');
      logger.info({ appointmentId: result.id, barbershopId }, 'Agendamento criado');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async updateStatus(id, barbershopId, newStatus) {
    const client = await appointmentRepository.getClient();
    try {
      await client.query('BEGIN');

      const appointment = await appointmentRepository.findByIdForUpdate(client, id, barbershopId);
      if (!appointment) {
        await client.query('ROLLBACK');
        throw new NotFoundError('Agendamento');
      }

      const currentStatus = appointment.status;
      const allowed = VALID_TRANSITIONS[currentStatus];
      if (!allowed || !allowed.includes(newStatus)) {
        await client.query('ROLLBACK');
        throw new ValidationError(
          `Transição de status inválida: ${currentStatus} → ${newStatus}`,
          [`Transições permitidas de '${currentStatus}': ${(allowed || []).join(', ') || 'nenhuma (estado terminal)'}`]
        );
      }

      const result = await appointmentRepository.updateStatus(client, id, newStatus);

      if (newStatus === 'concluido') {
        const service = await serviceRepository.findPrice(appointment.service_id);
        if (service) {
          await financeRepository.createEarning(client, {
            barbershopId, appointmentId: id, amount: service.price, date: appointment.date,
          });
          await clientRepository.updateLastVisit(client, barbershopId, appointment.client_id, appointment.date, service.price);
        }
      }

      await client.query('COMMIT');
      logger.info({ appointmentId: id, from: currentStatus, to: newStatus }, 'Status atualizado');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async update(id, barbershopId, data) {
    const client = await appointmentRepository.getClient();
    try {
      await client.query('BEGIN');

      const ownership = await appointmentRepository.validateEntityOwnership(
        client, barbershopId, data
      );
      const errors = [];
      if (parseInt(ownership.client_ok) === 0) errors.push('Cliente não pertence a esta barbearia');
      if (parseInt(ownership.barber_ok) === 0) errors.push('Barbeiro não pertence a esta barbearia ou está inativo');
      if (parseInt(ownership.service_ok) === 0) errors.push('Serviço não pertence a esta barbearia ou está inativo');
      if (errors.length > 0) throw new ForbiddenError(errors.join('. '));

      const time = data.time + ':00';
      const conflict = await appointmentRepository.findConflict(
        client, barbershopId, data.barberId, data.date, time, id
      );
      if (conflict) throw new ConflictError('Horário já ocupado para este barbeiro');

      const result = await appointmentRepository.update(client, id, barbershopId, {
        clientId: data.clientId, barberId: data.barberId, serviceId: data.serviceId,
        date: data.date, time,
      });
      if (!result) throw new NotFoundError('Agendamento (ou não pode ser editado)');

      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async delete(id, barbershopId) {
    const result = await appointmentRepository.softDelete(id, barbershopId);
    if (!result) throw new NotFoundError('Agendamento');
    logger.info({ appointmentId: id, barbershopId }, 'Agendamento cancelado (soft delete)');
  },

  async getAvailableSlots(barbershopId, { barberId, date, serviceId }) {
    if (!barberId || !date) throw new ValidationError('barberId e date são obrigatórios');

    let duration = 60;
    if (serviceId) {
      const service = await serviceRepository.findDuration(serviceId, barbershopId);
      if (service) duration = service.duration_minutes;
    }

    const bookedTimes = await appointmentRepository.getBookedSlots(barbershopId, barberId, date);

    const slots = [];
    const startHour = 9;
    const endHour = 19;

    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += duration) {
        const endMinutes = hour * 60 + minute + duration;
        if (endMinutes > endHour * 60) continue;
        const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
        if (!bookedTimes.includes(time)) {
          slots.push(time.substring(0, 5));
        }
      }
    }

    return slots;
  },
};
