'use client';

import type { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  color: string;
}

export function StatsCard({ label, value, icon: Icon, color }: StatsCardProps) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        <Icon className={color} size={20} />
        <div>
          <p className="text-2xl font-bold text-white">{value}</p>
          <p className="text-xs text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );
}
