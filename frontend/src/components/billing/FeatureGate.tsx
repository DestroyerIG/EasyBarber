'use client';

import type { ReactNode } from 'react';
import type { FeatureAccessDecision } from '@/lib/subscriptionAccess';
import { SubscriptionBlockCard } from '@/components/billing/SubscriptionBlockCard';

interface FeatureGateProps {
  access: FeatureAccessDecision;
  children: ReactNode;
  title?: string;
  onUpgrade?: () => void;
  onManageBilling?: () => void;
  className?: string;
}

export const FeatureGate = ({
  access,
  children,
  title,
  onUpgrade,
  onManageBilling,
  className,
}: FeatureGateProps) => {
  if (access.allowed) {
    return <>{children}</>;
  }

  return (
    <SubscriptionBlockCard
      access={access}
      title={title}
      onUpgrade={onUpgrade}
      onManageBilling={onManageBilling}
      className={className}
    />
  );
};