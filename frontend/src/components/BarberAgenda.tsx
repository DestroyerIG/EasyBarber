'use client';

import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';
import { useToast } from '@/components/Toast';
import type { Appointment, Barber } from '@/types';
import {
    Clock, Calendar, CheckCircle, XCircle, User, Scissors, Loader2, ChevronLeft, ChevronRight
} from 'lucide-react';

interface BarberAgendaProps {
    barber: Barber;
}

const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
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

export function BarberAgenda({ barber }: BarberAgendaProps) {
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(getToday());
    const { showToast } = useToast();

    const loadAppointments = useCallback(async () => {
        try {
            setLoading(true);
            const params = {
                date: selectedDate,
                view: 'day',
                barberId: barber.id
            };
            const response = await api.get('/appointments', { params });
            setAppointments(response.data);
        } catch {
            showToast('Erro ao carregar agenda', 'error');
        } finally {
            setLoading(false);
        }
    }, [selectedDate, barber.id]);

    useEffect(() => {
        loadAppointments();
    }, [loadAppointments]);

    return (
        <div className="animate-fade-in">
            <div className="bg-dark-light border border-primary/20 rounded-2xl p-6 mb-6">
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-primary bg-black/40 flex items-center justify-center">
                        {barber.photo ? (
                            <img src={barber.photo} alt={barber.name} className="w-full h-full object-cover" />
                        ) : (
                            <User className="text-primary/40" size={32} />
                        )}
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-white">Agenda: {barber.name}</h2>
                        <p className="text-gray-400 capitalize">{formatDate(selectedDate)}</p>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setSelectedDate(addDays(selectedDate, -1))}
                        className="p-2 rounded-xl bg-dark-light border border-gray-800 text-gray-400 hover:text-white transition-all"
                    >
                        <ChevronLeft size={24} />
                    </button>
                    <button
                        onClick={() => setSelectedDate(getToday())}
                        className="px-6 py-2 rounded-xl bg-dark-light border border-gray-800 text-sm font-bold text-gray-400 hover:text-primary transition-all"
                    >
                        Hoje
                    </button>
                    <button
                        onClick={() => setSelectedDate(addDays(selectedDate, 1))}
                        className="p-2 rounded-xl bg-dark-light border border-gray-800 text-gray-400 hover:text-white transition-all"
                    >
                        <ChevronRight size={24} />
                    </button>
                </div>

                <div className="bg-dark-light px-4 py-2 rounded-xl border border-primary/10 text-xs font-bold text-primary uppercase tracking-widest">
                    {appointments.length} Atendimento(s)
                </div>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="text-primary animate-spin mb-4" size={40} />
                    <p className="text-gray-500 font-medium">Buscando horários...</p>
                </div>
            ) : appointments.length === 0 ? (
                <div className="bg-dark-light border border-dashed border-gray-800 rounded-2xl p-20 text-center">
                    <Calendar className="text-gray-600 mx-auto mb-4" size={48} />
                    <h3 className="text-xl font-bold text-gray-400">Nenhum agendamento para hoje</h3>
                    <p className="text-gray-500 mt-1">Este profissional está livre no momento.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {appointments.map(appointment => (
                        <div key={appointment.id} className="bg-dark-light border border-gray-800 p-5 rounded-2xl flex items-center justify-between group hover:border-primary/20 transition-all">
                            <div className="flex items-center gap-5">
                                <div className="text-center">
                                    <p className="text-2xl font-black text-white leading-tight">{appointment.time.substring(0, 5)}</p>
                                    <p className="text-[10px] font-bold text-primary uppercase tracking-tighter">Horário</p>
                                </div>
                                <div className="w-px h-10 bg-gray-800" />
                                <div>
                                    <h4 className="font-bold text-white uppercase text-sm tracking-tight">{appointment.client_name}</h4>
                                    <p className="text-xs text-gray-500 font-medium">{appointment.service_name}</p>
                                </div>
                            </div>
                            <div className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${appointment.status === 'concluido' ? 'border-green-500/30 bg-green-500/10 text-green-500' :
                                    appointment.status === 'cancelado' ? 'border-red-500/30 bg-red-500/10 text-red-500' :
                                        'border-primary/30 bg-primary/10 text-primary'
                                }`}>
                                {appointment.status}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
