import { clientRepository } from '../repositories/clientRepository.js';
import { ConflictError, NotFoundError } from '../utils/errors.js';

interface PaginationOptions {
  page?: string | number;
  limit?: string | number;
}

interface ClientData {
  name: string;
  phone: string;
  email?: string | null;
  birthDate?: string | null;
  address?: string | null;
  notes?: string | null;
}

export const clientService = {
  async getAll(barbershopId: string, { page, limit }: PaginationOptions = {}) {
    if (page && limit) {
      const data = await clientRepository.findManyPaginated(barbershopId, {
        page: parseInt(String(page), 10),
        limit: Math.min(parseInt(String(limit), 10), 100),
        orderBy: 'created_at DESC',
      });
      return { data, meta: undefined as any };
    }
    const data = await clientRepository.findMany(barbershopId, { orderBy: 'created_at DESC' });
    return { data, meta: undefined as any };
  },

  async create(barbershopId: string, data: ClientData) {
    const existing = await clientRepository.findByPhone(barbershopId, data.phone);
    if (existing) {
      throw new ConflictError('Cliente já cadastrado com este telefone');
    }

    return clientRepository.create({
      barbershopId: barbershopId,
      name: data.name,
      phone: data.phone,
      email: data.email ?? null,
      birthDate: data.birthDate ?? null,
      address: data.address ?? null,
      notes: data.notes ?? null,
    });
  },

  async update(id: string, barbershopId: string, data: ClientData) {
    const result = await clientRepository.update(id, barbershopId, {
      name: data.name,
      phone: data.phone,
      email: data.email ?? null,
      birthDate: data.birthDate ?? null,
      address: data.address ?? null,
      notes: data.notes ?? null,
    });

    if (!result) {
      throw new NotFoundError('Cliente');
    }

    return result;
  },

  async getHistory(barbershopId: string, clientId: string) {
    return clientRepository.getHistory(barbershopId, clientId);
  },
};
