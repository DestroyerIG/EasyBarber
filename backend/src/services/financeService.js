import { financeRepository } from '../repositories/financeRepository.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { getLocalDate } from '../utils/date.js';

export const financeService = {
  async getSummary(barbershopId) {
    const today = getLocalDate();
    const data = await financeRepository.getSummary(barbershopId, today);

    return {
      today: {
        earnings: parseFloat(data.earnings_today),
        expenses: parseFloat(data.expenses_today),
        profit: parseFloat(data.earnings_today) - parseFloat(data.expenses_today),
      },
      month: {
        earnings: parseFloat(data.earnings_month),
        expenses: parseFloat(data.expenses_month),
        profit: parseFloat(data.earnings_month) - parseFloat(data.expenses_month),
      },
    };
  },

  async getMonthlyReport(barbershopId, { month, year }) {
    if (!month || !year) {
      throw new ValidationError('month e year são obrigatórios');
    }

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const rows = await financeRepository.getMonthlyReport(barbershopId, startDate);

    return rows.map(row => ({
      date: row.date,
      earnings: parseFloat(row.earnings),
      expenses: parseFloat(row.expenses),
      profit: parseFloat(row.earnings) - parseFloat(row.expenses),
    }));
  },

  async addExpense(barbershopId, data) {
    return financeRepository.createExpense(barbershopId, data);
  },

  async updateExpense(id, barbershopId, data) {
    const result = await financeRepository.updateExpense(id, barbershopId, data);
    if (!result) throw new NotFoundError('Gasto');
    return result;
  },

  async deleteExpense(id, barbershopId) {
    const result = await financeRepository.deleteExpense(id, barbershopId);
    if (!result) throw new NotFoundError('Gasto');
  },

  async getExpenses(barbershopId, filters) {
    return financeRepository.getExpenses(barbershopId, filters);
  },
};
