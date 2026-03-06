'use client';

import { Edit2, Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Expense } from '@/types';

function safeFormatDate(dateStr: string, formatStr: string) {
  try {
    if (!dateStr) return '---';
    const date = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
    if (isNaN(date.getTime())) return 'Data inválida';
    return format(date, formatStr, { locale: ptBR });
  } catch {
    return 'Erro na data';
  }
}

interface ExpensesTableProps {
  expenses: Expense[];
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => void;
}

export function ExpensesTable({ expenses, onEdit, onDelete }: ExpensesTableProps) {
  return (
    <div className="card rounded-2xl overflow-hidden p-0">
      <table className="w-full text-left">
        <thead className="bg-black/40 text-gray-500 text-[10px] font-black uppercase tracking-[0.2em]">
          <tr>
            <th className="px-6 py-5 border-b border-gray-800">Data</th>
            <th className="px-6 py-5 border-b border-gray-800">Descrição</th>
            <th className="px-6 py-5 border-b border-gray-800">Categoria</th>
            <th className="px-6 py-5 border-b border-gray-800">Valor</th>
            <th className="px-6 py-5 border-b border-gray-800 text-right">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {expenses.map(expense => (
            <tr key={expense.id} className="hover:bg-white/5 transition-colors group">
              <td className="px-6 py-4 text-gray-400 font-medium text-sm">
                {safeFormatDate(expense.date, 'dd MMM yyyy')}
              </td>
              <td className="px-6 py-4 text-white font-bold text-sm">{expense.description}</td>
              <td className="px-6 py-4">
                <span className="px-3 py-1 bg-gray-800 text-gray-300 rounded-full text-[10px] font-black uppercase tracking-widest border border-gray-700">
                  {expense.category}
                </span>
              </td>
              <td className="px-6 py-4 text-red-400 font-black text-sm">
                {formatCurrency(expense.amount)}
              </td>
              <td className="px-6 py-4 text-right">
                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                  <button onClick={() => onEdit(expense)} className="p-2 text-gray-500 hover:text-primary transition-colors" aria-label="Editar">
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => onDelete(expense.id)} className="p-2 text-gray-500 hover:text-red-500 transition-colors" aria-label="Excluir">
                    <Trash2 size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {expenses.length === 0 && (
            <tr>
              <td colSpan={5} className="py-20 text-center text-gray-600 font-bold uppercase tracking-widest">
                Nenhum gasto registrado.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
