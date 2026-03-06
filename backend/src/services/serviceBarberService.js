import { serviceRepository } from '../repositories/serviceRepository.js';
import { barberRepository } from '../repositories/barberRepository.js';
import { NotFoundError, PlanLimitError } from '../utils/errors.js';

const BARBER_LIMITS = {
  basico: 1,
  profissional: 5,
  premium: 999,
};

export const serviceBarberService = {
  // --- Serviços ---
  async getServices(barbershopId) {
    return serviceRepository.findAllActive(barbershopId);
  },

  async createService(barbershopId, data) {
    return serviceRepository.create({
      barbershop_id: barbershopId,
      name: data.name,
      price: data.price,
      duration_minutes: data.duration_minutes,
    });
  },

  async updateService(id, barbershopId, data) {
    const result = await serviceRepository.update(id, barbershopId, {
      name: data.name,
      price: data.price,
      duration_minutes: data.duration_minutes,
    });
    if (!result) throw new NotFoundError('Serviço');
    return result;
  },

  async deleteService(id, barbershopId) {
    const result = await serviceRepository.softDelete(id, barbershopId);
    if (!result) throw new NotFoundError('Serviço');
  },

  // --- Barbeiros ---
  async getBarbers(barbershopId) {
    return barberRepository.findAllActive(barbershopId);
  },

  async createBarber(barbershopId, plan, data) {
    const currentBarbers = await barberRepository.countActive(barbershopId);
    const limit = BARBER_LIMITS[plan] || 1;

    if (currentBarbers >= limit) {
      throw new PlanLimitError(
        Object.entries(BARBER_LIMITS).find(([, v]) => v > currentBarbers)?.[0] || 'premium'
      );
    }

    return barberRepository.create({
      barbershop_id: barbershopId,
      name: data.name,
      photo: data.photo || null,
    });
  },

  async updateBarber(id, barbershopId, data) {
    const result = await barberRepository.update(id, barbershopId, {
      name: data.name,
      photo: data.photo,
    });
    if (!result) throw new NotFoundError('Barbeiro');
    return result;
  },

  async deleteBarber(id, barbershopId) {
    const result = await barberRepository.softDelete(id, barbershopId);
    if (!result) throw new NotFoundError('Barbeiro');
  },
};
