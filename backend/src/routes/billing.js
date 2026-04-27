import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requireTenantRoles } from '../middleware/rbac.js';
import { requireFeature } from '../middleware/subscriptionGuard.js';
import { validate } from '../middleware/validate.js';
import {
  asaasWebhook,
  billingActionBodySchema,
  billingPixPaymentParamsSchema,
  cancelBillingSubscription,
  createBillingCheckoutSessionSchema,
  createCheckoutSession,
  getBillingStatus,
  getPixPaymentStatus,
  reactivateBillingSubscription,
} from '../controllers/billingController.js';

const router = express.Router();

router.post('/webhooks/asaas', asaasWebhook);
router.post('/webhook/asaas', asaasWebhook);

router.post(
  '/checkout/session',
  authMiddleware,
  requireTenantRoles,
  requireFeature('billing'),
  validate({ body: createBillingCheckoutSessionSchema }),
  createCheckoutSession
);

router.get(
  '/status',
  authMiddleware,
  requireTenantRoles,
  requireFeature('subscription_status'),
  getBillingStatus
);

router.post(
  '/cancel',
  authMiddleware,
  requireTenantRoles,
  requireFeature('billing'),
  validate({ body: billingActionBodySchema }),
  cancelBillingSubscription
);

router.post(
  '/reactivate',
  authMiddleware,
  requireTenantRoles,
  requireFeature('billing'),
  validate({ body: billingActionBodySchema }),
  reactivateBillingSubscription
);

router.get(
  '/pix/:paymentId',
  authMiddleware,
  requireTenantRoles,
  requireFeature('billing'),
  validate({ params: billingPixPaymentParamsSchema }),
  getPixPaymentStatus
);

export default router;
