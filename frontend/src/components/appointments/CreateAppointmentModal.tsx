'use client';

import { useState } from 'react';
import { Plus, Search, Scissors, AlertCircle, XCircle, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import { Modal, ModalFooter } from '@/components/ui';
import type { Client, Barber, Service } from '@/types';

interface CreateAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  clients: Client[];
  barbers: Barber[];
  services: Service[];
  availableSlots: string[];
  slotsLoading: boolean;
  onLoadSlots: (barberId: string, date: string, serviceId: string) => void;
  onSubmit: (data: AppointmentFormData) => Promise<void>;
}

export interface AppointmentFormData {
  clientId: string;
  barberId: string;
  serviceId: string;
  date: string;
  time: string;
}

export function CreateAppointmentModal({
  isOpen, onClose, clients, barbers, services,
  availableSlots, slotsLoading, onLoadSlots, onSubmit
}: CreateAppointmentModalProps) {
  const today = new Date().toISOString().split('T')[0];
  const [formData, setFormData] = useState<AppointmentFormData>({
    clientId: '', barberId: '', serviceId: '', date: today, time: '',
  });
  const [clientSearch, setClientSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (field: keyof AppointmentFormData, value: string) => {
    const newData = { ...formData, [field]: value };
    setFormData(newData);

    if (field === 'barberId' || field === 'date' || field === 'serviceId') {
      const bId = field === 'barberId' ? value : newData.barberId;
      const d = field === 'date' ? value : newData.date;
      const sId = field === 'serviceId' ? value : newData.serviceId;
      if (bId && d) {
        onLoadSlots(bId, d, sId);
        setFormData(prev => ({ ...prev, [field]: value, time: '' }));
        return;
      }
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(formData);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    c.phone.includes(clientSearch)
  );

  const isValid = formData.clientId && formData.barberId && formData.serviceId && formData.time;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Novo Agendamento"
      icon={Plus}
      footer={
        <ModalFooter
          onCancel={onClose}
          onSubmit={handleSubmit}
          submitLabel="Agendar"
          submitIcon={Plus}
          submitting={submitting}
          disabled={!isValid}
        />
      }
    >
      {/* Cliente */}
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-2">Cliente</label>
        <div className="relative mb-2">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={clientSearch}
            onChange={e => setClientSearch(e.target.value)}
            placeholder="Buscar cliente..."
            className="input pl-9 py-2.5 text-sm"
          />
        </div>
        <div className="max-h-32 overflow-y-auto space-y-1">
          {filteredClients.length === 0 ? (
            <p className="text-gray-600 text-xs p-2">Nenhum cliente encontrado</p>
          ) : (
            filteredClients.map(client => (
              <button
                key={client.id}
                onClick={() => handleChange('clientId', client.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                  formData.clientId === client.id
                    ? 'bg-primary/20 text-primary border border-primary/30'
                    : 'text-gray-300 hover:bg-white/5'
                }`}
              >
                <span className="font-medium">{client.name}</span>
                <span className="text-gray-500 ml-2 text-xs">{client.phone}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Barbeiro */}
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-2">Barbeiro</label>
        <div className="grid grid-cols-2 gap-2">
          {barbers.map(barber => (
            <button
              key={barber.id}
              onClick={() => handleChange('barberId', barber.id)}
              className={`px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                formData.barberId === barber.id
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'bg-white/5 border border-white/10 text-gray-300 hover:border-white/20'
              }`}
            >
              <Scissors size={14} className="inline mr-2" />
              {barber.name}
            </button>
          ))}
        </div>
        {barbers.length === 0 && (
          <p className="text-gray-600 text-xs mt-1">Nenhum barbeiro cadastrado</p>
        )}
      </div>

      {/* Serviço */}
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-2">Serviço</label>
        <div className="space-y-2">
          {services.map(service => (
            <button
              key={service.id}
              onClick={() => handleChange('serviceId', service.id)}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all flex items-center justify-between ${
                formData.serviceId === service.id
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'bg-white/5 border border-white/10 text-gray-300 hover:border-white/20'
              }`}
            >
              <div>
                <span className="font-medium">{service.name}</span>
                <span className="text-gray-500 text-xs ml-2">{service.duration_minutes}min</span>
              </div>
              <span className="font-bold text-primary">{formatCurrency(Number(service.price))}</span>
            </button>
          ))}
        </div>
        {services.length === 0 && (
          <p className="text-gray-600 text-xs mt-1">Nenhum serviço cadastrado</p>
        )}
      </div>

      {/* Data */}
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-2">Data</label>
        <input
          type="date"
          value={formData.date}
          onChange={e => handleChange('date', e.target.value)}
          className="input py-2.5 text-sm [color-scheme:dark]"
        />
      </div>

      {/* Horários Disponíveis */}
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-2">
          Horário
          {slotsLoading && <Loader2 size={12} className="inline ml-2 animate-spin text-primary" />}
        </label>
        {!formData.barberId ? (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/10">
            <AlertCircle size={14} className="text-yellow-500" />
            <p className="text-yellow-500/80 text-xs">Selecione um barbeiro para ver horários</p>
          </div>
        ) : slotsLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="text-primary animate-spin" size={24} />
          </div>
        ) : availableSlots.length === 0 ? (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/5 border border-red-500/10">
            <XCircle size={14} className="text-red-400" />
            <p className="text-red-400/80 text-xs">Nenhum horário disponível nesta data</p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {availableSlots.map(slot => (
              <button
                key={slot}
                onClick={() => handleChange('time', slot)}
                className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  formData.time === slot
                    ? 'bg-primary text-black shadow-lg shadow-primary/20'
                    : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10'
                }`}
              >
                {slot}
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
