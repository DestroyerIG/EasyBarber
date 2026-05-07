import express from 'express';
// @ts-ignore
import { authMiddleware } from '../middleware/auth.js';
// @ts-ignore
import { requireTenantRoles } from '../middleware/rbac.js';
// @ts-ignore
import { requireFeature } from '../middleware/subscriptionGuard.js';
// @ts-ignore
import { getDashboard } from '../controllers/dashboardController.js';

const router = express.Router();

router.get('/', authMiddleware, requireTenantRoles, requireFeature('dashboard'), getDashboard);

export default router;
