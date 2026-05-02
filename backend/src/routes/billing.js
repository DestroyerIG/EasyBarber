import express from 'express';
import pool from '../config/database.js';
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
    if (!code || !plan) throw new AppError('code e plan são obrigatórios', 400, 'MISSING_PARAMS');

    const PLAN_VALUES = { basico: 49.9, profissional: 99.9, premium: 199.9 };
    const baseAmount = PLAN_VALUES[plan?.toLowerCase()];
    if (!baseAmount) throw new AppError('Plano inválido', 400, 'INVALID_PLAN');

    const result = await pool.query(
      `SELECT * FROM coupons
       WHERE UPPER(code) = UPPER($1)
         AND active = TRUE
         AND (valid_until IS NULL OR valid_until > NOW())
         AND (max_uses IS NULL OR current_uses < max_uses)`,
      [code.trim()]
    );
    const coupon = result.rows[0];
    if (!coupon) throw new AppError('Cupom inválido ou expirado.', 400, 'INVALID_COUPON');

    const discount =
      coupon.discount_type === 'percent'
        ? Number(((baseAmount * Number(coupon.discount_value)) / 100).toFixed(2))
        : Math.min(Number(coupon.discount_value), baseAmount);

    let finalAmount = Math.max(0, Number((baseAmount - discount).toFixed(2)));
    if (finalAmount > 0 && finalAmount < 5) {
      finalAmount = 5;
    }

    const adjustedDiscount = Number((baseAmount - finalAmount).toFixed(2));

    res.json({ valid: true, discount: adjustedDiscount, finalAmount, originalAmount: baseAmount });
  } catch (err) { next(err); }
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
