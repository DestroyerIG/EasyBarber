'use client';

import Image from 'next/image';
import { Users, Calendar, ChevronRight, Edit2, Trash2 } from 'lucide-react';
import type { Barber } from '@/types';

interface BarberCardProps {
  barber: Barber;
  onEdit: () => void;
  onDelete: () => void;
  onViewAgenda: () => void;
}

export const BarberCard = ({ barber, onEdit, onDelete, onViewAgenda }: BarberCardProps) => (
  <div className="card rounded-2xl p-6 hover:border-primary/30 transition-all group">
    <div className="flex justify-between items-start mb-6">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-primary/20 bg-black/40 flex items-center justify-center">
          {barber.photo ? (
            <Image
              src={barber.photo}
              alt={barber.name}
              width={64}
              height={64}
              unoptimized
              loader={({ src }) => src}
              className="w-full h-full object-cover"
            />
          ) : (
            <Users className="text-primary/40" size={32} />
          )}
        </div>
        <div>
          <h3 className="text-xl font-bold text-white">{barber.name}</h3>
          <p className="text-xs text-primary uppercase font-bold tracking-widest">Profissional</p>
        </div>
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
    <button
      onClick={onViewAgenda}
      className="w-full flex items-center justify-between p-3 bg-black/40 hover:bg-black/60 rounded-xl text-sm font-bold text-gray-300 transition-all"
    >
      <span className="flex items-center gap-2">
        <Calendar size={18} className="text-primary" /> Ver Agenda Individual
      </span>
      <ChevronRight size={16} />
    </button>
  </div>
);
