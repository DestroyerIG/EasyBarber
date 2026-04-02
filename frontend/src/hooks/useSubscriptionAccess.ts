'use client';

import { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { evaluateFeatureAccess, type FeatureAccessDecision, type FeatureKey } from '@/lib/subscriptionAccess';

export const useSubscriptionAccess = (statusOverride?: string | null) => {
  const { user } = useAuth();

  const plan = user?.plan || 'basico';
  const subscriptionStatus = statusOverride || user?.subscriptionStatus || 'active';

  const evaluate = useCallback((feature: FeatureKey): FeatureAccessDecision => {
    return evaluateFeatureAccess({
      feature,
      plan,
      subscriptionStatus,
    });
  }, [plan, subscriptionStatus]);

  const canAccess = useCallback((feature: FeatureKey) => {
    return evaluate(feature).allowed;
  }, [evaluate]);

  return {
    plan,
    subscriptionStatus,
    evaluate,
    canAccess,
  };
};