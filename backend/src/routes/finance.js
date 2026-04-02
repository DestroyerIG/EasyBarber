import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requireTenantRoles } from '../middleware/rbac.js';
import { requireFeature } from '../middleware/subscriptionGuard.js';
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

router.get('/summary', authMiddleware, requireTenantRoles, requireFeature('finance'), getFinanceSummary);
router.get('/monthly', authMiddleware, requireTenantRoles, requireFeature('reports'), getMonthlyReport);
router.post('/expenses', authMiddleware, requireTenantRoles, requireFeature('finance'), validate({ body: addExpenseSchema }), addExpense);
router.put('/expenses/:id', authMiddleware, requireTenantRoles, requireFeature('finance'), validate({ body: updateExpenseSchema }), updateExpense);
router.delete('/expenses/:id', authMiddleware, requireTenantRoles, requireFeature('finance'), deleteExpense);
router.get('/expenses', authMiddleware, requireTenantRoles, requireFeature('finance'), getExpenses);

export default router;
