import express from 'express';
// @ts-ignore
import { authMiddleware } from '../middleware/auth.js';
// @ts-ignore
import { requireTenantRoles } from '../middleware/rbac.js';
// @ts-ignore
import { requireFeature } from '../middleware/subscriptionGuard.js';
// @ts-ignore
import { validate } from '../middleware/validate.js';
// @ts-ignore
import {
  getFinanceSummary,
  getMonthlyReport,
  addExpense,
  getExpenses,
  updateExpense,
  deleteExpense,
  addExpenseSchema,
  updateExpenseSchema,
} from '../controllers/financeController.js';

const router = express.Router();

router.get('/summary', authMiddleware, requireTenantRoles, requireFeature('finance'), getFinanceSummary);
router.get('/monthly', authMiddleware, requireTenantRoles, requireFeature('reports'), getMonthlyReport);
router.post('/expenses', authMiddleware, requireTenantRoles, requireFeature('finance'), validate({ body: addExpenseSchema }), addExpense);
router.put('/expenses/:id', authMiddleware, requireTenantRoles, requireFeature('finance'), validate({ body: updateExpenseSchema }), updateExpense);
router.delete('/expenses/:id', authMiddleware, requireTenantRoles, requireFeature('finance'), deleteExpense);
router.get('/expenses', authMiddleware, requireTenantRoles, requireFeature('finance'), getExpenses);

export default router;
