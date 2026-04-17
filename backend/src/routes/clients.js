import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requireTenantRoles } from '../middleware/rbac.js';
import { requireFeature } from '../middleware/subscriptionGuard.js';
import { validate } from '../middleware/validate.js';
import {
  getClients,
  createClient,
  updateClient,
  getClientHistory,
  normalizeClientBody,
  createClientSchema,
  updateClientSchema
} from '../controllers/clientController.js';

const router = express.Router();

router.get('/', authMiddleware, requireTenantRoles, requireFeature('clients'), getClients);
router.post('/', authMiddleware, requireTenantRoles, requireFeature('clients'), normalizeClientBody, validate({ body: createClientSchema }), createClient);
router.put('/:id', authMiddleware, requireTenantRoles, requireFeature('clients'), normalizeClientBody, validate({ body: updateClientSchema }), updateClient);
router.get('/:id/history', authMiddleware, requireTenantRoles, requireFeature('clients'), getClientHistory);

export default router;
