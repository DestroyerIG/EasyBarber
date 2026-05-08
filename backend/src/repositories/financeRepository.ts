import { prisma } from '../config/prisma.js';
import { Prisma } from '@prisma/client';
import { toDate, startOfDay, endOfDay } from '../utils/dateUtils.js';

export const financeRepository = {
  async getSummary(barbershopId: string, rawToday: Date | string) {
    const today = toDate(rawToday);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [earningsToday, expensesToday, earningsMonth, expensesMonth] = await Promise.all([
      prisma.earning.aggregate({ where: { barbershopId, date: { gte: startOfDay(today), lte: endOfDay(today) } }, _sum: { amount: true } }),
      prisma.expense.aggregate({ where: { barbershopId, date: { gte: startOfDay(today), lte: endOfDay(today) } }, _sum: { amount: true } }),
      prisma.earning.aggregate({ where: { barbershopId, date: { gte: startOfMonth } }, _sum: { amount: true } }),
      prisma.expense.aggregate({ where: { barbershopId, date: { gte: startOfMonth } }, _sum: { amount: true } }),
    ]);

    return {
      earnings_today: Number(earningsToday._sum.amount ?? 0),
      expenses_today: Number(expensesToday._sum.amount ?? 0),
      earnings_month: Number(earningsMonth._sum.amount ?? 0),
      expenses_month: Number(expensesMonth._sum.amount ?? 0),
    };
  },

  async getMonthlyReport(barbershopId: string, startDate: string) {
    // Uses generate_series — preserve raw SQL
    return prisma.$queryRaw<Array<{ date: Date; earnings: string; expenses: string }>>(
      Prisma.sql`
        SELECT
          date,
          (SELECT COALESCE(SUM(amount), 0) FROM earnings WHERE barbershop_id = ${barbershopId}::uuid AND date = days.date) AS earnings,
          (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE barbershop_id = ${barbershopId}::uuid AND date = days.date) AS expenses
        FROM generate_series(
          ${startDate}::date,
          (${startDate}::date + INTERVAL '1 month - 1 day')::date,
          '1 day'::interval
        ) AS days(date)
        ORDER BY date
      `
    );
  },

  async createExpense(barbershopId: string, data: { description: string; category: string; amount: number; date: string }) {
    return prisma.expense.create({
      data: {
        barbershopId,
        description: data.description,
        category: data.category,
        amount: data.amount,
        date: new Date(data.date),
      },
    });
  },

  async updateExpense(id: string, barbershopId: string, data: { description?: string; category?: string; amount?: number; date?: string }) {
    const existing = await prisma.expense.findFirst({ where: { id, barbershopId }, select: { id: true } });
    if (!existing) return null;
    return prisma.expense.update({
      where: { id },
      data: {
        ...(data.description !== undefined && { description: data.description }),
        ...(data.category !== undefined && { category: data.category }),
        ...(data.amount !== undefined && { amount: data.amount }),
        ...(data.date !== undefined && { date: new Date(data.date) }),
      },
    });
  },

  async deleteExpense(id: string, barbershopId: string) {
    const existing = await prisma.expense.findFirst({ where: { id, barbershopId }, select: { id: true } });
    if (!existing) return null;
    return prisma.expense.delete({ where: { id } });
  },

  async getExpenses(barbershopId: string, { startDate, endDate }: { startDate?: string; endDate?: string } = {}) {
    return prisma.expense.findMany({
      where: {
        barbershopId,
        ...(startDate && endDate && {
          date: { gte: new Date(startDate), lte: new Date(endDate) },
        }),
      },
      orderBy: { date: 'desc' },
    });
  },

  async createEarning(_client: unknown, data: { barbershopId: string; appointmentId: string; amount: number; date: Date }) {
    await prisma.earning.upsert({
      where: { appointmentId: data.appointmentId },
      create: {
        barbershopId: data.barbershopId,
        appointmentId: data.appointmentId,
        amount: data.amount,
        date: data.date,
      },
      update: {},
    });
  },

  async findEarningByAppointment(_client: unknown, appointmentId: string) {
    return prisma.earning.findFirst({ where: { appointmentId }, select: { id: true } });
  },
};
