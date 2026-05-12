import type { Request, Response, NextFunction } from 'express';
import { FeatureAccessError } from '../utils/errors.js';
import { evaluateFeatureAccess } from '../services/featureAccessService.js';
import logger from '../utils/logger.js';

export const requireFeature = (feature: string) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const decision = evaluateFeatureAccess({
      feature,
      plan: req.user?.plan,
      subscriptionStatus: req.user?.subscriptionStatus,
    });

    if (!decision.allowed) {
      logger.warn({
        event: 'feature_access_blocked',
        tenantId: req.user?.barbershopId,
        feature,
        currentPlan: req.user?.plan,
        requiredPlan: decision.requiredPlan,
        subscriptionStatus: req.user?.subscriptionStatus,
        reason: decision.reason,
      });
      return next(new FeatureAccessError(feature, decision));
    }

    return next();
  };
};
