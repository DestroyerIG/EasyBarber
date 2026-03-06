import { clientRepository } from '../repositories/clientRepository.js';
import { ConflictError, NotFoundError } from '../utils/errors.js';

export const clientService = {
  async getAll(barbershopId, { page, limit } = {}) {
    if (page && limit) {
      return clientRepository.findAllPaginated(barbershopId, {
        page: parseInt(page),
        limit: Math.min(parseInt(limit), 100),
        orderBy: 'created_at DESC',
      });
    }
    return clientRepository.findAll(barbershopId, { orderBy: 'created_at DESC' });
  },

  async create(barbershopId, data) {
    const existing = await clientRepository.findByPhone(barbershopId, data.phone);
    if (existing) {
      throw new ConflictError('Cliente já cadastrado com este telefone');
    }

    return clientRepository.create({
      barbershop_id: barbershopId,
      name: data.name,
      phone: data.phone,
      email: data.email || null,
      birth_date: data.birthDate || null,
      address: data.address || null,
      notes: data.notes || null,
    });
  },

  async update(id, barbershopId, data) {
    const result = await clientRepository.update(id, barbershopId, {
      name: data.name,
      phone: data.phone,
      email: data.email || null,
      birth_date: data.birthDate || null,
      address: data.address || null,
      notes: data.notes || null,
    });

    if (!result) {
      throw new NotFoundError('Cliente');
    }

    return result;
  },

  async getHistory(barbershopId, clientId) {
    return clientRepository.getHistory(barbershopId, clientId);
  },
};
