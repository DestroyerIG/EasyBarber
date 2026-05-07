import { serviceRepository } from '../repositories/serviceRepository.js';
import { NotFoundError } from '../utils/errors.js';

interface ServiceData {
  name: string;
  price: number;
  duration_minutes: number;
}

export const serviceService = {
  async getServices(barbershopId: string) {
    return serviceRepository.findAllActive(barbershopId);
  },

  async createService(barbershopId: string, data: ServiceData) {
    return (serviceRepository as unknown as {
      create(data: {
        barbershop_id: string;
        name: string;
        price: number;
        duration_minutes: number;
      }): Promise<unknown>;
    }).create({
      barbershop_id: barbershopId,
      name: data.name,
      price: data.price,
      duration_minutes: data.duration_minutes,
    });
  },

  async updateService(id: string, barbershopId: string, data: ServiceData) {
    const result = await (serviceRepository as unknown as {
      update(
        id: string,
        barbershopId: string,
        data: { name: string; price: number; duration_minutes: number }
      ): Promise<unknown>;
    }).update(id, barbershopId, {
      name: data.name,
      price: data.price,
      duration_minutes: data.duration_minutes,
    });
    if (!result) throw new NotFoundError('Serviço');
    return result;
  },

  async deleteService(id: string, barbershopId: string): Promise<void> {
    const result = await (serviceRepository as unknown as {
      softDelete(id: string, barbershopId: string): Promise<unknown>;
    }).softDelete(id, barbershopId);
    if (!result) throw new NotFoundError('Serviço');
  },
};
