import { serviceRepository } from '../repositories/serviceRepository.js';
import { NotFoundError } from '../utils/errors.js';

export const serviceService = {
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
};
