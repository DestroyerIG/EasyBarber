'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { useToast } from './Toast';
import { PageHeader } from '@/components/ui';
import { ClientDetailPanel } from '@/components/clients/ClientDetailPanel';
import { ClientFormModal } from '@/components/clients/ClientFormModal';
import type { ClientFormData } from '@/components/clients/ClientFormModal';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { UserPlus, Search, ChevronRight, User } from 'lucide-react';
import type { Client, Appointment } from '@/types';

export const ClientModule = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [history, setHistory] = useState<Appointment[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const { showToast } = useToast();

  const loadClients = useCallback(async () => {
    try {
      const response = await api.get('/clients');
      setClients(response.data);
    } catch {
      showToast('Erro ao carregar clientes', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const loadHistory = async (clientId: string) => {
    setLoadingHistory(true);
    try {
      const response = await api.get(`/clients/${clientId}/history`);
      setHistory(response.data);
    } catch {
      showToast('Erro ao carregar histórico', 'error');
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleOpenModal = (client?: Client) => {
    setEditingClient(client || null);
    setIsModalOpen(true);
  };

  const handleSubmitClient = async (data: ClientFormData) => {
    // Mapeia birthDate → birth_date conforme esperado pelo backend
    const payload = {
      name: data.name,
      phone: data.phone,
      email: data.email || null,
      birth_date: data.birthDate || null,
      address: data.address || null,
      notes: data.notes || null,
    };

    try {
      if (editingClient) {
        await api.put(`/clients/${editingClient.id}`, payload);
        showToast('Cliente atualizado com sucesso', 'success');
      } else {
        await api.post('/clients', payload);
        showToast('Cliente cadastrado com sucesso', 'success');
      }
      await loadClients();
    } catch (error) {
      const fallback = editingClient
        ? 'Erro ao atualizar cliente'
        : 'Erro ao cadastrar cliente';
      showToast(getApiErrorMessage(error, fallback), 'error');
      throw error;
    }
  };

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestão de Clientes"
        action={
          <button onClick={() => handleOpenModal()} className="btn-primary flex items-center gap-2">
            <UserPlus size={20} /> Novo Cliente
          </button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Client list */}
        <div className="md:col-span-1 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
            <input
              type="text"
              placeholder="Buscar por nome ou telefone..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="input pl-10"
            />
          </div>

          <div className="card rounded-xl overflow-hidden max-h-[600px] overflow-y-auto p-0">
            {loading ? (
              <div className="p-8 text-center text-gray-400">Carregando clientes...</div>
            ) : filteredClients.length === 0 ? (
              <div className="p-8 text-center text-gray-400">Nenhum cliente encontrado.</div>
            ) : (
              <div className="divide-y divide-gray-800">
                {filteredClients.map(client => (
                  <div
                    key={client.id}
                    onClick={() => {
                      setSelectedClient(client);
                      loadHistory(client.id);
                    }}
                    className={`p-4 cursor-pointer hover:bg-gray-800 transition-all flex items-center justify-between group ${
                      selectedClient?.id === client.id ? 'bg-gray-800' : ''
                    }`}
                  >
                    <div>
                      <h4 className="font-semibold text-white group-hover:text-primary transition-colors">{client.name}</h4>
                      <p className="text-sm text-gray-400">{client.phone}</p>
                    </div>
                    <ChevronRight
                      size={18}
                      className={`text-gray-600 group-hover:text-primary transition-all ${
                        selectedClient?.id === client.id ? 'translate-x-1 text-primary' : ''
                      }`}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Client detail */}
        <div className="md:col-span-2">
          {selectedClient ? (
            <ClientDetailPanel
              client={selectedClient}
              history={history}
              loadingHistory={loadingHistory}
              onEdit={() => handleOpenModal(selectedClient)}
            />
          ) : (
            <div className="card border-dashed rounded-xl p-12 flex flex-col items-center justify-center text-center space-y-4 min-h-[500px]">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center text-primary/40">
                <User size={48} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Selecione um cliente</h3>
                <p className="text-gray-400 max-w-xs mx-auto">
                  Escolha um cliente da lista ao lado para ver os detalhes, histórico de barbeiros e gastos.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <ClientFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmitClient}
        editingClient={editingClient}
      />
    </div>
  );
};
