'use client';

import { useState, useEffect } from 'react';
import { Modal, ModalFooter } from '@/components/ui';
import { Scissors, Camera, Save } from 'lucide-react';
import type { Service, Barber } from '@/types';

export interface ServiceFormData {
  name: string;
  price: string;
  duration_minutes: string;
}

export interface BarberFormData {
  name: string;
  photo: string;
}

interface ServiceBarberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitService: (data: ServiceFormData) => Promise<void>;
  onSubmitBarber: (data: BarberFormData) => Promise<void>;
  activeTab: 'servicos' | 'barbeiros';
  editingItem: Service | Barber | null;
}

export const ServiceBarberModal = ({
  isOpen,
  onClose,
  onSubmitService,
  onSubmitBarber,
  activeTab,
  editingItem,
}: ServiceBarberModalProps) => {
  const [serviceForm, setServiceForm] = useState<ServiceFormData>({ name: '', price: '', duration_minutes: '' });
  const [barberForm, setBarberForm] = useState<BarberFormData>({ name: '', photo: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === 'servicos') {
      if (editingItem && 'price' in editingItem) {
        setServiceForm({
          name: editingItem.name,
          price: editingItem.price.toString(),
          duration_minutes: editingItem.duration_minutes.toString(),
        });
      } else {
        setServiceForm({ name: '', price: '', duration_minutes: '' });
      }
    } else {
      if (editingItem && 'photo' in editingItem) {
        setBarberForm({ name: editingItem.name, photo: (editingItem as Barber).photo || '' });
      } else {
        setBarberForm({ name: '', photo: '' });
      }
    }
  }, [isOpen, editingItem, activeTab]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (activeTab === 'servicos') {
        await onSubmitService(serviceForm);
      } else {
        await onSubmitBarber(barberForm);
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const title = activeTab === 'servicos'
    ? (editingItem ? 'Editar Serviço' : 'Novo Serviço')
    : (editingItem ? 'Editar Barbeiro' : 'Novo Barbeiro');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      icon={activeTab === 'servicos' ? Scissors : undefined}
      footer={
        <ModalFooter
          onCancel={onClose}
          onSubmit={() => {
            const form = document.getElementById('service-barber-form') as HTMLFormElement;
            form?.requestSubmit();
          }}
          submitLabel="Salvar"
          submitIcon={Save}
          submitting={submitting}
        />
      }
    >
      <form id="service-barber-form" onSubmit={handleSubmit} className="space-y-6">
        {activeTab === 'servicos' ? (
          <>
            <div className="space-y-2">
              <label className="field-label">Nome do Serviço</label>
              <input
                required
                type="text"
                value={serviceForm.name}
                onChange={e => setServiceForm({ ...serviceForm, name: e.target.value })}
                className="input"
                placeholder="Ex: Corte Degradê"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="field-label">Preço (R$)</label>
                <input
                  required
                  type="number"
                  step="0.01"
                  value={serviceForm.price}
                  onChange={e => setServiceForm({ ...serviceForm, price: e.target.value })}
                  className="input"
                  placeholder="50.00"
                />
              </div>
              <div className="space-y-2">
                <label className="field-label">Duração (Min)</label>
                <input
                  required
                  type="number"
                  value={serviceForm.duration_minutes}
                  onChange={e => setServiceForm({ ...serviceForm, duration_minutes: e.target.value })}
                  className="input"
                  placeholder="30"
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <label className="field-label">Nome do Barbeiro</label>
              <input
                required
                type="text"
                value={barberForm.name}
                onChange={e => setBarberForm({ ...barberForm, name: e.target.value })}
                className="input"
                placeholder="Ex: Gabriel Souza"
              />
            </div>
            <div className="space-y-2">
              <label className="field-label">URL da Foto (Opcional)</label>
              <div className="relative">
                <Camera size={18} className="absolute left-3 top-3.5 text-gray-600" />
                <input
                  type="url"
                  value={barberForm.photo}
                  onChange={e => setBarberForm({ ...barberForm, photo: e.target.value })}
                  className="input pl-10"
                  placeholder="https://..."
                />
              </div>
            </div>
          </>
        )}
      </form>
    </Modal>
  );
};
