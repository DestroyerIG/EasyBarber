'use client';

import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';
import { useToast } from '@/components/Toast';
import type { Appointment, Client, Barber, Service } from '@/types';
import {
    Clock, Plus, ChevronLeft, ChevronRight, Calendar,
    CheckCircle, XCircle, User, Scissors, X, Search,
    AlertCircle, Filter, Loader2
} from 'lucide-react';

type ViewMode = 'day' | 'week';
type StatusFilter = 'todos' | 'confirmado' | 'concluido' | 'cancelado';

const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
};

const formatDateShort = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

const getToday = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const local = new Date(now.getTime() - offset * 60000);
    return local.toISOString().split('T')[0];
};

const addDays = (dateStr: string, days: number) => {
    const date = new Date(dateStr + 'T12:00:00');
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
};

const statusConfig = {
    confirmado: { label: 'Confirmado', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', dot: 'bg-blue-400' },
    concluido: { label: 'Concluído', color: 'bg-green-500/20 text-green-400 border-green-500/30', dot: 'bg-green-400' },
    cancelado: { label: 'Cancelado', color: 'bg-red-500/20 text-red-400 border-red-500/30', dot: 'bg-red-400' },
};

export function AppointmentModule() {
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(getToday());
    const [viewMode, setViewMode] = useState<ViewMode>('day');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');
    const [showModal, setShowModal] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const { showToast } = useToast();

    // Modal state
    const [clients, setClients] = useState<Client[]>([]);
    const [barbers, setBarbers] = useState<Barber[]>([]);
    const [services, setServices] = useState<Service[]>([]);
    const [availableSlots, setAvailableSlots] = useState<string[]>([]);
    const [slotsLoading, setSlotsLoading] = useState(false);
    const [formData, setFormData] = useState({
        clientId: '',
        barberId: '',
        serviceId: '',
        date: getToday(),
        time: '',
    });
    const [submitting, setSubmitting] = useState(false);
    const [clientSearch, setClientSearch] = useState('');

    const loadAppointments = useCallback(async () => {
        try {
            setLoading(true);
            const params: Record<string, string> = { date: selectedDate, view: viewMode };
            const response = await api.get('/appointments', { params });
            setAppointments(response.data);
        } catch {
            showToast('Erro ao carregar agendamentos', 'error');
        } finally {
            setLoading(false);
        }
    }, [selectedDate, viewMode]);

    useEffect(() => {
        loadAppointments();
    }, [loadAppointments]);

    const loadModalData = async () => {
        try {
            const [clientsRes, barbersRes, servicesRes] = await Promise.all([
                api.get('/clients'),
                api.get('/barbershop/barbers'),
                api.get('/barbershop/services'),
            ]);
            setClients(clientsRes.data);
            setBarbers(barbersRes.data);
            setServices(servicesRes.data);
        } catch {
            showToast('Erro ao carregar dados do formulário', 'error');
        }
    };

    const loadAvailableSlots = async (barberId: string, date: string, serviceId: string) => {
        if (!barberId || !date) return;
        try {
            setSlotsLoading(true);
            const params: Record<string, string> = { barberId, date };
            if (serviceId) params.serviceId = serviceId;
            const response = await api.get('/appointments/available-slots', { params });
            setAvailableSlots(response.data);
        } catch {
            showToast('Erro ao carregar horários', 'error');
        } finally {
            setSlotsLoading(false);
        }
    };

    const openModal = () => {
        setFormData({ clientId: '', barberId: '', serviceId: '', date: getToday(), time: '' });
        setAvailableSlots([]);
        setClientSearch('');
        loadModalData();
        setShowModal(true);
    };

    const handleFormChange = (field: string, value: string) => {
        const newData = { ...formData, [field]: value };
        setFormData(newData);

        if (field === 'barberId' || field === 'date' || field === 'serviceId') {
            const bId = field === 'barberId' ? value : newData.barberId;
            const d = field === 'date' ? value : newData.date;
            const sId = field === 'serviceId' ? value : newData.serviceId;
            if (bId && d) {
                loadAvailableSlots(bId, d, sId);
                setFormData(prev => ({ ...prev, [field]: value, time: '' }));
                return;
            }
        }
    };

    const handleSubmit = async () => {
        if (!formData.clientId || !formData.barberId || !formData.serviceId || !formData.date || !formData.time) {
            showToast('Preencha todos os campos', 'error');
            return;
        }
        try {
            setSubmitting(true);
            await api.post('/appointments', formData);
            showToast('Agendamento criado com sucesso!', 'success');
            setShowModal(false);
            loadAppointments();
        } catch (error: any) {
            showToast(error.response?.data?.error || 'Erro ao criar agendamento', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleStatusChange = async (id: string, status: 'concluido' | 'cancelado') => {
        try {
            setActionLoading(id);
            await api.put(`/appointments/${id}/status`, { status });
            showToast(
                status === 'concluido' ? 'Atendimento concluído!' : 'Agendamento cancelado',
                status === 'concluido' ? 'success' : 'info'
            );
            loadAppointments();
        } catch (error: any) {
            showToast(error.response?.data?.error || 'Erro ao atualizar status', 'error');
        } finally {
            setActionLoading(null);
        }
    };

    const filteredAppointments = appointments.filter(
        a => statusFilter === 'todos' || a.status === statusFilter
    );

    const groupedByDate = filteredAppointments.reduce<Record<string, Appointment[]>>((acc, appointment) => {
        const date = appointment.date.split('T')[0];
        if (!acc[date]) acc[date] = [];
        acc[date].push(appointment);
        return acc;
    }, {});

    const filteredClients = clients.filter(c =>
        c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
        c.phone.includes(clientSearch)
    );

    const stats = {
        total: appointments.length,
        confirmados: appointments.filter(a => a.status === 'confirmado').length,
        concluidos: appointments.filter(a => a.status === 'concluido').length,
        cancelados: appointments.filter(a => a.status === 'cancelado').length,
    };

    return (
        <div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
                <h2 className="text-3xl font-bold text-white">Agendamentos</h2>
                <button
                    onClick={openModal}
                    className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-orange-600 text-black font-bold rounded-xl transition-all hover:scale-105 hover:shadow-lg hover:shadow-primary/20"
                >
                    <Plus size={20} />
                    Novo Agendamento
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {[
                    { label: 'Total', value: stats.total, icon: Calendar, color: 'text-primary' },
                    { label: 'Confirmados', value: stats.confirmados, icon: Clock, color: 'text-blue-400' },
                    { label: 'Concluídos', value: stats.concluidos, icon: CheckCircle, color: 'text-green-400' },
                    { label: 'Cancelados', value: stats.cancelados, icon: XCircle, color: 'text-red-400' },
                ].map(stat => (
                    <div key={stat.label} className="bg-dark-light border border-white/5 rounded-xl p-4 hover:border-primary/20 transition-all">
                        <div className="flex items-center gap-3">
                            <stat.icon className={stat.color} size={20} />
                            <div>
                                <p className="text-2xl font-bold text-white">{stat.value}</p>
                                <p className="text-xs text-gray-500">{stat.label}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Date Navigation & Filters */}
            <div className="bg-dark-light border border-white/5 rounded-xl p-4 mb-6">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setSelectedDate(addDays(selectedDate, viewMode === 'day' ? -1 : -7))}
                            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <div className="text-center min-w-[200px]">
                            <p className="text-white font-semibold capitalize">
                                {viewMode === 'day'
                                    ? formatDate(selectedDate)
                                    : `${formatDateShort(selectedDate)} — ${formatDateShort(addDays(selectedDate, 6))}`
                                }
                            </p>
                        </div>
                        <button
                            onClick={() => setSelectedDate(addDays(selectedDate, viewMode === 'day' ? 1 : 7))}
                            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
                        >
                            <ChevronRight size={20} />
                        </button>
                        <button
                            onClick={() => setSelectedDate(getToday())}
                            className="px-3 py-1.5 text-xs rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-all"
                        >
                            Hoje
                        </button>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                        {/* View mode toggle */}
                        <div className="flex rounded-lg overflow-hidden border border-white/10">
                            {(['day', 'week'] as ViewMode[]).map(mode => (
                                <button
                                    key={mode}
                                    onClick={() => setViewMode(mode)}
                                    className={`px-4 py-2 text-xs font-medium transition-all ${viewMode === mode
                                            ? 'bg-primary text-black'
                                            : 'bg-white/5 text-gray-400 hover:text-white'
                                        }`}
                                >
                                    {mode === 'day' ? 'Dia' : 'Semana'}
                                </button>
                            ))}
                        </div>

                        {/* Status filter */}
                        <div className="flex items-center gap-1.5">
                            <Filter size={14} className="text-gray-500" />
                            {(['todos', 'confirmado', 'concluido', 'cancelado'] as StatusFilter[]).map(status => (
                                <button
                                    key={status}
                                    onClick={() => setStatusFilter(status)}
                                    className={`px-3 py-1.5 text-xs rounded-lg transition-all ${statusFilter === status
                                            ? 'bg-primary/20 text-primary border border-primary/30'
                                            : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                                        }`}
                                >
                                    {status === 'todos' ? 'Todos' : statusConfig[status].label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Appointments List */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="text-primary animate-spin mb-4" size={40} />
                    <p className="text-gray-500">Carregando agendamentos...</p>
                </div>
            ) : filteredAppointments.length === 0 ? (
                <div className="bg-dark-light border border-white/5 rounded-xl p-12">
                    <div className="flex flex-col items-center justify-center">
                        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                            <Calendar className="text-primary" size={36} />
                        </div>
                        <h3 className="text-xl font-semibold text-white mb-2">Nenhum agendamento</h3>
                        <p className="text-gray-500 text-center max-w-sm mb-6">
                            {statusFilter !== 'todos'
                                ? `Nenhum agendamento com status "${statusConfig[statusFilter]?.label}" neste período.`
                                : 'Não há agendamentos para este período. Crie um novo agendamento para começar!'
                            }
                        </p>
                        <button
                            onClick={openModal}
                            className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-orange-600 text-black font-bold rounded-xl transition-all hover:scale-105"
                        >
                            <Plus size={18} />
                            Criar Agendamento
                        </button>
                    </div>
                </div>
            ) : (
                <div className="space-y-6">
                    {Object.entries(groupedByDate)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([date, dayAppointments]) => (
                            <div key={date}>
                                {viewMode === 'week' && (
                                    <h3 className="text-sm font-medium text-gray-500 mb-3 capitalize flex items-center gap-2">
                                        <Calendar size={14} />
                                        {formatDate(date)}
                                    </h3>
                                )}
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                    {dayAppointments
                                        .sort((a, b) => a.time.localeCompare(b.time))
                                        .map(appointment => {
                                            const sc = statusConfig[appointment.status];
                                            const isActionLoading = actionLoading === appointment.id;
                                            return (
                                                <div
                                                    key={appointment.id}
                                                    className="bg-dark-light border border-white/5 rounded-xl p-5 hover:border-primary/20 transition-all group"
                                                >
                                                    {/* Time & Status */}
                                                    <div className="flex items-center justify-between mb-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                                                                <Clock className="text-primary" size={22} />
                                                            </div>
                                                            <div>
                                                                <p className="text-white font-bold text-lg">{appointment.time?.substring(0, 5)}</p>
                                                                <p className="text-gray-500 text-xs">{formatDateShort(appointment.date.split('T')[0])}</p>
                                                            </div>
                                                        </div>
                                                        <span className={`px-3 py-1 rounded-full text-xs font-medium border ${sc.color}`}>
                                                            <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${sc.dot}`}></span>
                                                            {sc.label}
                                                        </span>
                                                    </div>

                                                    {/* Details */}
                                                    <div className="space-y-2.5 mb-4">
                                                        <div className="flex items-center gap-2.5 text-sm">
                                                            <User size={14} className="text-gray-500 flex-shrink-0" />
                                                            <span className="text-white">{appointment.client_name}</span>
                                                            {appointment.client_phone && (
                                                                <span className="text-gray-600 text-xs">• {appointment.client_phone}</span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2.5 text-sm">
                                                            <Scissors size={14} className="text-gray-500 flex-shrink-0" />
                                                            <span className="text-gray-300">{appointment.barber_name}</span>
                                                        </div>
                                                        <div className="flex items-center justify-between text-sm">
                                                            <span className="text-gray-400">{appointment.service_name}</span>
                                                            <span className="text-primary font-bold">
                                                                R$ {Number(appointment.service_price || 0).toFixed(2)}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Actions */}
                                                    {appointment.status === 'confirmado' && (
                                                        <div className="flex gap-2 pt-3 border-t border-white/5">
                                                            <button
                                                                onClick={() => handleStatusChange(appointment.id, 'concluido')}
                                                                disabled={isActionLoading}
                                                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20 text-xs font-medium transition-all disabled:opacity-50"
                                                            >
                                                                {isActionLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                                                                Concluir
                                                            </button>
                                                            <button
                                                                onClick={() => handleStatusChange(appointment.id, 'cancelado')}
                                                                disabled={isActionLoading}
                                                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 text-xs font-medium transition-all disabled:opacity-50"
                                                            >
                                                                {isActionLoading ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                                                                Cancelar
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                </div>
                            </div>
                        ))}
                </div>
            )}

            {/* Create Appointment Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                        onClick={() => setShowModal(false)}
                    />
                    <div className="relative bg-[#111] border border-white/10 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl animate-slide-in">
                        {/* Modal Header */}
                        <div className="sticky top-0 bg-[#111] border-b border-white/10 p-6 rounded-t-2xl z-10">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                        <Plus className="text-primary" size={20} />
                                    </div>
                                    <h3 className="text-xl font-bold text-white">Novo Agendamento</h3>
                                </div>
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="p-2 rounded-lg hover:bg-white/5 text-gray-500 hover:text-white transition-all"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 space-y-5">
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
                                        className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-primary/50 transition-all"
                                    />
                                </div>
                                <div className="max-h-32 overflow-y-auto space-y-1">
                                    {filteredClients.length === 0 ? (
                                        <p className="text-gray-600 text-xs p-2">Nenhum cliente encontrado</p>
                                    ) : (
                                        filteredClients.map(client => (
                                            <button
                                                key={client.id}
                                                onClick={() => handleFormChange('clientId', client.id)}
                                                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${formData.clientId === client.id
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
                                            onClick={() => handleFormChange('barberId', barber.id)}
                                            className={`px-4 py-3 rounded-xl text-sm font-medium transition-all ${formData.barberId === barber.id
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
                                            onClick={() => handleFormChange('serviceId', service.id)}
                                            className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all flex items-center justify-between ${formData.serviceId === service.id
                                                    ? 'bg-primary/20 text-primary border border-primary/30'
                                                    : 'bg-white/5 border border-white/10 text-gray-300 hover:border-white/20'
                                                }`}
                                        >
                                            <div>
                                                <span className="font-medium">{service.name}</span>
                                                <span className="text-gray-500 text-xs ml-2">{service.duration_minutes}min</span>
                                            </div>
                                            <span className="font-bold text-primary">R$ {Number(service.price).toFixed(2)}</span>
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
                                    onChange={e => handleFormChange('date', e.target.value)}
                                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-primary/50 transition-all [color-scheme:dark]"
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
                                                onClick={() => handleFormChange('time', slot)}
                                                className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${formData.time === slot
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
                        </div>

                        {/* Modal Footer */}
                        <div className="sticky bottom-0 bg-[#111] border-t border-white/10 p-6 rounded-b-2xl">
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 font-medium transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSubmit}
                                    disabled={submitting || !formData.clientId || !formData.barberId || !formData.serviceId || !formData.time}
                                    className="flex-1 px-4 py-3 rounded-xl bg-primary hover:bg-orange-600 text-black font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {submitting ? (
                                        <Loader2 size={18} className="animate-spin" />
                                    ) : (
                                        <>
                                            <Plus size={18} />
                                            Agendar
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
