'use client';

import { ServiceBarberModule } from '@/components/ServiceBarberModule';
import { FeatureGate } from '@/components/billing/FeatureGate';
import { useDashboardBilling } from '@/hooks/useDashboardBilling';

export default function ServicosPage() {
  const { access, goToPlans, openBillingPortal } = useDashboardBilling();

  return (
    <FeatureGate
      access={access.evaluate('services')}
      onUpgrade={goToPlans}
      onManageBilling={openBillingPortal}
      title="Gestão de serviços indisponível"
    >
      <ServiceBarberModule />
    </FeatureGate>
  );
}