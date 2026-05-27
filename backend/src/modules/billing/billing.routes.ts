import express, { type Request, type Response, type NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import Stripe from 'stripe';
import { authMiddleware } from '../../middleware/auth.js';
import { requireTenantRoles } from '../../middleware/rbac.js';
import { requireFeature } from '../../middleware/subscriptionGuard.js';
import { validate } from '../../middleware/validate.js';
import { AppError, UnauthorizedError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';
import {
  CreateCheckoutSessionSchema,
  BillingActionBodySchema,
  PixPaymentParamsSchema,
  ValidateCouponBodySchema,
} from './billing.types.js';
import {
  createCheckoutSession,
  getBillingStatus,
  cancelBillingSubscription,
  reactivateBillingSubscription,
  getPixPaymentStatus,
  handleAsaasWebhook,
  validateCoupon,
} from './billing.controller.js';
import { stripeWebhook } from '../../controllers/subscriptionController.js';

const router = express.Router();

// ─── Stripe webhook — raw body antes do JSON parser ───────────────────────────

const stripeWebhookMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !secret) {
    logger.warn({ requestId: req.requestId }, 'Stripe webhook: assinatura ou secret ausente');
    res.status(400).json({ error: 'Missing signature' });
    return;
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2025-02-24.acacia' as Stripe.LatestApiVersion,
    });
    stripe.webhooks.constructEvent(
      req.body as Buffer,
      sig,
      secret
    );
    next();
  } catch (err) {
    logger.warn({ err, requestId: req.requestId }, 'Stripe webhook: assinatura inválida');
    res.status(400).json({ error: 'Invalid signature' });
  }
};

router.post(
  '/webhook/stripe',
  express.raw({ type: 'application/json' }),
  stripeWebhookMiddleware,
  stripeWebhook
);

router.post(
  '/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  stripeWebhookMiddleware,
  stripeWebhook
);

// ─── Asaas webhook — token validation com timing-safe compare ─────────────────

const ASAAS_TOKEN_HEADERS = [
  'asaas-access-token',
  'x-asaas-access-token',
  'x-webhook-token',
];

const asaasWebhookMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;

  if (!expected) {
    next();
    return;
  }

  let token: string | null = null;
  for (const header of ASAAS_TOKEN_HEADERS) {
    const value = req.headers[header];
    if (typeof value === 'string' && value.trim()) {
      token = value.trim();
      break;
    }
  }

  // Fallback: Authorization Bearer
  if (!token) {
    const auth = req.headers['authorization'];
    if (typeof auth === 'string') {
      const match = auth.match(/^Bearer\s+(.+)$/i);
      if (match?.[1]) token = match[1].trim();
    }
  }

  if (!token) {
    logger.warn({ requestId: req.requestId }, 'Asaas webhook: token ausente');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const tokenBuf = Buffer.from(token);
    const expectedBuf = Buffer.from(expected);
    const valid =
      tokenBuf.length === expectedBuf.length &&
      timingSafeEqual(tokenBuf, expectedBuf);

    if (!valid) {
      logger.warn({ requestId: req.requestId }, 'Asaas webhook: token inválido');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  } catch (err) {
    logger.error({ err, requestId: req.requestId }, 'Asaas webhook: erro ao validar token');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
};

router.post('/webhooks/asaas', asaasWebhookMiddleware, handleAsaasWebhook);
router.post('/webhook/asaas', asaasWebhookMiddleware, handleAsaasWebhook);

// ─── Rotas autenticadas ───────────────────────────────────────────────────────

router.post(
  '/validate-coupon',
  authMiddleware,
  validate({ body: ValidateCouponBodySchema }),
  validateCoupon
);

router.post(
  '/checkout/session',
  authMiddleware,
  requireTenantRoles,
  requireFeature('billing'),
  validate({ body: CreateCheckoutSessionSchema }),
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
  validate({ body: BillingActionBodySchema }),
  cancelBillingSubscription
);

router.post(
  '/reactivate',
  authMiddleware,
  requireTenantRoles,
  requireFeature('billing'),
  validate({ body: BillingActionBodySchema }),
  reactivateBillingSubscription
);

router.get(
  '/pix/:paymentId',
  authMiddleware,
  requireTenantRoles,
  requireFeature('billing'),
  validate({ params: PixPaymentParamsSchema }),
  getPixPaymentStatus
);

export default router;
