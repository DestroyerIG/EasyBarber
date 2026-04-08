'use client';

import { ClientModule } from '@/components/ClientModule';
import { FeatureGate } from '@/components/billing/FeatureGate';
import { useDashboardBilling } from '@/hooks/useDashboardBilling';

export default function ClientesPage() {
  const { access, goToPlans, openBillingPortal } = useDashboardBilling();

  return (
    <FeatureGate
      access={access.evaluate('clients')}
      onUpgrade={goToPlans}
      onManageBilling={openBillingPortal}
      title="Clientes indisponível"
    >
      <ClientModule />
    </FeatureGate>
  );
}