'use client';

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface FinanceChartProps {
  data: Array<{ date: string; earnings: number; expenses: number }>;
}

function safeFormatDate(dateStr: string, formatStr: string) {
  try {
    if (!dateStr) return '---';
    const date = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
    if (isNaN(date.getTime())) return '';
    return format(date, formatStr, { locale: ptBR });
  } catch {
    return '';
  }
}

export function FinanceChart({ data }: FinanceChartProps) {
  return (
    <div className="card p-6 rounded-2xl">
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-lg font-bold text-white uppercase tracking-tight">Gráfico de Crescimento</h3>
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-primary" />
            <span className="text-xs text-gray-400 font-bold">Ganhos</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-gray-600" />
            <span className="text-xs text-gray-400 font-bold">Gastos</span>
          </div>
        </div>
      </div>
      <div className="h-[350px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorEarnings" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#cc8529" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#cc8529" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="#4b5563"
              fontSize={12}
              tickFormatter={(val) => safeFormatDate(val, 'dd/MM')}
            />
            <YAxis stroke="#4b5563" fontSize={12} tickFormatter={(val) => `R$ ${val}`} />
            <Tooltip
              contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '12px' }}
              labelStyle={{ color: '#9ca3af', marginBottom: '8px', fontWeight: 'bold' }}
            />
            <Area type="monotone" dataKey="earnings" name="Ganhos" stroke="#cc8529" strokeWidth={3} fillOpacity={1} fill="url(#colorEarnings)" />
            <Area type="monotone" dataKey="expenses" name="Gastos" stroke="#4b5563" strokeWidth={2} fillOpacity={0} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
