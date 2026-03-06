'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useToast } from './Toast';
import { Plus, ArrowLeft } from 'lucide-react';
import type { Service, Barber } from '@/types';
import { BarberAgenda } from './BarberAgenda';
import { PageHeader } from '@/components/ui';
import { ServiceCard } from '@/components/services/ServiceCard';
import { BarberCard } from '@/components/services/BarberCard';
import { ServiceBarberModal } from '@/components/services/ServiceBarberModal';
import type { ServiceFormData, BarberFormData } from '@/components/services/ServiceBarberModal';

export const ServiceBarberModule = () => {
  const [activeTab, setActiveTab] = useState<'servicos' | 'barbeiros'>('servicos');
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Service | Barber | null>(null);
  const [selectedBarberForAgenda, setSelectedBarberForAgenda] = useState<Barber | null>(null);
  const { showToast } = useToast();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [servicesRes, barbersRes] = await Promise.all([
        api.get('/barbershop/services'),
        api.get('/barbershop/barbers'),
      ]);
      setServices(servicesRes.data);
      setBarbers(barbersRes.data);
    } catch {
      showToast('Erro ao carregar dados', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (item?: Service | Barber) => {
    setEditingItem(item || null);
    setIsModalOpen(true);
  };

  const handleServiceSubmit = async (data: ServiceFormData) => {
    const payload = {
      name: data.name,
      price: parseFloat(data.price),
      duration_minutes: parseInt(data.duration_minutes),
    };
    if (editingItem) {
      await api.put(`/barbershop/services/${editingItem.id}`, payload);
      showToast('Serviço atualizado', 'success');
    } else {
      await api.post('/barbershop/services', payload);
      showToast('Serviço criado', 'success');
    }
    loadData();
  };

  const handleBarberSubmit = async (data: BarberFormData) => {
    const payload = { name: data.name, photo: data.photo || null };
    if (editingItem) {
      await api.put(`/barbershop/barbers/${editingItem.id}`, payload);
      showToast('Barbeiro atualizado', 'success');
    } else {
      await api.post('/barbershop/barbers', payload);
      showToast('Barbeiro cadastrado', 'success');
    }
    loadData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir?')) return;
    const endpoint = activeTab === 'servicos' ? 'services' : 'barbers';
    await api.delete(`/barbershop/${endpoint}/${id}`);
    showToast('Excluído com sucesso', 'success');
    loadData();
  };

  if (selectedBarberForAgenda) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => setSelectedBarberForAgenda(null)}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-all"
        >
          <ArrowLeft size={20} /> Voltar para Gestão
        </button>
        <BarberAgenda barber={selectedBarberForAgenda} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Serviços e Equipe"
        description="Gerencie o que você oferece e quem atende seus clientes."
        action={
          <button onClick={() => handleOpenModal()} className="btn-primary flex items-center gap-2">
            <Plus size={20} /> {activeTab === 'servicos' ? 'Novo Serviço' : 'Novo Barbeiro'}
          </button>
        }
      />

      <div className="flex p-1 bg-dark-light border border-gray-800 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('servicos')}
          className={activeTab === 'servicos' ? 'tab-active' : 'tab-inactive'}
        >
          Serviços
        </button>
        <button
          onClick={() => setActiveTab('barbeiros')}
          className={activeTab === 'barbeiros' ? 'tab-active' : 'tab-inactive'}
        >
          Equipe
        </button>
      </div>

      {loading ? (
        <div className="py-20 text-center text-gray-500">Carregando...</div>
      ) : activeTab === 'servicos' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map(s => (
            <ServiceCard key={s.id} service={s} onEdit={() => handleOpenModal(s)} onDelete={() => handleDelete(s.id)} />
          ))}
          {services.length === 0 && (
            <div className="col-span-full py-12 text-center border-2 border-dashed border-gray-800 rounded-2xl text-gray-500">
              Nenhum serviço cadastrado.
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {barbers.map(b => (
            <BarberCard
              key={b.id}
              barber={b}
              onEdit={() => handleOpenModal(b)}
              onDelete={() => handleDelete(b.id)}
              onViewAgenda={() => setSelectedBarberForAgenda(b)}
            />
          ))}
          {barbers.length === 0 && (
            <div className="col-span-full py-12 text-center border-2 border-dashed border-gray-800 rounded-2xl text-gray-500">
              Nenhum barbeiro na equipe.
            </div>
          )}
        </div>
      )}

      <ServiceBarberModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmitService={handleServiceSubmit}
        onSubmitBarber={handleBarberSubmit}
        activeTab={activeTab}
        editingItem={editingItem}
      />
    </div>
  );
};
