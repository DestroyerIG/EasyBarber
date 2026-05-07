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
};
