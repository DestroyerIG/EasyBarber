import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requireTenantRoles } from '../middleware/rbac.js';
import { requireFeature } from '../middleware/subscriptionGuard.js';
import { validate } from '../middleware/validate.js';
import { couponService } from '../services/couponService.js';
import { AppError } from '../utils/errors.js';
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

router.post('/validate-coupon', authMiddleware, async (req, res, next) => {
  try {
    const { code, plan } = req.body;
    if (!code || !plan) {
      throw new AppError('code e plan são obrigatórios', 400, 'MISSING_PARAMS');
    }

    const PLAN_VALUES = { basico: 49.9, profissional: 99.9, premium: 199.9 };
    const normalizedPlan = String(plan).trim().toLowerCase();
    const baseAmount = PLAN_VALUES[normalizedPlan];

    if (!baseAmount) {
      throw new AppError('Plano inválido', 400, 'INVALID_PLAN');
    }

    const { discount, finalAmount } = await couponService.validateAndApply(code, baseAmount);

    const adjustedFinalAmount =
      finalAmount > 0 && finalAmount < 5 ? 5 : finalAmount;

    const adjustedDiscount = Number((baseAmount - adjustedFinalAmount).toFixed(2));

    res.json({
      valid: true,
      discount: adjustedDiscount,
      finalAmount: adjustedFinalAmount,
      originalAmount: baseAmount,
    });
  } catch (err) {
    next(err);
  }
});

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