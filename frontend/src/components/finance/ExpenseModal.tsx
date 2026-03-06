'use client';

import { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { Modal, ModalFooter } from '@/components/ui';
import { EXPENSE_CATEGORIES } from '@/lib/constants';
import type { Expense } from '@/types';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { description: string; category: string; amount: number; date: string }) => Promise<void>;
  editingExpense: Expense | null;
}

export function ExpenseModal({ isOpen, onClose, onSubmit, editingExpense }: ExpenseModalProps) {
  const [formData, setFormData] = useState({
    description: '',
    category: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (editingExpense) {
      setFormData({
        description: editingExpense.description,
        category: editingExpense.category,
        amount: editingExpense.amount.toString(),
        date: editingExpense.date.split('T')[0],
      });
    } else {
      setFormData({ description: '', category: '', amount: '', date: new Date().toISOString().split('T')[0] });
    }
  }, [editingExpense, isOpen]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit({ ...formData, amount: parseFloat(formData.amount) });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const isValid = formData.description && formData.category && formData.amount && formData.date;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingExpense ? 'Editar Gasto' : 'Novo Gasto'}
      footer={
        <ModalFooter
          onCancel={onClose}
          onSubmit={handleSubmit}
          submitLabel="Salvar Gasto"
          submitIcon={Save}
          submitting={submitting}
          disabled={!isValid}
        />
      }
    >
      <div className="space-y-2">
        <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Descrição</label>
        <input
          type="text"
          value={formData.description}
          onChange={e => setFormData({ ...formData, description: e.target.value })}
          className="input"
          placeholder="Ex: Aluguel da sala"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Categoria</label>
          <select
            value={formData.category}
            onChange={e => setFormData({ ...formData, category: e.target.value })}
            className="input"
          >
            <option value="" disabled>Selecione...</option>
            {EXPENSE_CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Valor (R$)</label>
          <input
            type="number"
            step="0.01"
            value={formData.amount}
            onChange={e => setFormData({ ...formData, amount: e.target.value })}
            className="input"
            placeholder="100.00"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Data</label>
        <input
          type="date"
          value={formData.date}
          onChange={e => setFormData({ ...formData, date: e.target.value })}
          className="input [color-scheme:dark]"
        />
      </div>
    </Modal>
  );
}
