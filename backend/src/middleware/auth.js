import jwt from 'jsonwebtoken';
import { UnauthorizedError, PlanLimitError, SubscriptionStatusError } from '../utils/errors.js';
import { normalizeRole } from '../utils/roles.js';

const resolveJwtSecret = () => {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  if (process.env.NODE_ENV === 'test') {
    return 'test-secret';
  }

  throw new UnauthorizedError('Configuração JWT inválida');
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
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('Token expirado'));
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
