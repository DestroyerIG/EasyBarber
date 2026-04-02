'use client';

interface AdminStatusBadgeProps {
  value: string | boolean | null | undefined;
  variant?: 'subscription' | 'account' | 'audit';
}

const statusClass = (value: string) => {
  const normalized = value.toLowerCase();

  if (['active', 'trialing', 'success', 'ok'].includes(normalized)) {
    return 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300';
  }

  if (['past_due', 'incomplete', 'warning'].includes(normalized)) {
    return 'bg-amber-500/15 border-amber-400/40 text-amber-300';
  }

  if (['canceled', 'failed', 'suspended', 'blocked'].includes(normalized)) {
    return 'bg-rose-500/15 border-rose-400/40 text-rose-300';
  }

  return 'bg-white/10 border-white/20 text-gray-200';
};

const normalizeValue = (value: string | boolean | null | undefined, variant?: string) => {
  if (typeof value === 'boolean') {
    if (variant === 'account') {
      return value ? 'active' : 'suspended';
    }

    return value ? 'success' : 'failed';
  }

  if (!value) {
    return 'unknown';
  }

  return value;
};

export function AdminStatusBadge({ value, variant }: AdminStatusBadgeProps) {
  const normalized = normalizeValue(value, variant);

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${statusClass(normalized)}`}>
      {normalized.replace('_', ' ')}
    </span>
  );
}
