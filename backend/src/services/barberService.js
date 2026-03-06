import { barberRepository } from '../repositories/barberRepository.js';
import { NotFoundError, PlanLimitError } from '../utils/errors.js';

const BARBER_LIMITS = {
  basico: 1,
  profissional: 5,
  premium: 999,
};

export const barberService = {
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
