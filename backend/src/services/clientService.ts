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
      return (clientRepository as unknown as {
        findAllPaginated(
          barbershopId: string,
          options: { page: number; limit: number; orderBy: string }
        ): Promise<unknown>;
      }).findAllPaginated(barbershopId, {
        page: parseInt(String(page)),
        limit: Math.min(parseInt(String(limit)), 100),
        orderBy: 'created_at DESC',
      });
    }
    return (clientRepository as unknown as {
      findAll(barbershopId: string, options: { orderBy: string }): Promise<unknown>;
    }).findAll(barbershopId, { orderBy: 'created_at DESC' });
  },

  async create(barbershopId: string, data: ClientData) {
    const existing = await clientRepository.findByPhone(barbershopId, data.phone);
    if (existing) {
      throw new ConflictError('Cliente já cadastrado com este telefone');
    }

    return (clientRepository as unknown as {
      create(data: {
        barbershop_id: string;
        name: string;
        phone: string;
        email: string | null;
        birth_date: string | null;
        address: string | null;
        notes: string | null;
      }): Promise<unknown>;
    }).create({
      barbershop_id: barbershopId,
      name: data.name,
      phone: data.phone,
      email: data.email ?? null,
      birth_date: data.birthDate ?? null,
      address: data.address ?? null,
      notes: data.notes ?? null,
    });
  },

  async update(id: string, barbershopId: string, data: ClientData) {
    const result = await (clientRepository as unknown as {
      update(
        id: string,
        barbershopId: string,
        data: {
          name: string;
          phone: string;
          email: string | null;
          birth_date: string | null;
          address: string | null;
          notes: string | null;
        }
      ): Promise<unknown>;
    }).update(id, barbershopId, {
      name: data.name,
      phone: data.phone,
      email: data.email ?? null,
      birth_date: data.birthDate ?? null,
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
