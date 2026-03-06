'use client';

import { Clock, User, Scissors, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { formatDateShort } from '@/lib/dateUtils';
import { formatCurrency } from '@/lib/formatters';
import { STATUS_CONFIG } from '@/lib/constants';
import type { Appointment } from '@/types';

interface AppointmentCardProps {
  appointment: Appointment;
  actionLoading: string | null;
  onStatusChange: (id: string, status: 'concluido' | 'cancelado') => void;
}

export function AppointmentCard({ appointment, actionLoading, onStatusChange }: AppointmentCardProps) {
  const sc = STATUS_CONFIG[appointment.status];
  const isLoading = actionLoading === appointment.id;

  return (
    <div className="card p-5 group">
      {/* Time & Status */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Clock className="text-primary" size={22} />
          </div>
          <div>
            <p className="text-white font-bold text-lg">{appointment.time?.substring(0, 5)}</p>
            <p className="text-gray-500 text-xs">{formatDateShort(appointment.date.split('T')[0])}</p>
          </div>
        </div>
        <span className={`badge ${sc.color}`}>
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${sc.dot}`} />
          {sc.label}
        </span>
      </div>

      {/* Details */}
      <div className="space-y-2.5 mb-4">
        <div className="flex items-center gap-2.5 text-sm">
          <User size={14} className="text-gray-500 flex-shrink-0" />
          <span className="text-white">{appointment.client_name}</span>
          {appointment.client_phone && (
            <span className="text-gray-600 text-xs">• {appointment.client_phone}</span>
          )}
        </div>
        <div className="flex items-center gap-2.5 text-sm">
          <Scissors size={14} className="text-gray-500 flex-shrink-0" />
          <span className="text-gray-300">{appointment.barber_name}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">{appointment.service_name}</span>
          <span className="text-primary font-bold">
            {formatCurrency(Number(appointment.service_price || 0))}
          </span>
        </div>
      </div>

      {/* Actions */}
      {appointment.status === 'confirmado' && (
        <div className="flex gap-2 pt-3 border-t border-white/5">
          <button
            onClick={() => onStatusChange(appointment.id, 'concluido')}
            disabled={isLoading}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20 text-xs font-medium transition-all disabled:opacity-50"
          >
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            Concluir
          </button>
          <button
            onClick={() => onStatusChange(appointment.id, 'cancelado')}
            disabled={isLoading}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 text-xs font-medium transition-all disabled:opacity-50"
          >
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
