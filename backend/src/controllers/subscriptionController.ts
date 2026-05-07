import type { Request, Response, NextFunction } from 'express';
import { subscriptionService } from '../services/subscriptionService.js';
import { sendSuccess } from '../utils/response.js';
import { createCheckoutSessionSchema } from '../validators/schemas/index.js';
import { UnauthorizedError } from '../utils/errors.js';
import logger from '../utils/logger.js';

export { createCheckoutSessionSchema };

export const createCheckoutSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await subscriptionService.createCheckoutSession(
      req.user.barbershopId!,
      req.body.plan as string,
      (req.body.paymentMethod as string | undefined) ?? ''
    );
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const getSubscriptionStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await subscriptionService.getStatus(req.user.barbershopId!);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const createPortalSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await subscriptionService.createPortalSession(req.user.barbershopId!);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const stripeWebhook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const signature = req.headers['stripe-signature'] as string | undefined;

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
    logger.error(
      {
        event: 'stripe_webhook_error',
        err: error,
        route: req.originalUrl,
      },
      'Erro no webhook Stripe'
    );

    next(error);
  }
};
