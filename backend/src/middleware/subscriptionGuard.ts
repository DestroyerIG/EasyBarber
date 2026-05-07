import type { Request, Response, NextFunction } from 'express';
import { FeatureAccessError } from '../utils/errors.js';
import { evaluateFeatureAccess } from '../services/featureAccessService.js';

export const requireFeature = (feature: string) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const decision = evaluateFeatureAccess({
      feature,
      plan: req.user?.plan,
      subscriptionStatus: req.user?.subscriptionStatus,
    });

    if (!decision.allowed) {
      return next(new FeatureAccessError(feature, decision));
    }

    return next();
  };
};
