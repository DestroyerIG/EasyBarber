'use client';

import type { DashboardData } from '@/types';

interface ProfitBarProps {
    data: DashboardData;
}

export function ProfitBar({ data }: ProfitBarProps) {
    const profitPercentage = data.earningsToday > 0
        ? Math.max(0, Math.min(100, (data.profitToday / data.earningsToday) * 100))
        : 0;

    return (
        <div className="bg-dark-light border border-primary/20 rounded-xl p-8 mb-8">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-white">Lucro do Dia</h3>
                <span className={`text-3xl font-bold ${data.profitToday >= 0 ? 'text-green-500' : 'text-red-500'
                    }`}>
                    R$ {data.profitToday.toFixed(2)}
                </span>
            </div>
            <div
                    className="h-1 bg-gray-700 rounded-full overflow-hidden"
                    role="progressbar"
                    aria-valuenow={Math.round(profitPercentage)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Margem de lucro: ${Math.round(profitPercentage)}%`}
                >
                <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${profitPercentage}%` }}
                />
            </div>
        </div>
    );
}
