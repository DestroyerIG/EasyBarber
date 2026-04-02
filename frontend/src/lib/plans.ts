export type PlanId = 'basico' | 'profissional' | 'premium';

export interface SaaSPlan {
  id: PlanId;
  name: string;
  price: number;
  description: string;
  recommended?: boolean;
  ctaLabel: string;
  features: string[];
}

export const SAAS_PLANS: SaaSPlan[] = [
  {
    id: 'basico',
    name: 'Básico',
    price: 49,
    description: 'Para barbearias enxutas que precisam organizar a operação sem complexidade.',
    ctaLabel: 'Começar no Básico',
    features: [
      '1 barbeiro ativo',
      'Agendamentos online ilimitados',
      'Gestão de clientes com histórico',
      'Lembretes automáticos via WhatsApp',
      'Controle financeiro essencial',
    ],
  },
  {
    id: 'profissional',
    name: 'Profissional',
    price: 99,
    description: 'Plano ideal para crescimento com mais equipe, previsibilidade e performance.',
    recommended: true,
    ctaLabel: 'Assinar Profissional',
    features: [
      'Até 5 barbeiros ativos',
      'Agenda inteligente com encaixes',
      'Comissões e produtividade da equipe',
      'Relatórios gerenciais mensais',
      'Financeiro completo com caixa',
      'Bot WhatsApp com fluxos avançados',
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 199,
    description: 'Para operações em expansão que exigem escala, controle e visão estratégica.',
    ctaLabel: 'Escalar com Premium',
    features: [
      'Barbeiros ilimitados',
      'Relatórios avançados e metas',
      'Automação de lembretes e campanhas',
      'Suporte prioritário',
      'Base pronta para multiunidade',
      'Gestão centralizada da operação',
    ],
  },
];

export const PLAN_MAP: Record<PlanId, SaaSPlan> = SAAS_PLANS.reduce((acc, plan) => {
  acc[plan.id] = plan;
  return acc;
}, {} as Record<PlanId, SaaSPlan>);

export const isPlanId = (value: string): value is PlanId => {
  return value === 'basico' || value === 'profissional' || value === 'premium';
};
