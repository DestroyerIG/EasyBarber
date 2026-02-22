'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useToast } from './Toast';
import {
    UserPlus,
    Search,
    User,
    Phone,
    Mail,
    Calendar,
    MapPin,
    FileText,
    TrendingUp,
    Clock,
    ChevronRight,
    X,
    Edit2,
    Save,
    Trash2
} from 'lucide-react';
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

    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        email: '',
        birthDate: '',
        address: '',
        notes: ''
    });

    useEffect(() => {
        loadClients();
    }, []);

    const loadClients = async () => {
        try {
            const response = await api.get('/clients');
            setClients(response.data);
        } catch (error) {
            showToast('Erro ao carregar clientes', 'error');
        } finally {
            setLoading(false);
        }
    };

    const loadHistory = async (clientId: string) => {
        setLoadingHistory(true);
        try {
            const response = await api.get(`/clients/${clientId}/history`);
            setHistory(response.data);
        } catch (error) {
            showToast('Erro ao carregar histórico', 'error');
        } finally {
            setLoadingHistory(false);
        }
    };

    const handleOpenModal = (client?: Client) => {
        if (client) {
            setEditingClient(client);
            setFormData({
                name: client.name,
                phone: client.phone,
                email: client.email || '',
                birthDate: client.birth_date ? client.birth_date.split('T')[0] : '',
                address: client.address || '',
                notes: client.notes || ''
            });
        } else {
            setEditingClient(null);
            setFormData({
                name: '',
                phone: '',
                email: '',
                birthDate: '',
                address: '',
                notes: ''
            });
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingClient) {
                await api.put(`/clients/${editingClient.id}`, formData);
                showToast('Cliente atualizado com sucesso', 'success');
            } else {
                await api.post('/clients', formData);
                showToast('Cliente cadastrado com sucesso', 'success');
            }
            setIsModalOpen(false);
            loadClients();
        } catch (error: any) {
            showToast(error.response?.data?.error || 'Erro ao salvar cliente', 'error');
        }
    };

    const filteredClients = clients.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone.includes(searchTerm)
    );

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    };

    const formatDate = (dateString: string | null) => {
        if (!dateString) return 'Nunca';
        return new Date(dateString).toLocaleDateString('pt-BR');
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h2 className="text-3xl font-bold text-white">Gestão de Clientes</h2>
                <button
                    onClick={() => handleOpenModal()}
                    className="flex items-center justify-center gap-2 bg-primary hover:bg-orange-600 text-black font-bold py-2 px-6 rounded-lg transition-all"
                >
                    <UserPlus size={20} />
                    Novo Cliente
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-1 space-y-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
                        <input
                            type="text"
                            placeholder="Buscar por nome ou telefone..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-dark-light border border-gray-700 text-white pl-10 pr-4 py-2 rounded-lg focus:border-primary focus:outline-none transition-all"
                        />
                    </div>

                    <div className="bg-dark-light border border-primary/20 rounded-xl overflow-hidden max-h-[600px] overflow-y-auto custom-scrollbar">
                        {loading ? (
                            <div className="p-8 text-center text-gray-400">Carregando clientes...</div>
                        ) : filteredClients.length === 0 ? (
                            <div className="p-8 text-center text-gray-400">Nenhum cliente encontrado.</div>
                        ) : (
                            <div className="divide-y divide-gray-800">
                                {filteredClients.map((client) => (
                                    <div
                                        key={client.id}
                                        onClick={() => {
                                            setSelectedClient(client);
                                            loadHistory(client.id);
                                        }}
                                        className={`p-4 cursor-pointer hover:bg-gray-800 transition-all flex items-center justify-between group ${selectedClient?.id === client.id ? 'bg-gray-800' : ''}`}
                                    >
                                        <div>
                                            <h4 className="font-semibold text-white group-hover:text-primary transition-colors">{client.name}</h4>
                                            <p className="text-sm text-gray-400">{client.phone}</p>
                                        </div>
                                        <ChevronRight size={18} className={`text-gray-600 group-hover:text-primary transition-all ${selectedClient?.id === client.id ? 'translate-x-1 text-primary' : ''}`} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="md:col-span-2">
                    {selectedClient ? (
                        <div className="bg-dark-light border border-primary/20 rounded-xl p-6 lg:p-8 space-y-8 animate-fade-in">
                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-4">
                                    <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center text-primary border border-primary/30">
                                        <User size={32} />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-bold text-white uppercase tracking-tight">{selectedClient.name}</h3>
                                        <p className="text-gray-400 flex items-center gap-2">
                                            <Phone size={14} className="text-primary" /> {selectedClient.phone}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleOpenModal(selectedClient)}
                                    className="p-2 text-gray-400 hover:text-primary hover:bg-white/5 rounded-lg transition-all"
                                    title="Editar Cliente"
                                >
                                    <Edit2 size={20} />
                                </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="bg-black/40 border border-gray-800 p-4 rounded-xl">
                                    <TrendingUp className="text-green-500 mb-2" size={20} />
                                    <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Gasto Total</p>
                                    <h4 className="text-xl font-bold text-white">{formatCurrency(selectedClient.total_spent)}</h4>
                                </div>
                                <div className="bg-black/40 border border-gray-800 p-4 rounded-xl">
                                    <Calendar className="text-blue-500 mb-2" size={20} />
                                    <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Última Visita</p>
                                    <h4 className="text-lg font-bold text-white">{formatDate(selectedClient.last_visit)}</h4>
                                </div>
                                <div className="bg-black/40 border border-gray-800 p-4 rounded-xl">
                                    <Mail className="text-purple-500 mb-2" size={20} />
                                    <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">E-mail</p>
                                    <h4 className="text-sm font-medium text-white truncate" title={selectedClient.email || 'Não informado'}>
                                        {selectedClient.email || 'Não informado'}
                                    </h4>
                                </div>
                                <div className="bg-black/40 border border-gray-800 p-4 rounded-xl">
                                    <Clock className="text-orange-500 mb-2" size={20} />
                                    <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Cliente desde</p>
                                    <h4 className="text-lg font-bold text-white">{formatDate(selectedClient.created_at)}</h4>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center gap-2 border-b border-gray-800 pb-2">
                                    <FileText className="text-primary" size={20} />
                                    <h4 className="font-bold text-white uppercase tracking-widest text-sm">Informações de Cadastro</h4>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                                    <div className="space-y-4">
                                        <div className="flex items-start gap-3">
                                            <MapPin className="text-gray-500 mt-1" size={18} />
                                            <div>
                                                <p className="text-gray-500 font-bold uppercase text-[10px] tracking-widest">Endereço</p>
                                                <p className="text-gray-300">{selectedClient.address || 'Não cadastrado'}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-3">
                                            <Calendar className="text-gray-500 mt-1" size={18} />
                                            <div>
                                                <p className="text-gray-500 font-bold uppercase text-[10px] tracking-widest">Nascimento</p>
                                                <p className="text-gray-300">{selectedClient.birth_date ? new Date(selectedClient.birth_date).toLocaleDateString('pt-BR') : 'Não informado'}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-black/20 border border-gray-800 p-4 rounded-xl">
                                        <p className="text-gray-500 font-bold uppercase text-[10px] tracking-widest mb-2">Notas / Observações</p>
                                        <p className="text-gray-300 italic">
                                            {selectedClient.notes || 'Nenhuma observação adicionada.'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center gap-2 border-b border-gray-800 pb-2">
                                    <Clock className="text-primary" size={20} />
                                    <h4 className="font-bold text-white uppercase tracking-widest text-sm">Histórico de Atendimento</h4>
                                </div>
                                <div className="bg-black/40 border border-gray-800 rounded-xl overflow-hidden">
                                    {loadingHistory ? (
                                        <div className="p-8 text-center text-gray-500">Buscando histórico...</div>
                                    ) : history.length === 0 ? (
                                        <div className="p-8 text-center text-gray-500">Nenhum atendimento anterior encontrado.</div>
                                    ) : (
                                        <table className="w-full text-left">
                                            <thead className="bg-dark-light/50 text-gray-400 text-xs uppercase tracking-widest">
                                                <tr>
                                                    <th className="px-6 py-4 font-bold border-b border-gray-800">Data</th>
                                                    <th className="px-6 py-4 font-bold border-b border-gray-800">Barbeiro</th>
                                                    <th className="px-6 py-4 font-bold border-b border-gray-800">Serviço</th>
                                                    <th className="px-6 py-4 font-bold border-b border-gray-800 text-right">Valor</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-800 text-sm">
                                                {history.map((item: any) => (
                                                    <tr key={item.id} className="hover:bg-white/5 transition-colors">
                                                        <td className="px-6 py-4 text-white font-medium">{formatDate(item.date)}</td>
                                                        <td className="px-6 py-4">
                                                            <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold border border-primary/20">
                                                                {item.barber_name}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 text-gray-300">{item.service_name}</td>
                                                        <td className="px-6 py-4 text-right text-white font-bold">{formatCurrency(item.service_price)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-dark-light border border-dashed border-primary/20 rounded-xl p-12 flex flex-col items-center justify-center text-center space-y-4 min-h-[500px]">
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

            {isModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-dark-light border border-primary/30 rounded-2xl w-full max-w-2xl overflow-hidden animate-zoom-in">
                        <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-black/20">
                            <h3 className="text-xl font-bold text-white uppercase tracking-tight">
                                {editingClient ? 'Editar Cliente' : 'Novo Cadastro Completo'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-white transition-colors">
                                <X size={24} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Nome Completo</label>
                                    <input
                                        required
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full bg-black/40 border border-gray-700 text-white p-3 rounded-xl focus:border-primary focus:outline-none transition-all placeholder:text-gray-600"
                                        placeholder="Ex: João Silva"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Telefone / WhatsApp</label>
                                    <input
                                        required
                                        type="text"
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        className="w-full bg-black/40 border border-gray-700 text-white p-3 rounded-xl focus:border-primary focus:outline-none transition-all placeholder:text-gray-600"
                                        placeholder="Ex: 11999999999"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">E-mail</label>
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        className="w-full bg-black/40 border border-gray-700 text-white p-3 rounded-xl focus:border-primary focus:outline-none transition-all placeholder:text-gray-600"
                                        placeholder="Ex: joao@email.com"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Data de Nascimento</label>
                                    <input
                                        type="date"
                                        value={formData.birthDate}
                                        onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                                        className="w-full bg-black/40 border border-gray-700 text-white p-3 rounded-xl focus:border-primary focus:outline-none transition-all"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Endereço Residencial</label>
                                <div className="relative">
                                    <MapPin size={18} className="absolute left-3 top-3 text-gray-600" />
                                    <input
                                        type="text"
                                        value={formData.address}
                                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                        className="w-full bg-black/40 border border-gray-700 text-white p-3 pl-10 rounded-xl focus:border-primary focus:outline-none transition-all placeholder:text-gray-600"
                                        placeholder="Ex: Rua das Flores, 123 - Centro"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Notas e Observações</label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    className="w-full bg-black/40 border border-gray-700 text-white p-3 rounded-xl focus:border-primary focus:outline-none transition-all min-h-[100px] placeholder:text-gray-600"
                                    placeholder="Ex: Alérgico a certas pomadas, prefere corte baixo..."
                                />
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-bold py-4 rounded-xl transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 bg-primary hover:bg-orange-600 text-black font-bold py-4 rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2"
                                >
                                    <Save size={20} />
                                    {editingClient ? 'Salvar Alterações' : 'Concluir Cadastro'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #4a5568;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #ed8936;
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes zoom-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out forwards;
        }
        .animate-zoom-in {
          animation: zoom-in 0.2s ease-out forwards;
        }
      `}</style>
        </div>
    );
};
