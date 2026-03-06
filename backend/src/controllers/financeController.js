import { financeService } from '../services/financeService.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import { addExpenseSchema, updateExpenseSchema } from '../validators/schemas/index.js';

export { addExpenseSchema, updateExpenseSchema };

export const getFinanceSummary = async (req, res, next) => {
  try {
    const data = await financeService.getSummary(req.user.barbershopId);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const getMonthlyReport = async (req, res, next) => {
  try {
    const data = await financeService.getMonthlyReport(req.user.barbershopId, req.query);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const addExpense = async (req, res, next) => {
  try {
    const data = await financeService.addExpense(req.user.barbershopId, req.body);
    sendCreated(res, data);
  } catch (error) {
    next(error);
  }
};

export const updateExpense = async (req, res, next) => {
  try {
    const data = await financeService.updateExpense(req.params.id, req.user.barbershopId, req.body);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const deleteExpense = async (req, res, next) => {
  try {
    await financeService.deleteExpense(req.params.id, req.user.barbershopId);
    sendSuccess(res, { message: 'Gasto excluído com sucesso' });
  } catch (error) {
    next(error);
  }
};

export const getExpenses = async (req, res, next) => {
  try {
    const data = await financeService.getExpenses(req.user.barbershopId, req.query);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};
