import { FeatureAccessError } from '../utils/errors.js';
import { evaluateFeatureAccess } from '../services/featureAccessService.js';

export const requireFeature = (feature) => {
  return (req, _res, next) => {
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