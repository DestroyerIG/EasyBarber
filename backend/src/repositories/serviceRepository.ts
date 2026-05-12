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

  async create(data: { barbershop_id: string; name: string; price: number; duration_minutes: number }) {
    return prisma.service.create({
      data: {
        barbershopId: data.barbershop_id,
        name: data.name,
        price: data.price,
        durationMinutes: data.duration_minutes,
      },
    });
  },

  async update(id: string, barbershopId: string, data: { name: string; price: number; duration_minutes: number }) {
    const result = await prisma.service.updateMany({
      where: { id, barbershopId },
      data: { name: data.name, price: data.price, durationMinutes: data.duration_minutes },
    });
    if (result.count === 0) return null;
    return prisma.service.findFirst({ where: { id } });
  },

  async softDelete(id: string, barbershopId: string) {
    const result = await prisma.service.updateMany({
      where: { id, barbershopId, active: true },
      data: { active: false },
    });
    return result.count > 0 ? { id } : null;
  },
};
