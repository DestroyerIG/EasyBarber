'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useToast } from './Toast';
import {
    Scissors,
    Plus,
    Trash2,
    Edit2,
    Save,
    X,
    Clock,
    DollarSign,
    Users,
    Calendar,
    Camera,
    ChevronRight,
    ArrowLeft
} from 'lucide-react';
import type { Service, Barber } from '@/types';
import { BarberAgenda } from './BarberAgenda';

export const ServiceBarberModule = () => {
    const [activeTab, setActiveTab] = useState<'servicos' | 'barbeiros'>('servicos');
    const [services, setServices] = useState<Service[]>([]);
    const [barbers, setBarbers] = useState<Barber[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<any>(null);
    const [selectedBarberForAgenda, setSelectedBarberForAgenda] = useState<Barber | null>(null);

    const { showToast } = useToast();

    const [serviceFormData, setServiceFormData] = useState({
        name: '',
        price: '',
        duration_minutes: ''
    });

    const [barberFormData, setBarberFormData] = useState({
        name: '',
        photo: ''
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [servicesRes, barbersRes] = await Promise.all([
                api.get('/barbershop/services'),
                api.get('/barbershop/barbers')
            ]);
            setServices(servicesRes.data);
            setBarbers(barbersRes.data);
        } catch (error) {
            showToast('Erro ao carregar dados', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (item?: any) => {
        if (activeTab === 'servicos') {
            if (item) {
                setEditingItem(item);
                setServiceFormData({
                    name: item.name,
                    price: item.price.toString(),
                    duration_minutes: item.duration_minutes.toString()
                });
            } else {
                setEditingItem(null);
                setServiceFormData({ name: '', price: '', duration_minutes: '' });
            }
        } else {
            if (item) {
                setEditingItem(item);
                setBarberFormData({
                    name: item.name,
                    photo: item.photo || ''
                });
            } else {
                setEditingItem(null);
                setBarberFormData({ name: '', photo: '' });
            }
        }
        setIsModalOpen(true);
    };

    const handleServiceSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const data = {
                name: serviceFormData.name,
                price: parseFloat(serviceFormData.price),
                duration_minutes: parseInt(serviceFormData.duration_minutes)
            };

            if (editingItem) {
                await api.put(`/barbershop/services/${editingItem.id}`, data);
                showToast('Serviço atualizado', 'success');
            } else {
                await api.post('/barbershop/services', data);
                showToast('Serviço criado', 'success');
            }
            setIsModalOpen(false);
            loadData();
        } catch (error: any) {
            showToast(error.response?.data?.error || 'Erro ao salvar serviço', 'error');
        }
    };

    const handleBarberSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const data = {
                name: barberFormData.name,
                photo: barberFormData.photo || null
            };

            if (editingItem) {
                await api.put(`/barbershop/barbers/${editingItem.id}`, data);
                showToast('Barbeiro atualizado', 'success');
            } else {
                await api.post('/barbershop/barbers', data);
                showToast('Barbeiro cadastrado', 'success');
            }
            setIsModalOpen(false);
            loadData();
        } catch (error: any) {
            showToast(error.response?.data?.error || 'Erro ao salvar barbeiro', 'error');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Tem certeza que deseja excluir?')) return;
        try {
            const endpoint = activeTab === 'servicos' ? 'services' : 'barbers';
            await api.delete(`/barbershop/${endpoint}/${id}`);
            showToast('Excluído com sucesso', 'success');
            loadData();
        } catch (error: any) {
            showToast(error.response?.data?.error || 'Erro ao excluir', 'error');
        }
    };

    if (selectedBarberForAgenda) {
        return (
            <div className="space-y-6">
                <button
                    onClick={() => setSelectedBarberForAgenda(null)}
                    className="flex items-center gap-2 text-gray-400 hover:text-white transition-all"
                >
                    <ArrowLeft size={20} />
                    Voltar para Gestão
                </button>
                <BarberAgenda barber={selectedBarberForAgenda} />
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-white tracking-tight">Serviços e Equipe</h2>
                    <p className="text-gray-400">Gerencie o que você oferece e quem atende seus clientes.</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="flex items-center justify-center gap-2 bg-primary hover:bg-orange-600 text-black font-bold py-2.5 px-6 rounded-xl transition-all shadow-lg shadow-primary/20"
                >
                    <Plus size={20} />
                    {activeTab === 'servicos' ? 'Novo Serviço' : 'Novo Barbeiro'}
                </button>
            </div>

            <div className="flex p-1 bg-dark-light border border-gray-800 rounded-xl w-fit">
                <button
                    onClick={() => setActiveTab('servicos')}
                    className={`px-6 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'servicos' ? 'bg-primary text-black' : 'text-gray-400 hover:text-white'}`}
                >
                    Serviços
                </button>
                <button
                    onClick={() => setActiveTab('barbeiros')}
                    className={`px-6 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'barbeiros' ? 'bg-primary text-black' : 'text-gray-400 hover:text-white'}`}
                >
                    Equipe
                </button>
            </div>

            {loading ? (
                <div className="py-20 text-center text-gray-500">Carregando...</div>
            ) : activeTab === 'servicos' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {services.map(service => (
                        <div key={service.id} className="bg-dark-light border border-gray-800 p-6 rounded-2xl hover:border-primary/30 transition-all group">
                            <div className="flex justify-between items-start mb-4">
                                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                                    <Scissors size={24} />
                                </div>
                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                    <button onClick={() => handleOpenModal(service)} className="p-1.5 text-gray-400 hover:text-primary transition-colors"><Edit2 size={16} /></button>
                                    <button onClick={() => handleDelete(service.id)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                                </div>
                            </div>
                            <h3 className="text-xl font-bold text-white mb-1">{service.name}</h3>
                            <div className="flex items-center gap-4 text-sm text-gray-400">
                                <span className="flex items-center gap-1.5"><Clock size={16} className="text-primary" /> {service.duration_minutes} min</span>
                                <span className="flex items-center gap-1.5"><DollarSign size={16} className="text-green-500" /> R$ {parseFloat(service.price.toString()).toFixed(2)}</span>
                            </div>
                        </div>
                    ))}
                    {services.length === 0 && (
                        <div className="col-span-full py-12 text-center border-2 border-dashed border-gray-800 rounded-2xl text-gray-500">
                            Nenhum serviço cadastrado.
                        </div>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {barbers.map(barber => (
                        <div key={barber.id} className="bg-dark-light border border-gray-800 p-6 rounded-2xl hover:border-primary/30 transition-all group">
                            <div className="flex justify-between items-start mb-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-primary/20 bg-black/40 flex items-center justify-center">
                                        {barber.photo ? (
                                            <img src={barber.photo} alt={barber.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <Users className="text-primary/40" size={32} />
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-white">{barber.name}</h3>
                                        <p className="text-xs text-primary uppercase font-bold tracking-widest">Profissional</p>
                                    </div>
                                </div>
                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                    <button onClick={() => handleOpenModal(barber)} className="p-1.5 text-gray-400 hover:text-primary transition-colors"><Edit2 size={16} /></button>
                                    <button onClick={() => handleDelete(barber.id)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedBarberForAgenda(barber)}
                                className="w-full flex items-center justify-between p-3 bg-black/40 hover:bg-black/60 rounded-xl text-sm font-bold text-gray-300 transition-all"
                            >
                                <span className="flex items-center gap-2"><Calendar size={18} className="text-primary" /> Ver Agenda Individual</span>
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    ))}
                    {barbers.length === 0 && (
                        <div className="col-span-full py-12 text-center border-2 border-dashed border-gray-800 rounded-2xl text-gray-500">
                            Nenhum barbeiro na equipe.
                        </div>
                    )}
                </div>
            )}

            {isModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-dark-light border border-primary/30 rounded-2xl w-full max-w-md overflow-hidden animate-zoom-in">
                        <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-black/20">
                            <h3 className="text-xl font-bold text-white uppercase tracking-tight">
                                {activeTab === 'servicos'
                                    ? (editingItem ? 'Editar Serviço' : 'Novo Serviço')
                                    : (editingItem ? 'Editar Barbeiro' : 'Novo Barbeiro')
                                }
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-white transition-colors">
                                <X size={24} />
                            </button>
                        </div>

                        <form onSubmit={activeTab === 'servicos' ? handleServiceSubmit : handleBarberSubmit} className="p-6 space-y-6">
                            {activeTab === 'servicos' ? (
                                <>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Nome do Serviço</label>
                                        <input
                                            required
                                            type="text"
                                            value={serviceFormData.name}
                                            onChange={(e) => setServiceFormData({ ...serviceFormData, name: e.target.value })}
                                            className="w-full bg-black/40 border border-gray-700 text-white p-3 rounded-xl focus:border-primary focus:outline-none transition-all"
                                            placeholder="Ex: Corte Degradê"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Preço (R$)</label>
                                            <input
                                                required
                                                type="number"
                                                step="0.01"
                                                value={serviceFormData.price}
                                                onChange={(e) => setServiceFormData({ ...serviceFormData, price: e.target.value })}
                                                className="w-full bg-black/40 border border-gray-700 text-white p-3 rounded-xl focus:border-primary focus:outline-none transition-all"
                                                placeholder="50.00"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Duração (Min)</label>
                                            <input
                                                required
                                                type="number"
                                                value={serviceFormData.duration_minutes}
                                                onChange={(e) => setServiceFormData({ ...serviceFormData, duration_minutes: e.target.value })}
                                                className="w-full bg-black/40 border border-gray-700 text-white p-3 rounded-xl focus:border-primary focus:outline-none transition-all"
                                                placeholder="30"
                                            />
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Nome do Barbeiro</label>
                                        <input
                                            required
                                            type="text"
                                            value={barberFormData.name}
                                            onChange={(e) => setBarberFormData({ ...barberFormData, name: e.target.value })}
                                            className="w-full bg-black/40 border border-gray-700 text-white p-3 rounded-xl focus:border-primary focus:outline-none transition-all"
                                            placeholder="Ex: Gabriel Souza"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">URL da Foto (Opcional)</label>
                                        <div className="relative">
                                            <Camera size={18} className="absolute left-3 top-3.5 text-gray-600" />
                                            <input
                                                type="url"
                                                value={barberFormData.photo}
                                                onChange={(e) => setBarberFormData({ ...barberFormData, photo: e.target.value })}
                                                className="w-full bg-black/40 border border-gray-700 text-white p-3 pl-10 rounded-xl focus:border-primary focus:outline-none transition-all"
                                                placeholder="https://..."
                                            />
                                        </div>
                                    </div>
                                </>
                            )}

                            <div className="flex gap-4 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-bold py-3.5 rounded-xl transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 bg-primary hover:bg-orange-600 text-black font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2"
                                >
                                    <Save size={18} />
                                    Salvar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
