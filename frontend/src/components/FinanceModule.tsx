'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useToast } from './Toast';
import {
    TrendingUp,
    TrendingDown,
    DollarSign,
    Plus,
    Trash2,
    Edit2,
    Save,
    X,
    FileText,
    Calendar,
    Filter,
    ArrowUpRight,
    ArrowDownRight,
    Activity
} from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area,
    Legend
} from 'recharts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface Expense {
    id: string;
    description: string;
    category: string;
    amount: number;
    date: string;
}

interface FinanceSummary {
    today: { earnings: number; expenses: number; profit: number };
    month: { earnings: number; expenses: number; profit: number };
}

export const FinanceModule = () => {
    const [summary, setSummary] = useState<FinanceSummary | null>(null);
    const [reportData, setReportData] = useState<any[]>([]);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
    const [activeTab, setActiveTab] = useState<'dashboard' | 'gastos'>('dashboard');

    const { showToast } = useToast();

    const [formData, setFormData] = useState({
        description: '',
        category: '',
        amount: '',
        date: new Date().toISOString().split('T')[0]
    });

    const safeFormatDate = (dateStr: string, formatStr: string) => {
        try {
            if (!dateStr) return '---';
            // Se já tem T, assume que é ISO completo. Se não, anexa T12 para evitar problemas de fuso no parsing simples
            const date = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
            if (isNaN(date.getTime())) return 'Data inválida';
            return format(date, formatStr, { locale: ptBR });
        } catch (error) {
            console.error('Erro ao formatar data:', error);
            return 'Erro na data';
        }
    };

    useEffect(() => {
        loadAllData();
    }, []);

    const loadAllData = async () => {
        try {
            setLoading(true);
            const now = new Date();

            // Usamos Promise.allSettled para que se o relatório mensal falhar (ex: plano básico)
            // o restante dos dados financeiros ainda carregue normalmente.
            const results = await Promise.allSettled([
                api.get('/finance/summary'),
                api.get('/finance/monthly', { params: { month: now.getMonth() + 1, year: now.getFullYear() } }),
                api.get('/finance/expenses')
            ]);

            if (results[0].status === 'fulfilled') setSummary(results[0].value.data);
            if (results[1].status === 'fulfilled') setReportData(results[1].value.data);
            if (results[2].status === 'fulfilled') setExpenses(results[2].value.data);

            // Tratamento amigável para erro de plano
            if (results[1].status === 'rejected' && (results[1].reason as any).response?.status === 403) {
                // Relatório mensal bloqueado pelo plano - silenciar
            } else if (results.some(r => r.status === 'rejected')) {
                showToast('Alguns dados financeiros não puderam ser carregados.', 'error');
            }

        } catch (error: any) {
            showToast('Erro ao carregar dados financeiros', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (expense?: Expense) => {
        if (expense) {
            setEditingExpense(expense);
            setFormData({
                description: expense.description,
                category: expense.category,
                amount: expense.amount.toString(),
                date: expense.date.split('T')[0]
            });
        } else {
            setEditingExpense(null);
            setFormData({
                description: '',
                category: '',
                amount: '',
                date: new Date().toISOString().split('T')[0]
            });
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const data = {
                ...formData,
                amount: parseFloat(formData.amount)
            };

            if (editingExpense) {
                await api.put(`/finance/expenses/${editingExpense.id}`, data);
                showToast('Gasto atualizado com sucesso', 'success');
            } else {
                await api.post('/finance/expenses', data);
                showToast('Gasto adicionado com sucesso', 'success');
            }
            setIsModalOpen(false);
            loadAllData();
        } catch (error: any) {
            showToast(error.response?.data?.error || 'Erro ao salvar gasto', 'error');
        }
    };

    const handleDeleteExpense = async (id: string) => {
        if (!confirm('Tem certeza que deseja excluir este gasto?')) return;
        try {
            await api.delete(`/finance/expenses/${id}`);
            showToast('Gasto excluído com sucesso', 'success');
            loadAllData();
        } catch (error: any) {
            showToast(error.response?.data?.error || 'Erro ao excluir gasto', 'error');
        }
    };

    const exportToPDF = () => {
        const doc = new jsPDF() as any;
        const now = format(new Date(), 'dd/MM/yyyy HH:mm');

        doc.setFontSize(20);
        doc.setTextColor(204, 133, 41); // Primary color
        doc.text('BarberPro SaaS - Relatório Financeiro', 14, 20);

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Gerado em: ${now}`, 14, 28);

        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.text('Resumo Mensal', 14, 40);

        const summaryTable = [
            ['Ganhos', `R$ ${summary?.month.earnings.toFixed(2)}`],
            ['Gastos', `R$ ${summary?.month.expenses.toFixed(2)}`],
            ['Lucro Líquido', `R$ ${summary?.month.profit.toFixed(2)}`]
        ];

        autoTable(doc, {
            startY: 45,
            head: [['Métrica', 'Valor']],
            body: summaryTable,
            theme: 'striped',
            headStyles: { fillColor: [204, 133, 41] }
        });

        const finalY = (doc as any).lastAutoTable.finalY || 70;
        doc.text('Detalhamento de Gastos', 14, finalY + 15);

        const expenseRows = expenses.map(exp => [
            safeFormatDate(exp.date, 'dd/MM/yyyy'),
            exp.description,
            exp.category,
            `R$ ${parseFloat(exp.amount.toString()).toFixed(2)}`
        ]);

        autoTable(doc, {
            startY: (doc as any).lastAutoTable.finalY + 20,
            head: [['Data', 'Descrição', 'Categoria', 'Valor']],
            body: expenseRows,
            theme: 'grid',
            headStyles: { fillColor: [204, 133, 41] }
        });

        doc.save(`relatorio-financeiro-${format(new Date(), 'MM-yyyy')}.pdf`);
    };

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 animate-pulse">
                <Activity className="text-primary animate-spin mb-4" size={48} />
                <p className="text-gray-500 font-bold uppercase tracking-widest">Processando dados financeiros...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in pb-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-white tracking-tight">Módulo Financeiro</h2>
                    <p className="text-gray-400">Controle total de ganhos, gastos e saúde do seu negócio.</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={exportToPDF}
                        className="flex items-center justify-center gap-2 bg-dark-light hover:bg-gray-800 text-white font-bold py-2.5 px-6 rounded-xl transition-all border border-gray-800"
                    >
                        <FileText size={20} className="text-primary" />
                        PDF
                    </button>
                    <button
                        onClick={() => handleOpenModal()}
                        className="flex items-center justify-center gap-2 bg-primary hover:bg-orange-600 text-black font-bold py-2.5 px-6 rounded-xl transition-all shadow-lg shadow-primary/20"
                    >
                        <Plus size={20} />
                        Novo Gasto
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-dark-light border border-gray-800 p-6 rounded-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-all">
                        <TrendingUp size={80} />
                    </div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Ganhos do Mês</p>
                    <h3 className="text-3xl font-black text-white">{formatCurrency(summary?.month.earnings || 0)}</h3>
                    <div className="mt-4 flex items-center gap-2 text-green-500 text-sm font-bold">
                        <ArrowUpRight size={16} />
                        <span>+ 12% em relação ao mês anterior</span>
                    </div>
                </div>

                <div className="bg-dark-light border border-gray-800 p-6 rounded-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-all">
                        <TrendingDown size={80} />
                    </div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Gastos do Mês</p>
                    <h3 className="text-3xl font-black text-white">{formatCurrency(summary?.month.expenses || 0)}</h3>
                    <div className="mt-4 flex items-center gap-2 text-red-500 text-sm font-bold">
                        <ArrowDownRight size={16} />
                        <span>Registro manual de despesas</span>
                    </div>
                </div>

                <div className="bg-primary/5 border border-primary/20 p-6 rounded-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-all">
                        <DollarSign size={80} className="text-primary" />
                    </div>
                    <p className="text-xs font-bold text-primary/60 uppercase tracking-widest mb-1">Lucro Líquido</p>
                    <h3 className="text-3xl font-black text-primary">{formatCurrency(summary?.month.profit || 0)}</h3>
                    <div className="mt-4 flex items-center gap-2 text-primary text-sm font-bold">
                        <Activity size={16} />
                        <span>Saldo real disponível</span>
                    </div>
                </div>
            </div>

            <div className="flex p-1 bg-dark-light border border-gray-800 rounded-xl w-fit">
                <button
                    onClick={() => setActiveTab('dashboard')}
                    className={`px-6 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'dashboard' ? 'bg-primary text-black' : 'text-gray-400 hover:text-white'}`}
                >
                    Visão Geral
                </button>
                <button
                    onClick={() => setActiveTab('gastos')}
                    className={`px-6 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'gastos' ? 'bg-primary text-black' : 'text-gray-400 hover:text-white'}`}
                >
                    Detalhamento de Gastos
                </button>
            </div>

            {activeTab === 'dashboard' ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 bg-dark-light border border-gray-800 p-6 rounded-2xl">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-lg font-bold text-white uppercase tracking-tight">Gráfico de Crescimento</h3>
                            <div className="flex gap-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-primary" />
                                    <span className="text-xs text-gray-400 font-bold">Ganhos</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-gray-600" />
                                    <span className="text-xs text-gray-400 font-bold">Gastos</span>
                                </div>
                            </div>
                        </div>
                        <div className="h-[350px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={reportData}>
                                    <defs>
                                        <linearGradient id="colorEarnings" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#cc8529" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#cc8529" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                                    <XAxis
                                        dataKey="date"
                                        stroke="#4b5563"
                                        fontSize={12}
                                        tickFormatter={(val) => safeFormatDate(val, 'dd/MM')}
                                    />
                                    <YAxis stroke="#4b5563" fontSize={12} tickFormatter={(val) => `R$ ${val}`} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '12px' }}
                                        labelStyle={{ color: '#9ca3af', marginBottom: '8px', fontWeight: 'bold' }}
                                    />
                                    <Area type="monotone" dataKey="earnings" name="Ganhos" stroke="#cc8529" strokeWidth={3} fillOpacity={1} fill="url(#colorEarnings)" />
                                    <Area type="monotone" dataKey="expenses" name="Gastos" stroke="#4b5563" strokeWidth={2} fillOpacity={0} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="bg-dark-light border border-gray-800 p-6 rounded-2xl">
                            <h3 className="text-sm font-bold text-white uppercase tracking-widest mb-6 flex items-center gap-2">
                                <Calendar size={18} className="text-primary" />
                                Resumo de Hoje
                            </h3>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center p-4 bg-black/40 rounded-xl border border-gray-800">
                                    <span className="text-sm text-gray-400 font-medium">Ganhos</span>
                                    <span className="text-lg font-bold text-green-500">{formatCurrency(summary?.today.earnings || 0)}</span>
                                </div>
                                <div className="flex justify-between items-center p-4 bg-black/40 rounded-xl border border-gray-800">
                                    <span className="text-sm text-gray-400 font-medium">Gastos</span>
                                    <span className="text-lg font-bold text-red-500">{formatCurrency(summary?.today.expenses || 0)}</span>
                                </div>
                                <div className="pt-2 border-t border-gray-800 flex justify-between items-center px-2">
                                    <span className="text-xs font-black text-gray-500 uppercase tracking-tighter">Balanço do Dia</span>
                                    <span className={`text-xl font-black ${(summary?.today.profit || 0) >= 0 ? 'text-primary' : 'text-red-500'}`}>
                                        {formatCurrency(summary?.today.profit || 0)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="bg-gradient-to-br from-primary/10 to-transparent border border-primary/20 p-6 rounded-2xl">
                            <h3 className="text-sm font-bold text-white mb-2">Exportação Rápida</h3>
                            <p className="text-xs text-gray-400 mb-4">Gere um documento PDF com todos os dados financeiros deste mês.</p>
                            <button
                                onClick={exportToPDF}
                                className="w-full bg-primary text-black font-black py-3 rounded-xl hover:bg-orange-600 transition-all flex items-center justify-center gap-2"
                            >
                                <FileText size={18} />
                                GERAR RELATÓRIO
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-dark-light border border-gray-800 rounded-2xl overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-black/40 text-gray-500 text-[10px] font-black uppercase tracking-[0.2em]">
                            <tr>
                                <th className="px-6 py-5 border-b border-gray-800">Data</th>
                                <th className="px-6 py-5 border-b border-gray-800">Descrição</th>
                                <th className="px-6 py-5 border-b border-gray-800">Categoria</th>
                                <th className="px-6 py-5 border-b border-gray-800">Valor</th>
                                <th className="px-6 py-5 border-b border-gray-800 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {expenses.map(expense => (
                                <tr key={expense.id} className="hover:bg-white/5 transition-colors group">
                                    <td className="px-6 py-4 text-gray-400 font-medium text-sm">
                                        {safeFormatDate(expense.date, 'dd MMM yyyy')}
                                    </td>
                                    <td className="px-6 py-4 text-white font-bold text-sm">
                                        {expense.description}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="px-3 py-1 bg-gray-800 text-gray-300 rounded-full text-[10px] font-black uppercase tracking-widest border border-gray-700">
                                            {expense.category}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-red-400 font-black text-sm">
                                        {formatCurrency(expense.amount)}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                            <button onClick={() => handleOpenModal(expense)} className="p-2 text-gray-500 hover:text-primary transition-colors">
                                                <Edit2 size={16} />
                                            </button>
                                            <button onClick={() => handleDeleteExpense(expense.id)} className="p-2 text-gray-500 hover:text-red-500 transition-colors">
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {expenses.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="py-20 text-center text-gray-600 font-bold uppercase tracking-widest">
                                        Nenhum gasto registrado.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {isModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-dark-light border border-primary/30 rounded-2xl w-full max-w-md overflow-hidden animate-zoom-in">
                        <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-black/20">
                            <h3 className="text-xl font-bold text-white uppercase tracking-tight">
                                {editingExpense ? 'Editar Gasto' : 'Novo Gasto'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-white transition-colors">
                                <X size={24} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-6">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Descrição</label>
                                <input
                                    required
                                    type="text"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full bg-black/40 border border-gray-700 text-white p-3 rounded-xl focus:border-primary focus:outline-none transition-all"
                                    placeholder="Ex: Aluguel da sala"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Categoria</label>
                                    <select
                                        required
                                        value={formData.category}
                                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                        className="w-full bg-black/40 border border-gray-700 text-white p-3 rounded-xl focus:border-primary focus:outline-none transition-all"
                                    >
                                        <option value="" disabled>Selecione...</option>
                                        <option value="Produtos">Produtos</option>
                                        <option value="Equipamentos">Equipamentos</option>
                                        <option value="Aluguel">Aluguel</option>
                                        <option value="Contas">Contas</option>
                                        <option value="Marketing">Marketing</option>
                                        <option value="Outros">Outros</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Valor (R$)</label>
                                    <input
                                        required
                                        type="number"
                                        step="0.01"
                                        value={formData.amount}
                                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                                        className="w-full bg-black/40 border border-gray-700 text-white p-3 rounded-xl focus:border-primary focus:outline-none transition-all"
                                        placeholder="100.00"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Data</label>
                                <input
                                    required
                                    type="date"
                                    value={formData.date}
                                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                    className="w-full bg-black/40 border border-gray-700 text-white p-3 rounded-xl focus:border-primary focus:outline-none transition-all"
                                />
                            </div>

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
                                    Salvar Gasto
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
