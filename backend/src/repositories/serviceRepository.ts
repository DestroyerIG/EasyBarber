import { prisma } from '../config/prisma.js';

export const serviceRepository = {
  async findAllActive(barbershopId: string) {
    return prisma.service.findMany({
      where: { barbershopId, active: true },
      orderBy: { name: 'asc' },
    });
  },

  async findPrice(serviceId: string) {
    return prisma.service.findFirst({
      where: { id: serviceId },
      select: { price: true },
    });
  },

  async findDuration(serviceId: string, barbershopId: string) {
    return prisma.service.findFirst({
      where: { id: serviceId, barbershopId, active: true },
      select: { durationMinutes: true },
    });
  },
};
