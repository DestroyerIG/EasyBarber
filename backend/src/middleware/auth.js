import jwt from 'jsonwebtoken';
import {
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
import logger from '../utils/logger.js';

const SUBSCRIPTION_EXEMPT_ROUTES = [
  /^\/api\/v1\/auth\/me$/i,
  /^\/api\/v1\/auth\/logout$/i,
  /^\/api\/v1\/billing\/status$/i,
  /^\/api\/v1\/billing\/checkout\/session$/i,
  /^\/api\/v1\/billing\/pix\/[^/]+$/i,
  /^\/api\/v1\/billing\/webhooks\/asaas$/i,
  /^\/api\/v1\/billing\/webhook\/asaas$/i,
  /^\/api\/v1\/billing\/webhook\/stripe$/i,
  /^\/api\/v1\/subscriptions\/status$/i,
  /^\/api\/v1\/subscriptions\/checkout-session$/i,
  /^\/api\/v1\/barbershop\/account-profile$/i,
];

const ACTIVE_ACCESS_STATUSES = new Set(['active', 'trialing']);

const resolveJwtSecret = () => {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  if (process.env.NODE_ENV === 'test') {
    return 'test-secret';
  }

  throw new UnauthorizedError('Configuração JWT inválida');
};

const isSubscriptionExemptRoute = (req) => {
  const path = String(req.originalUrl || req.url || '').split('?')[0];
  return SUBSCRIPTION_EXEMPT_ROUTES.some((pattern) => pattern.test(path));
};

const hasActivePaymentEvidence = (context, provider) => {
  const paymentMethod = String(context?.payment_method || '').toLowerCase();
  const status = normalizeInternalSubscriptionStatus(context?.subscription_status);

  if (status !== 'active' && status !== 'trialing') {
    return false;
  }

  if (status === 'trialing') {
    return Boolean(
      context?.stripe_subscription_id ||
      context?.provider_subscription_id
    );
  }

  if (provider === 'asaas' || paymentMethod === 'pix') {
    return Boolean(
      context?.provider_payment_id &&
      context?.last_payment_date
    );
  }

  if (provider === 'stripe' || paymentMethod === 'card') {
    return Boolean(
      context?.stripe_subscription_id ||
      context?.provider_subscription_id
    );
  }

  return false;
};

const resolveSubscriptionAccess = (context) => {
  if (!context) {
    return {
      granted: false,
      subscriptionStatus: 'incomplete',
      provider: null,
      paymentMethod: null,
      reason: 'barbershop_not_found',
    };
  }

  const subscriptionStatus = normalizeInternalSubscriptionStatus(context.subscription_status);
  const provider = resolveBillingProviderFromContext(context);
  const paymentMethod = context.payment_method || null;

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

const enforceActiveSubscription = async (req) => {
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

  const context = await subscriptionRepository.getBarbershopBillingContext(barbershopId);
  const decision = resolveSubscriptionAccess(context);

  req.subscriptionAccess = decision;
  req.user.subscriptionStatus = decision.subscriptionStatus;

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

export const authMiddleware = async (req, res, next) => {
  try {
    // Prioridade 1: httpOnly cookie (seguro)
    // Prioridade 2: Authorization header (compatibilidade/mobile)
    const token =
      req.cookies?.access_token ||
      req.headers.authorization?.split(' ')[1];

    if (!token) {
      return next(new UnauthorizedError('Token não fornecido'));
    }

    const decoded = jwt.verify(token, resolveJwtSecret());
    req.user = {
      ...decoded,
      role: normalizeRole(decoded.role),
    };
    await enforceActiveSubscription(req);
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('Token expirado'));
    }
    if (error.isOperational) {
      return next(error);
    }
    if (error.name !== 'JsonWebTokenError' && error.name !== 'NotBeforeError') {
      return next(error);
    }
    return next(new UnauthorizedError('Token inválido'));
  }
};

export const checkPlan = (requiredPlan) => {
  const planLevels = { basico: 1, profissional: 2, premium: 3 };

  return (req, res, next) => {
    const userPlanLevel = planLevels[req.user.plan] || 0;
    const requiredLevel = planLevels[requiredPlan];

    if (requiredLevel === undefined || userPlanLevel < requiredLevel) {
      return next(new PlanLimitError(requiredPlan));
    }

    next();
  };
};

export const checkSubscriptionStatus = (allowedStatuses = ['active', 'trialing']) => {
  return (req, res, next) => {
    const currentStatus = req.user.subscriptionStatus || 'incomplete';

    if (!allowedStatuses.includes(currentStatus)) {
      return next(new SubscriptionStatusError(currentStatus));
    }

    next();
  };
};
