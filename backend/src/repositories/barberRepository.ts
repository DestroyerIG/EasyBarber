import { prisma } from '../config/prisma.js';

export const barberRepository = {
  async findAllActive(barbershopId: string) {
    return prisma.barber.findMany({
      where: { barbershopId, active: true },
      orderBy: { name: 'asc' },
    });
  },

  async countActive(barbershopId: string): Promise<number> {
    return prisma.barber.count({ where: { barbershopId, active: true } });
  },

  async create(data: { barbershop_id: string; name: string; photo: string | null }) {
    return prisma.barber.create({
      data: {
        barbershopId: data.barbershop_id,
        name: data.name,
        photo: data.photo,
      },
    });
  },

  async update(id: string, barbershopId: string, data: { name: string; photo?: string | null }) {
    const result = await prisma.barber.updateMany({
      where: { id, barbershopId },
      data: { name: data.name, photo: data.photo },
    });
    if (result.count === 0) return null;
    return prisma.barber.findFirst({ where: { id } });
  },

  async softDelete(id: string, barbershopId: string) {
    const result = await prisma.barber.updateMany({
      where: { id, barbershopId, active: true },
      data: { active: false },
    });
    return result.count > 0 ? { id } : null;
  },
};
