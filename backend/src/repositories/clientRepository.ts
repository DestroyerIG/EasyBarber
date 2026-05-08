import { prisma } from '../config/prisma.js';

export const clientRepository = {
  async findByPhone(barbershopId: string, phone: string) {
    return prisma.client.findFirst({
      where: { barbershopId, phone },
      select: { id: true },
    });
  },

  async findMany(barbershopId: string, options?: { orderBy?: string }) {
    return prisma.client.findMany({
      where: { barbershopId },
      orderBy: { createdAt: 'desc' },
    });
  },

  async findManyPaginated(barbershopId: string, options: { page: number; limit: number; orderBy?: string }) {
    const skip = (options.page - 1) * options.limit;
    return prisma.client.findMany({
      where: { barbershopId },
      skip,
      take: options.limit,
      orderBy: { createdAt: 'desc' },
    });
  },

  async create(data: {
    barbershopId: string;
    name: string;
    phone: string;
    email: string | null;
    birthDate: string | null;
    address: string | null;
    notes: string | null;
  }) {
    // Treat birthDate properly if necessary (assuming string is fine for now if model has String or DateTime, we can use toDate if it's DateTime)
    return prisma.client.create({
      data: {
        barbershopId: data.barbershopId,
        name: data.name,
        phone: data.phone,
        email: data.email,
        birthDate: data.birthDate ? new Date(data.birthDate) : null,
        address: data.address,
        notes: data.notes,
      },
    });
  },

  async update(id: string, barbershopId: string, data: {
    name?: string;
    phone?: string;
    email?: string | null;
    birthDate?: string | null;
    address?: string | null;
    notes?: string | null;
  }) {
    return prisma.client.updateMany({
      where: { id, barbershopId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.birthDate !== undefined && { birthDate: data.birthDate ? new Date(data.birthDate) : null }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
    });
  },

  async getHistory(barbershopId: string, clientId: string) {
    return prisma.appointment.findMany({
      where: { barbershopId, clientId },
      include: {
        barber: { select: { name: true } },
        service: { select: { name: true, price: true } },
      },
      orderBy: [{ date: 'desc' }, { time: 'desc' }],
    });
  },

  async updateLastVisit(barbershopId: string, clientId: string, date: Date, amount: number) {
    await prisma.client.updateMany({
      where: { id: clientId, barbershopId },
      data: {
        lastVisit: date,
        totalSpent: { increment: amount },
      },
    });
  },
};
