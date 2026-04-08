'use client';

import { useAuth } from '@/contexts/AuthContext';
import { SettingsModule } from '@/components/SettingsModule';
import { FeatureGate } from '@/components/billing/FeatureGate';
import { useDashboardBilling } from '@/hooks/useDashboardBilling';

export default function ConfiguracoesPage() {
  const { user } = useAuth();
  const { access, goToPlans, openBillingPortal } = useDashboardBilling();

  return (
    <FeatureGate
      access={access.evaluate('advanced_admin')}
      onUpgrade={goToPlans}
      onManageBilling={openBillingPortal}
      title="Administração avançada indisponível"
    >
      <SettingsModule initialBarbershopName={user?.barbershopName || ''} />
    </FeatureGate>
  );
}