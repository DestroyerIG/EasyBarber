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
  getClients,
  createClient,
  updateClient,
  getClientHistory,
  normalizeClientBody,
  createClientSchema,
  updateClientSchema,
} from '../controllers/clientController.js';

const router = express.Router();

router.get('/', authMiddleware, requireTenantRoles, requireFeature('clients'), getClients);
router.post('/', authMiddleware, requireTenantRoles, requireFeature('clients'), normalizeClientBody, validate({ body: createClientSchema }), createClient);
router.put('/:id', authMiddleware, requireTenantRoles, requireFeature('clients'), normalizeClientBody, validate({ body: updateClientSchema }), updateClient);
router.get('/:id/history', authMiddleware, requireTenantRoles, requireFeature('clients'), getClientHistory);

export default router;
