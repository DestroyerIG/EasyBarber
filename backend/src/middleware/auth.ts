import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import {
  AppError,
  UnauthorizedError,
  PlanLimitError,
  SubscriptionStatusError,
  SubscriptionRequiredError,
} from '../utils/errors.js';
import { normalizeRole } from '../utils/roles.js';
import { subscriptionRepository } from '../repositories/subscriptionRepository.js';
import {
  normalizeInternalSubscriptionStatus,
  resolveBillingProviderFromContext,
} from '../services/billing/statusMapper.js';
import { normalizePlan } from '../config/planPermissions.js';
import logger from '../utils/logger.js';
import { setRequestContext } from '../modules/core/middleware/requestContext.js';
import type {
  JwtPayload,
  BarbershopBillingContext,
  SubscriptionAccessDecision,
  BillingProvider,
  PaymentMethod,
  SubscriptionStatus,
} from '../types/domain.js';

const SUBSCRIPTION_EXEMPT_ROUTES: RegExp[] = [
  /^\/api\/v1\/auth\/me$/i,
  /^\/api\/v1\/auth\/logout$/i,
  /^\/api\/v1\/billing\/status$/i,
  /^\/api\/v1\/billing\/validate-coupon$/i,
  /^\/api\/v1\/billing\/checkout\/session$/i,
  /^\/api\/v1\/billing\/pix\/[^/]+$/i,
  /^\/api\/v1\/billing\/webhooks\/asaas$/i,
  /^\/api\/v1\/billing\/webhook\/asaas$/i,
  /^\/api\/v1\/billing\/webhook\/stripe$/i,
  /^\/api\/v1\/subscriptions\/status$/i,
  /^\/api\/v1\/subscriptions\/checkout-session$/i,
  /^\/api\/v1\/barbershop\/account-profile$/i,
];

const ACTIVE_ACCESS_STATUSES = new Set<SubscriptionStatus>(['active', 'trialing']);

const resolveJwtSecret = (): string => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'test') return 'test-secret';
  throw new UnauthorizedError('Configuração JWT inválida');
};

const isSubscriptionExemptRoute = (req: Request): boolean => {
  const path = String(req.originalUrl ?? req.url ?? '').split('?')[0] ?? '';
  return SUBSCRIPTION_EXEMPT_ROUTES.some((pattern) => pattern.test(path));
};

const hasActivePaymentEvidence = (
  context: BarbershopBillingContext,
  _provider: BillingProvider | null
): boolean => {
  const status = normalizeInternalSubscriptionStatus(
    context?.subscription_status
  ) as SubscriptionStatus;

  // DB subscription_status is the source of truth.
  // 'active' or 'trialing' in the database means the subscription is valid —
  // webhook, admin activation, or coupon already confirmed it.
  return status === 'active' || status === 'trialing';
};

const resolveSubscriptionAccess = (
  context: BarbershopBillingContext | null
): SubscriptionAccessDecision => {
  if (!context) {
    return {
      granted: false,
      subscriptionStatus: 'incomplete',
      provider: null,
      paymentMethod: null,
      reason: 'barbershop_not_found',
    };
  }

  const subscriptionStatus = normalizeInternalSubscriptionStatus(
    context.subscription_status
  ) as SubscriptionStatus;
  const provider = resolveBillingProviderFromContext(context) as BillingProvider | null;
  const paymentMethod = (context.payment_method ?? null) as PaymentMethod | null;

  if (!ACTIVE_ACCESS_STATUSES.has(subscriptionStatus)) {
    return {
      granted: false,
      subscriptionStatus,
      provider,
      paymentMethod,
      reason: 'subscription_status_not_active',
    };
  }

  if (!hasActivePaymentEvidence(context, provider)) {
    return {
      granted: false,
      subscriptionStatus,
      provider,
      paymentMethod,
      reason: 'missing_payment_evidence',
    };
  }

  return {
    granted: true,
    subscriptionStatus,
    provider,
    paymentMethod,
    reason: 'subscription_active',
  };
};

const enforceActiveSubscription = async (req: Request): Promise<void> => {
  if (!req.user || req.user.role === 'platform_admin' || isSubscriptionExemptRoute(req)) {
    return;
  }

  const barbershopId = req.user.barbershopId;
  const userId = req.user.userId;

  if (!barbershopId) {
    logger.warn(
      {
        userId,
        barbershopId: null,
        subscriptionStatus: null,
        paymentMethod: null,
        provider: null,
        accessGranted: false,
        reason: 'missing_barbershop_context',
      },
      'Acesso bloqueado por assinatura'
    );
    throw new SubscriptionRequiredError({ reason: 'missing_barbershop_context' });
  }

  const context = await subscriptionRepository.getBarbershopBillingContext(barbershopId) as BarbershopBillingContext | null;
  const decision = resolveSubscriptionAccess(context);

  req.subscriptionAccess = decision;
  req.user.subscriptionStatus = decision.subscriptionStatus;
  // Always sync plan from DB — JWT payload may be stale (e.g. activated via coupon after login)
  req.user.plan = normalizePlan(context?.plan);

  logger[decision.granted ? 'info' : 'warn'](
    {
      userId,
      barbershopId,
      subscriptionStatus: decision.subscriptionStatus,
      paymentMethod: decision.paymentMethod,
      provider: decision.provider,
      accessGranted: decision.granted,
      reason: decision.reason,
    },
    decision.granted ? 'Acesso liberado por assinatura' : 'Acesso bloqueado por assinatura'
  );

  if (!decision.granted) {
    throw new SubscriptionRequiredError({
      subscriptionStatus: decision.subscriptionStatus,
      reason: decision.reason,
    });
  }
};

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token =
      (req.cookies as Record<string, string> | undefined)?.['access_token'] ??
      req.headers.authorization?.split(' ')[1];

    if (!token) {
      return next(new UnauthorizedError('Token não fornecido'));
    }

    const decoded = jwt.verify(token, resolveJwtSecret()) as JwtPayload;
    req.user = {
      ...decoded,
      role: normalizeRole(decoded.role) ?? decoded.role,
      subscriptionStatus: decoded.subscriptionStatus ?? 'incomplete',
    };
    setRequestContext({ userId: req.user.userId, barbershopId: req.user.barbershopId ?? undefined });
    await enforceActiveSubscription(req);
    next();
  } catch (error) {
    const err = error as Error & { name: string };
    if (err.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('Token expirado'));
    }
    if ((error as AppError)?.isOperational) {
      return next(error);
    }
    if (err.name !== 'JsonWebTokenError' && err.name !== 'NotBeforeError') {
      return next(error);
    }
    return next(new UnauthorizedError('Token inválido'));
  }
};

export const checkPlan = (requiredPlan: string) => {
  const planLevels: Record<string, number> = { basico: 1, profissional: 2, premium: 3 };

  return (req: Request, _res: Response, next: NextFunction): void => {
    const userPlanLevel = planLevels[req.user?.plan ?? ''] ?? 0;
    const requiredLevel = planLevels[requiredPlan];

    if (requiredLevel === undefined || userPlanLevel < requiredLevel) {
      return next(new PlanLimitError(requiredPlan));
    }

    next();
  };
};

export const checkSubscriptionStatus = (
  allowedStatuses: SubscriptionStatus[] = ['active', 'trialing']
) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const currentStatus = (req.user?.subscriptionStatus ?? 'incomplete') as SubscriptionStatus;

    if (!allowedStatuses.includes(currentStatus)) {
      return next(new SubscriptionStatusError(currentStatus));
    }

    next();
  };
};
