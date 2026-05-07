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
