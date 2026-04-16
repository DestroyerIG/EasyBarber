import { billingService } from '../services/billingService.js';
import { sendSuccess } from '../utils/response.js';
import {
  billingActionBodySchema,
  billingPixPaymentParamsSchema,
  createBillingCheckoutSessionSchema,
} from '../validators/schemas/index.js';

export {
  createBillingCheckoutSessionSchema,
  billingActionBodySchema,
  billingPixPaymentParamsSchema,
};

export const createCheckoutSession = async (req, res, next) => {
  try {
    const data = await billingService.createCheckoutSession(
      req.user.barbershopId,
      req.body.plan,
      req.body.paymentMethod
    );

    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const getBillingStatus = async (req, res, next) => {
  try {
    const data = await billingService.getStatus(req.user.barbershopId);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const cancelBillingSubscription = async (req, res, next) => {
  try {
    const data = await billingService.cancelSubscription(req.user.barbershopId);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const reactivateBillingSubscription = async (req, res, next) => {
  try {
    const data = await billingService.reactivateSubscription(req.user.barbershopId);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const getPixPaymentStatus = async (req, res, next) => {
  try {
    const data = await billingService.getPixPaymentStatus(
      req.user.barbershopId,
      req.params.paymentId
    );

    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const asaasWebhook = async (req, res, next) => {
  try {
    const result = await billingService.handleAsaasWebhook(req.body, req.headers);

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
