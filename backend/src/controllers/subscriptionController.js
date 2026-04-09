import { subscriptionService } from '../services/subscriptionService.js';
import { sendSuccess } from '../utils/response.js';
import { createCheckoutSessionSchema } from '../validators/schemas/index.js';
import { UnauthorizedError } from '../utils/errors.js';

export { createCheckoutSessionSchema };

export const createCheckoutSession = async (req, res, next) => {
  try {
    const data = await subscriptionService.createCheckoutSession(
      req.user.barbershopId,
      req.body.plan,
      req.body.paymentMethod
    );
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const getSubscriptionStatus = async (req, res, next) => {
  try {
    const data = await subscriptionService.getStatus(req.user.barbershopId);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const createPortalSession = async (req, res, next) => {
  try {
    const data = await subscriptionService.createPortalSession(req.user.barbershopId);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const stripeWebhook = async (req, res, next) => {
  try {
    const signature = req.headers['stripe-signature'];

    if (!signature) {
      throw new UnauthorizedError('Assinatura do webhook Stripe ausente');
    }

    const result = await subscriptionService.handleWebhook(req.body, signature);

    sendSuccess(res, {
      received: true,
      processed: result.processed,
      duplicate: Boolean(result.duplicate),
      eventType: result.eventType || null,
    });
  } catch (error) {
    next(error);
  }
};
