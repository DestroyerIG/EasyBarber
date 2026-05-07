import { barberRepository } from '../repositories/barberRepository.js';
import { NotFoundError, PlanLimitError } from '../utils/errors.js';

type Plan = 'basico' | 'profissional' | 'premium';

const BARBER_LIMITS: Record<Plan, number> = {
  basico: 1,
  profissional: 5,
  premium: 999,
};

interface BarberData {
  name: string;
  photo?: string | null;
}

export const barberService = {
  async getBarbers(barbershopId: string) {
    return barberRepository.findAllActive(barbershopId);
  },

  async createBarber(barbershopId: string, plan: string, data: BarberData) {
    const currentBarbers = await barberRepository.countActive(barbershopId);
    const limit = BARBER_LIMITS[plan as Plan] ?? 1;

    if (currentBarbers >= limit) {
      throw new PlanLimitError(
        Object.entries(BARBER_LIMITS).find(([, v]) => v > currentBarbers)?.[0] || 'premium'
      );
    }

    return (barberRepository as unknown as {
      create(data: { barbershop_id: string; name: string; photo: string | null }): Promise<unknown>;
    }).create({
      barbershop_id: barbershopId,
      name: data.name,
      photo: data.photo ?? null,
    });
  },

  async updateBarber(id: string, barbershopId: string, data: BarberData) {
    const result = await (barberRepository as unknown as {
      update(id: string, barbershopId: string, data: { name: string; photo?: string | null }): Promise<unknown>;
    }).update(id, barbershopId, {
      name: data.name,
      photo: data.photo,
    });
    if (!result) throw new NotFoundError('Barbeiro');
    return result;
  },

  async deleteBarber(id: string, barbershopId: string): Promise<void> {
    const result = await (barberRepository as unknown as {
      softDelete(id: string, barbershopId: string): Promise<unknown>;
    }).softDelete(id, barbershopId);
    if (!result) throw new NotFoundError('Barbeiro');
  },
};
