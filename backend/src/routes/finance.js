import express from 'express';
import { authMiddleware, checkPlan } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  getFinanceSummary,
  getMonthlyReport,
  addExpense,
  getExpenses,
  updateExpense,
  deleteExpense,
  addExpenseSchema,
  updateExpenseSchema
} from '../controllers/financeController.js';

const router = express.Router();

router.get('/summary', authMiddleware, getFinanceSummary);
router.get('/monthly', authMiddleware, checkPlan('profissional'), getMonthlyReport);
router.post('/expenses', authMiddleware, validate({ body: addExpenseSchema }), addExpense);
router.put('/expenses/:id', authMiddleware, validate({ body: updateExpenseSchema }), updateExpense);
router.delete('/expenses/:id', authMiddleware, deleteExpense);
router.get('/expenses', authMiddleware, getExpenses);

export default router;
