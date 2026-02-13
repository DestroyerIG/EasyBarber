import express from 'express';
import { authMiddleware, checkPlan } from '../middleware/auth.js';
import {
  getFinanceSummary,
  getMonthlyReport,
  addExpense,
  getExpenses
} from '../controllers/financeController.js';

const router = express.Router();

router.get('/summary', authMiddleware, getFinanceSummary);
router.get('/monthly', authMiddleware, checkPlan('profissional'), getMonthlyReport);
router.post('/expenses', authMiddleware, addExpense);
router.get('/expenses', authMiddleware, getExpenses);

export default router;
