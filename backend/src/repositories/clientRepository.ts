import { prisma } from '../config/prisma.js';

export const clientRepository = {
  async findByPhone(barbershopId: string, phone: string) {
    return prisma.client.findFirst({
      where: { barbershopId, phone },
      select: { id: true },
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
