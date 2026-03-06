'use client';

import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    icon?: LucideIcon;
    onClick: () => void;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="card p-12">
      <div className="flex flex-col items-center justify-center">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <Icon className="text-primary" size={36} />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
        <p className="text-gray-500 text-center max-w-sm mb-6">{description}</p>
        {action && (
          <button onClick={action.onClick} className="btn-primary flex items-center gap-2">
            {action.icon && <action.icon size={18} />}
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
