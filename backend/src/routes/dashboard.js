import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requireTenantRoles } from '../middleware/rbac.js';
import { requireFeature } from '../middleware/subscriptionGuard.js';
import { getDashboard } from '../controllers/dashboardController.js';

const router = express.Router();

router.get('/', authMiddleware, requireTenantRoles, requireFeature('dashboard'), getDashboard);

export default router;
