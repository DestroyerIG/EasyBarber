'use client';

import { useState, useEffect } from 'react';
import { Save, MapPin } from 'lucide-react';
import { Modal, ModalFooter } from '@/components/ui';
import type { Client } from '@/types';

interface ClientFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ClientFormData) => Promise<void>;
  editingClient: Client | null;
}

export interface ClientFormData {
  name: string;
  phone: string;
  email: string;
  birthDate: string;
  address: string;
  notes: string;
}

export function ClientFormModal({ isOpen, onClose, onSubmit, editingClient }: ClientFormModalProps) {
  const [formData, setFormData] = useState<ClientFormData>({
    name: '', phone: '', email: '', birthDate: '', address: '', notes: '',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (editingClient) {
      setFormData({
        name: editingClient.name,
        phone: editingClient.phone,
        email: editingClient.email || '',
        birthDate: editingClient.birth_date ? editingClient.birth_date.split('T')[0] : '',
        address: editingClient.address || '',
        notes: editingClient.notes || '',
      });
    } else {
      setFormData({ name: '', phone: '', email: '', birthDate: '', address: '', notes: '' });
    }
  }, [editingClient, isOpen]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(formData);
      onClose();
    } catch {
      // O erro já é tratado por quem chamou o modal; mantemos aberto para correção.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingClient ? 'Editar Cliente' : 'Novo Cadastro Completo'}
      footer={
        <ModalFooter
          onCancel={onClose}
          onSubmit={handleSubmit}
          submitLabel={editingClient ? 'Salvar Alterações' : 'Concluir Cadastro'}
          submitIcon={Save}
          submitting={submitting}
          disabled={!formData.name || !formData.phone}
        />
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="field-label">Nome Completo</label>
          <input
            type="text"
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
            className="input"
            placeholder="Ex: João Silva"
          />
        </div>
        <div className="space-y-2">
          <label className="field-label">Telefone / WhatsApp</label>
          <input
            type="text"
            value={formData.phone}
            onChange={e => setFormData({ ...formData, phone: e.target.value })}
            className="input"
            placeholder="Ex: 11999999999"
          />
        </div>
        <div className="space-y-2">
          <label className="field-label">E-mail</label>
          <input
            type="email"
            value={formData.email}
            onChange={e => setFormData({ ...formData, email: e.target.value })}
            className="input"
            placeholder="Ex: joao@email.com"
          />
        </div>
        <div className="space-y-2">
          <label className="field-label">Data de Nascimento</label>
          <input
            type="date"
            value={formData.birthDate}
            onChange={e => setFormData({ ...formData, birthDate: e.target.value })}
            className="input [color-scheme:dark]"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="field-label">Endereço</label>
        <div className="relative">
          <MapPin size={18} className="absolute left-3 top-3 text-gray-600" />
          <input
            type="text"
            value={formData.address}
            onChange={e => setFormData({ ...formData, address: e.target.value })}
            className="input pl-10"
            placeholder="Ex: Rua das Flores, 123 - Centro"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="field-label">Notas e Observações</label>
        <textarea
          value={formData.notes}
          onChange={e => setFormData({ ...formData, notes: e.target.value })}
          className="input min-h-[100px]"
          placeholder="Ex: Alérgico a certas pomadas, prefere corte baixo..."
        />
      </div>
    </Modal>
  );
}
