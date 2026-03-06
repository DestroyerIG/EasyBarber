import jwt from 'jsonwebtoken';
import { UnauthorizedError, PlanLimitError } from '../utils/errors.js';

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

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
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
