import { prisma } from '../config/prisma.js';
import { startOfDay, endOfDay } from '../utils/dateUtils.js';

export const dashboardRepository = {
  async getDashboardData(barbershopId: string, today: Date) {
    const [appointmentsToday, earningsToday, expensesToday, totalClients, weeklyEarnings] =
      await Promise.all([
        prisma.appointment.count({
          where: { 
            barbershopId, 
            date: { gte: startOfDay(today), lte: endOfDay(today) }, 
            status: 'confirmado' 
          },
        }),
        prisma.earning.aggregate({
          where: { 
            barbershopId, 
            date: { gte: startOfDay(today), lte: endOfDay(today) } 
          },
          _sum: { amount: true },
        }),
        prisma.expense.aggregate({
          where: { 
            barbershopId, 
            date: { gte: startOfDay(today), lte: endOfDay(today) } 
          },
          _sum: { amount: true },
        }),
        prisma.client.count({ where: { barbershopId } }),
        prisma.earning.groupBy({
          by: ['date'],
          where: {
            barbershopId,
            date: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
          _sum: { amount: true },
          orderBy: { date: 'asc' },
        }),
      ]);

    return {
      appointmentsToday,
      earningsToday: Number(earningsToday._sum.amount ?? 0),
      expensesToday: Number(expensesToday._sum.amount ?? 0),
      totalClients,
      weeklyEarnings: weeklyEarnings.map((row) => ({
        date: row.date,
        total: Number(row._sum.amount ?? 0),
      })),
    };
  },
};
