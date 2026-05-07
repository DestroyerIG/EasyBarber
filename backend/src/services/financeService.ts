import { financeRepository } from '../repositories/financeRepository.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { getLocalDate } from '../utils/date.js';

interface MonthYearParams {
  month?: string | number;
  year?: string | number;
}

interface ExpenseData {
  description: string;
  category: string;
  amount: number;
  date: string;
}

interface ExpenseUpdateData {
  description?: string;
  category?: string;
  amount?: number;
  date?: string;
}

interface ExpenseFilters {
  startDate?: string;
  endDate?: string;
}

export const financeService = {
  async getSummary(barbershopId: string) {
    const today = getLocalDate();
    const data = await financeRepository.getSummary(barbershopId, today as unknown as Date);

    return {
      today: {
        earnings: parseFloat(String(data.earnings_today)),
        expenses: parseFloat(String(data.expenses_today)),
        profit: parseFloat(String(data.earnings_today)) - parseFloat(String(data.expenses_today)),
      },
      month: {
        earnings: parseFloat(String(data.earnings_month)),
        expenses: parseFloat(String(data.expenses_month)),
        profit: parseFloat(String(data.earnings_month)) - parseFloat(String(data.expenses_month)),
      },
    };
  },

  async getMonthlyReport(barbershopId: string, { month, year }: MonthYearParams) {
    if (!month || !year) {
      throw new ValidationError('month e year são obrigatórios');
    }

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const rows = await financeRepository.getMonthlyReport(barbershopId, startDate);

    return rows.map((row) => ({
      date: row.date,
      earnings: parseFloat(row.earnings),
      expenses: parseFloat(row.expenses),
      profit: parseFloat(row.earnings) - parseFloat(row.expenses),
    }));
  },

  async addExpense(barbershopId: string, data: ExpenseData) {
    return financeRepository.createExpense(barbershopId, data);
  },

  async updateExpense(id: string, barbershopId: string, data: ExpenseUpdateData) {
    const result = await financeRepository.updateExpense(id, barbershopId, data);
    if (!result) throw new NotFoundError('Gasto');
    return result;
  },

  async deleteExpense(id: string, barbershopId: string): Promise<void> {
    const result = await financeRepository.deleteExpense(id, barbershopId);
    if (!result) throw new NotFoundError('Gasto');
  },

  async getExpenses(barbershopId: string, filters: ExpenseFilters) {
    return financeRepository.getExpenses(barbershopId, filters);
  },
};
