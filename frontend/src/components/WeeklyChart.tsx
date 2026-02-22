'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { WeeklyEarning } from '@/types';

interface WeeklyChartProps {
    data: WeeklyEarning[];
}

export function WeeklyChart({ data }: WeeklyChartProps) {
    return (
        <div className="bg-dark-light border border-primary/20 rounded-xl p-8">
            <h3 className="text-2xl font-bold text-white mb-6">Faturamento Semanal</h3>
            <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis
                        dataKey="date"
                        stroke="#999"
                        tickFormatter={(date) => new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                    />
                    <YAxis stroke="#999" />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: '#1a1a1a',
                            border: '1px solid #FF7A00',
                            borderRadius: '8px'
                        }}
                        labelFormatter={(date) => new Date(date).toLocaleDateString('pt-BR')}
                        formatter={(value: number) => [`R$ ${value}`, 'Faturamento']}
                    />
                    <Bar dataKey="total" fill="#FF7A00" radius={[8, 8, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
