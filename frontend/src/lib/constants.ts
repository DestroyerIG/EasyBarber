export const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  confirmado: { label: 'Confirmado', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', bg: 'bg-blue-400/10', border: 'border-blue-400/30', dot: 'bg-blue-400' },
  concluido: { label: 'Concluído', color: 'bg-green-500/20 text-green-400 border-green-500/30', bg: 'bg-green-400/10', border: 'border-green-400/30', dot: 'bg-green-400' },
  cancelado: { label: 'Cancelado', color: 'bg-red-500/20 text-red-400 border-red-500/30', bg: 'bg-red-400/10', border: 'border-red-400/30', dot: 'bg-red-400' },
};

export const EXPENSE_CATEGORIES = [
  'Aluguel',
  'Produtos',
  'Equipamentos',
  'Marketing',
  'Energia',
  'Água',
  'Internet',
  'Manutenção',
  'Impostos',
  'Outros',
] as const;

export const PLANS = {
  basico: { name: 'Básico', price: 49, barbers: 1 },
  profissional: { name: 'Profissional', price: 99, barbers: 5 },
  premium: { name: 'Premium', price: 199, barbers: 999 },
} as const;
