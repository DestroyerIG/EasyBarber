'use client';

import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';
import { useToast } from '@/components/Toast';
import { getToday } from '@/lib/dateUtils';
import { formatDate } from '@/lib/dateUtils';
import { PageHeader, StatsCard, EmptyState } from '@/components/ui';
import { DateNavigationBar } from '@/components/appointments/DateNavigationBar';
import { AppointmentCard } from '@/components/appointments/AppointmentCard';
import { CreateAppointmentModal } from '@/components/appointments/CreateAppointmentModal';
import type { AppointmentFormData } from '@/components/appointments/CreateAppointmentModal';
import type { Appointment, Client, Barber, Service } from '@/types';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { Calendar, Clock, CheckCircle, XCircle, Plus, Loader2 } from 'lucide-react';

type ViewMode = 'day' | 'week';
type StatusFilter = 'todos' | 'confirmado' | 'concluido' | 'cancelado';

export function AppointmentModule() {
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(getToday());
    const [viewMode, setViewMode] = useState<ViewMode>('day');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');
    const [showModal, setShowModal] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const { showToast } = useToast();

    // Modal data
    const [clients, setClients] = useState<Client[]>([]);
    const [barbers, setBarbers] = useState<Barber[]>([]);
    const [services, setServices] = useState<Service[]>([]);
    const [availableSlots, setAvailableSlots] = useState<string[]>([]);
    const [slotsLoading, setSlotsLoading] = useState(false);

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
    }, [selectedDate, showToast, viewMode]);

    useEffect(() => {
        loadAppointments();
    }, [loadAppointments]);

    const openModal = async () => {
        setShowModal(true);
        setAvailableSlots([]);
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

    const handleSubmit = async (formData: AppointmentFormData) => {
        await api.post('/appointments', formData);
        showToast('Agendamento criado com sucesso!', 'success');
        loadAppointments();
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
        } catch (error: unknown) {
            const message = getApiErrorMessage(error, 'Erro ao atualizar status');
            showToast(message, 'error');
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

    const stats = {
        total: appointments.length,
        confirmados: appointments.filter(a => a.status === 'confirmado').length,
        concluidos: appointments.filter(a => a.status === 'concluido').length,
        cancelados: appointments.filter(a => a.status === 'cancelado').length,
    };

    return (
        <div>
            <PageHeader
                title="Agendamentos"
                action={
                    <button onClick={openModal} className="btn-primary flex items-center gap-2">
                        <Plus size={20} />
                        Novo Agendamento
                    </button>
                }
            />

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <StatsCard label="Total" value={stats.total} icon={Calendar} color="text-primary" />
                <StatsCard label="Confirmados" value={stats.confirmados} icon={Clock} color="text-blue-400" />
                <StatsCard label="Concluídos" value={stats.concluidos} icon={CheckCircle} color="text-green-400" />
                <StatsCard label="Cancelados" value={stats.cancelados} icon={XCircle} color="text-red-400" />
            </div>

            <DateNavigationBar
                selectedDate={selectedDate}
                viewMode={viewMode}
                statusFilter={statusFilter}
                onDateChange={setSelectedDate}
                onViewModeChange={setViewMode}
                onStatusFilterChange={setStatusFilter}
            />

            {/* Appointments List */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="text-primary animate-spin mb-4" size={40} />
                    <p className="text-gray-500">Carregando agendamentos...</p>
                </div>
            ) : filteredAppointments.length === 0 ? (
                <EmptyState
                    icon={Calendar}
                    title="Nenhum agendamento"
                    description={
                        statusFilter !== 'todos'
                            ? `Nenhum agendamento com este status neste período.`
                            : 'Não há agendamentos para este período. Crie um novo agendamento para começar!'
                    }
                    action={{ label: 'Criar Agendamento', icon: Plus, onClick: openModal }}
                />
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
                                        .map(appointment => (
                                            <AppointmentCard
                                                key={appointment.id}
                                                appointment={appointment}
                                                actionLoading={actionLoading}
                                                onStatusChange={handleStatusChange}
                                            />
                                        ))}
                                </div>
                            </div>
                        ))}
                </div>
            )}

            <CreateAppointmentModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                clients={clients}
                barbers={barbers}
                services={services}
                availableSlots={availableSlots}
                slotsLoading={slotsLoading}
                onLoadSlots={loadAvailableSlots}
                onSubmit={handleSubmit}
            />
        </div>
    );
}
