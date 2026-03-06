'use client';

import { Scissors, Clock, DollarSign, Edit2, Trash2 } from 'lucide-react';
import type { Service } from '@/types';

interface ServiceCardProps {
  service: Service;
  onEdit: () => void;
  onDelete: () => void;
}

export const ServiceCard = ({ service, onEdit, onDelete }: ServiceCardProps) => (
  <div className="card rounded-2xl p-6 hover:border-primary/30 transition-all group">
    <div className="flex justify-between items-start mb-4">
      <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
        <Scissors size={24} />
      </div>
      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
        <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-primary transition-colors">
          <Edit2 size={16} />
        </button>
        <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
    <h3 className="text-xl font-bold text-white mb-1">{service.name}</h3>
    <div className="flex items-center gap-4 text-sm text-gray-400">
      <span className="flex items-center gap-1.5">
        <Clock size={16} className="text-primary" /> {service.duration_minutes} min
      </span>
      <span className="flex items-center gap-1.5">
        <DollarSign size={16} className="text-green-500" /> R$ {parseFloat(service.price.toString()).toFixed(2)}
      </span>
    </div>
  </div>
);
