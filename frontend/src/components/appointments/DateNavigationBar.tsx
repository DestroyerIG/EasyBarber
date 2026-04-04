'use client';

import { ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { formatDate, formatDateShort, getToday, addDays } from '@/lib/dateUtils';
import { STATUS_CONFIG } from '@/lib/constants';

type ViewMode = 'day' | 'week';
type StatusFilter = 'todos' | 'confirmado' | 'concluido' | 'cancelado';

interface DateNavigationBarProps {
  selectedDate: string;
  viewMode: ViewMode;
  statusFilter: StatusFilter;
  onDateChange: (date: string) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onStatusFilterChange: (filter: StatusFilter) => void;
}

export function DateNavigationBar({
  selectedDate, viewMode, statusFilter,
  onDateChange, onViewModeChange, onStatusFilterChange
}: DateNavigationBarProps) {
  const step = viewMode === 'day' ? 1 : 7;

  return (
    <div className="card p-4 mb-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onDateChange(addDays(selectedDate, -step))}
            className="btn-secondary p-2"
            aria-label="Período anterior"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="text-center min-w-[200px]">
            <p className="text-white font-semibold capitalize">
              {viewMode === 'day'
                ? formatDate(selectedDate)
                : `${formatDateShort(selectedDate)} — ${formatDateShort(addDays(selectedDate, 6))}`
              }
            </p>
          </div>
          <button
            onClick={() => onDateChange(addDays(selectedDate, step))}
            className="btn-secondary p-2"
            aria-label="Próximo período"
          >
            <ChevronRight size={20} />
          </button>
          <button
            onClick={() => onDateChange(getToday())}
            className="px-3 py-1.5 text-xs rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-all"
          >
            Hoje
          </button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex rounded-lg overflow-hidden border border-white/10">
            {(['day', 'week'] as ViewMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => onViewModeChange(mode)}
                className={`px-4 py-2 text-xs font-medium transition-all ${
                  viewMode === mode ? 'tab-active' : 'tab-inactive'
                }`}
              >
                {mode === 'day' ? 'Dia' : 'Semana'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <Filter size={14} className="text-gray-500" />
            {(['todos', 'confirmado', 'concluido', 'cancelado'] as StatusFilter[]).map(status => (
              <button
                key={status}
                onClick={() => onStatusFilterChange(status)}
                className={`px-3 py-1.5 text-xs rounded-lg transition-all ${
                  statusFilter === status
                    ? 'bg-primary/20 text-primary border border-primary/30'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                }`}
              >
                {status === 'todos' ? 'Todos' : STATUS_CONFIG[status].label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
