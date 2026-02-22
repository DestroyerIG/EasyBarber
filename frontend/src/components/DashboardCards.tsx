'use client';

import { Calendar, DollarSign, TrendingUp, Users } from 'lucide-react';
import type { DashboardData } from '@/types';

interface DashboardCardsProps {
    data: DashboardData;
}

export function DashboardCards({ data }: DashboardCardsProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-dark-light border border-primary/20 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                    <Calendar className="text-primary" size={32} />
                    <span className="text-3xl font-bold text-primary">
                        {data.appointmentsToday}
                    </span>
                </div>
                <p className="text-gray-400">Agendamentos Hoje</p>
            </div>

            <div className="bg-dark-light border border-green-500/20 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                    <DollarSign className="text-green-500" size={32} />
                    <span className="text-3xl font-bold text-green-500">
                        R$ {data.earningsToday.toFixed(2)}
                    </span>
                </div>
                <p className="text-gray-400">Ganhos do Dia</p>
            </div>

            <div className="bg-dark-light border border-red-500/20 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                    <TrendingUp className="text-red-500" size={32} />
                    <span className="text-3xl font-bold text-red-500">
                        R$ {data.expensesToday.toFixed(2)}
                    </span>
                </div>
                <p className="text-gray-400">Gastos do Dia</p>
            </div>

            <div className="bg-dark-light border border-blue-500/20 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                    <Users className="text-blue-500" size={32} />
                    <span className="text-3xl font-bold text-blue-500">
                        {data.totalClients}
                    </span>
                </div>
                <p className="text-gray-400">Total de Clientes</p>
            </div>
        </div>
    );
}
