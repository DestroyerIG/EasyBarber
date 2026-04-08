'use client';

import { FinanceModule } from '@/components/FinanceModule';
import { FeatureGate } from '@/components/billing/FeatureGate';
import { useDashboardBilling } from '@/hooks/useDashboardBilling';

export default function FinanceiroPage() {
  const { access, goToPlans, openBillingPortal } = useDashboardBilling();

  return (
    <FeatureGate
      access={access.evaluate('finance')}
      onUpgrade={goToPlans}
      onManageBilling={openBillingPortal}
      title="Financeiro indisponível"
    >
      <FinanceModule
        reportAccess={access.evaluate('reports')}
        exportAccess={access.evaluate('exports')}
        onUpgrade={goToPlans}
        onManageBilling={openBillingPortal}
      />
    </FeatureGate>
  );
}