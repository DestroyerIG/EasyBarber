import type { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../../utils/response.js';
import { billingService } from '../../services/billingService.js';
import { couponService } from '../../services/couponService.js';
import { AppError } from '../../utils/errors.js';
import type { WebhookResult } from './billing.types.js';

const PLAN_BASE_AMOUNTS: Record<string, number> = {
  basico: 49.9,
  profissional: 99.9,
  premium: 199.9,
};

export const createCheckoutSession = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await billingService.createCheckoutSession(
      req.user.barbershopId!,
      req.body.plan,
      req.body.paymentMethod,
      req.body.couponCode
    );
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const getBillingStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await billingService.getStatus(req.user.barbershopId!);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const cancelBillingSubscription = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await billingService.cancelSubscription(req.user.barbershopId!);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const reactivateBillingSubscription = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await billingService.reactivateSubscription(req.user.barbershopId!);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const getPixPaymentStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await billingService.getPixPaymentStatus(
      req.user.barbershopId!,
      req.params['paymentId'] as string
    );
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const handleAsaasWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await billingService.handleAsaasWebhook(req.body, req.headers as Record<string, string>) as {
      processed: boolean;
      duplicate?: boolean;
      eventType?: string;
    };
    const payload: WebhookResult = {
      received: true,
      processed: result.processed,
      duplicate: Boolean(result.duplicate),
      eventType: result.eventType ?? null,
    };
    sendSuccess(res, payload);
  } catch (error) {
    next(error);
  }
};

export const validateCoupon = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { code, plan } = req.body as { code: string; plan: string };
    const normalizedPlan = plan.trim().toLowerCase();
    const baseAmount = PLAN_BASE_AMOUNTS[normalizedPlan];

    if (!baseAmount) {
      throw new AppError('Plano inválido', 400, 'INVALID_PLAN');
    }

    const { finalAmount } = await couponService.validate(code, baseAmount) as {
      finalAmount: number;
    };

    const adjustedFinalAmount = finalAmount > 0 && finalAmount < 5 ? 5 : finalAmount;
    const adjustedDiscount = Number((baseAmount - adjustedFinalAmount).toFixed(2));

    res.json({
      valid: true,
      discount: adjustedDiscount,
      finalAmount: adjustedFinalAmount,
      originalAmount: baseAmount,
    });
  } catch (error) {
    next(error);
  }
};
