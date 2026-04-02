import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requireTenantRoles } from '../middleware/rbac.js';
import { requireFeature } from '../middleware/subscriptionGuard.js';
import { validate } from '../middleware/validate.js';
import {
  createCheckoutSession,
  getSubscriptionStatus,
  createPortalSession,
  createCheckoutSessionSchema,
} from '../controllers/subscriptionController.js';

const router = express.Router();

router.post('/checkout-session', authMiddleware, requireTenantRoles, requireFeature('billing'), validate({ body: createCheckoutSessionSchema }), createCheckoutSession);
router.get('/status', authMiddleware, requireTenantRoles, requireFeature('subscription_status'), getSubscriptionStatus);
router.post('/portal', authMiddleware, requireTenantRoles, requireFeature('billing'), createPortalSession);

export default router;
