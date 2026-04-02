'use client';

import type { LucideIcon } from 'lucide-react';

interface AdminMetricCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'primary';
}

const toneClasses: Record<NonNullable<AdminMetricCardProps['tone']>, string> = {
  neutral: 'text-gray-300 bg-white/5 border-white/10',
  success: 'text-emerald-300 bg-emerald-500/10 border-emerald-400/20',
  warning: 'text-amber-300 bg-amber-500/10 border-amber-400/20',
  danger: 'text-rose-300 bg-rose-500/10 border-rose-400/20',
  primary: 'text-primary bg-primary/10 border-primary/20',
};

export function AdminMetricCard({ label, value, icon: Icon, tone = 'neutral' }: AdminMetricCardProps) {
  return (
    <article className={`rounded-xl border p-4 ${toneClasses[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">{label}</p>
          <p className="mt-2 text-2xl font-black text-white">{value}</p>
        </div>
        <Icon size={18} className="opacity-80" />
      </div>
    </article>
  );
}
