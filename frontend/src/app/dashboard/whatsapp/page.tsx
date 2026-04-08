'use client';

import { WhatsAppModule } from '@/components/WhatsAppModule';
import { FeatureGate } from '@/components/billing/FeatureGate';
import { useDashboardBilling } from '@/hooks/useDashboardBilling';

export default function WhatsAppPage() {
  const { access, goToPlans, openBillingPortal } = useDashboardBilling();

  return (
    <FeatureGate
      access={access.evaluate('whatsapp_automation')}
      onUpgrade={goToPlans}
      onManageBilling={openBillingPortal}
      title="Automação WhatsApp indisponível"
    >
      <WhatsAppModule />
    </FeatureGate>
  );
}