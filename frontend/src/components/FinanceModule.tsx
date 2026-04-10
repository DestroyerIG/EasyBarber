'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { useToast } from './Toast';
import { formatCurrency } from '@/lib/formatters';
import { PageHeader } from '@/components/ui';
import { FinanceChart } from '@/components/finance/FinanceChart';
import { ExpensesTable } from '@/components/finance/ExpensesTable';
import { ExpenseModal } from '@/components/finance/ExpenseModal';
import { FeatureGate } from '@/components/billing/FeatureGate';
import type { FeatureAccessDecision } from '@/lib/subscriptionAccess';
import type { Expense, MonthlyReportDay } from '@/types';
import { getApiErrorMessage } from '@/utils/handleApiError';
import {
  TrendingUp, TrendingDown, DollarSign, Plus, FileText,
  Calendar, ArrowUpRight, ArrowDownRight, Activity
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import easyBarberLogo from '@/icons/easybarber.png';

interface FinanceSummary {
  today: { earnings: number; expenses: number; profit: number };
  month: { earnings: number; expenses: number; profit: number };
}

interface FinanceModuleProps {
  reportAccess: FeatureAccessDecision;
  exportAccess: FeatureAccessDecision;
  onUpgrade: () => void;
  onManageBilling: () => void;
}

type AutoTableDoc = jsPDF & { lastAutoTable: { finalY: number } };

const loadLogoDataUrl = async () => {
  try {
    const response = await fetch(easyBarberLogo.src);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

export const FinanceModule = ({
  reportAccess,
  exportAccess,
  onUpgrade,
  onManageBilling,
}: FinanceModuleProps) => {
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [reportData, setReportData] = useState<MonthlyReportDay[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'gastos'>('dashboard');
  const { showToast } = useToast();

  const safeFormatDate = (dateStr: string, formatStr: string) => {
    try {
      if (!dateStr) return '---';
      const date = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
      if (isNaN(date.getTime())) return 'Data inválida';
      return format(date, formatStr, { locale: ptBR });
    } catch {
      return 'Erro na data';
    }
  };

  const loadAllData = useCallback(async () => {
    try {
      setLoading(true);
      const now = new Date();

      const monthlyRequest = reportAccess.allowed
        ? api.get('/finance/monthly', { params: { month: now.getMonth() + 1, year: now.getFullYear() } })
        : Promise.resolve({ data: [] as MonthlyReportDay[] });

      const results = await Promise.allSettled([
        api.get('/finance/summary'),
        api.get('/finance/expenses'),
        monthlyRequest,
      ]);

      if (results[0].status === 'fulfilled') setSummary(results[0].value.data);
      if (results[1].status === 'fulfilled') setExpenses(results[1].value.data);
      if (results[2].status === 'fulfilled') setReportData(results[2].value.data);

      const hasUnexpectedError = results.some(result => {
        if (result.status !== 'rejected') return false;
        const statusCode = (result.reason as { response?: { status?: number } })?.response?.status;
        return statusCode !== 402 && statusCode !== 403;
      });

      if (hasUnexpectedError) {
        showToast('Alguns dados financeiros não puderam ser carregados.', 'error');
      }
    } catch {
      showToast('Erro ao carregar dados financeiros', 'error');
    } finally {
      setLoading(false);
    }
  }, [reportAccess.allowed, showToast]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const handleOpenModal = (expense?: Expense) => {
    setEditingExpense(expense || null);
    setIsModalOpen(true);
  };

  const handleSubmitExpense = async (data: { description: string; category: string; amount: number; date: string }) => {
    // ✅ CORRIGIDO: usa URL dinâmica /finance/expenses/${id}
    if (editingExpense) {
      await api.put(`/finance/expenses/${editingExpense.id}`, data);
      showToast('Gasto atualizado com sucesso', 'success');
    } else {
      await api.post('/finance/expenses', data);
      showToast('Gasto adicionado com sucesso', 'success');
    }
    loadAllData();
  };

  const handleDeleteExpense = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este gasto?')) return;
    try {
      // ✅ CORRIGIDO: usa URL dinâmica /finance/expenses/${id}
      await api.delete(`/finance/expenses/${id}`);
      showToast('Gasto excluído com sucesso', 'success');
      loadAllData();
    } catch (error: unknown) {
      const message = getApiErrorMessage(error, 'Erro ao excluir gasto');
      showToast(message, 'error');
    }
  };

  const exportToPDF = async () => {
    const monthSummary = {
      earnings: summary?.month.earnings || 0,
      expenses: summary?.month.expenses || 0,
      profit: summary?.month.profit || 0,
    };

    const doc = new jsPDF() as AutoTableDoc;
    const now = format(new Date(), 'dd/MM/yyyy HH:mm');
    const logoDataUrl = await loadLogoDataUrl();
    const titleX = logoDataUrl ? 30 : 14;

    if (logoDataUrl) {
      doc.addImage(logoDataUrl, 'PNG', 14, 12, 10, 10);
    }

    doc.setFontSize(20);
    doc.setTextColor(204, 133, 41);
    doc.text('EasyBarber - Relatório Financeiro', titleX, 20);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Gerado em: ${now}`, titleX, 28);
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text('Resumo Mensal', 14, 40);

    autoTable(doc, {
      startY: 45,
      head: [['Métrica', 'Valor']],
      body: [
        ['Ganhos', `R$ ${monthSummary.earnings.toFixed(2)}`],
        ['Gastos', `R$ ${monthSummary.expenses.toFixed(2)}`],
        ['Lucro Líquido', `R$ ${monthSummary.profit.toFixed(2)}`],
      ],
      theme: 'striped',
      headStyles: { fillColor: [204, 133, 41] },
    });

    doc.text('Detalhamento de Gastos', 14, doc.lastAutoTable.finalY + 15);

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 20,
      head: [['Data', 'Descrição', 'Categoria', 'Valor']],
      body: expenses.map(exp => [
        safeFormatDate(exp.date, 'dd/MM/yyyy'),
        exp.description,
        exp.category,
        `R$ ${parseFloat(exp.amount.toString()).toFixed(2)}`,
      ]),
      theme: 'grid',
      headStyles: { fillColor: [204, 133, 41] },
    });

    doc.save(`relatorio-financeiro-${format(new Date(), 'MM-yyyy')}.pdf`);
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
      <PageHeader
        title="Módulo Financeiro"
        description="Controle total de ganhos, gastos e saúde do seu negócio."
        action={
          <div className="flex gap-3">
            {exportAccess.allowed && (
              <button onClick={exportToPDF} className="btn-secondary flex items-center gap-2 py-2.5 px-6">
                <FileText size={20} className="text-primary" />
                PDF
              </button>
            )}
            <button onClick={() => handleOpenModal()} className="btn-primary flex items-center gap-2">
              <Plus size={20} /> Novo Gasto
            </button>
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card p-6 rounded-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-all">
            <TrendingUp size={80} />
          </div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Ganhos do Mês</p>
          <h3 className="text-3xl font-black text-white">{formatCurrency(summary?.month.earnings || 0)}</h3>
          <div className="mt-4 flex items-center gap-2 text-green-500 text-sm font-bold">
            <ArrowUpRight size={16} />
            <span>Receita de atendimentos</span>
          </div>
        </div>
        <div className="card p-6 rounded-2xl relative overflow-hidden group">
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

      {/* Tab Nav */}
      <div className="flex p-1 bg-dark-light border border-gray-800 rounded-xl w-fit">
        {(['dashboard', 'gastos'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-2 rounded-lg font-bold text-sm transition-all ${
              activeTab === tab ? 'tab-active' : 'tab-inactive'
            }`}
          >
            {tab === 'dashboard' ? 'Visão Geral' : 'Detalhamento de Gastos'}
          </button>
        ))}
      </div>

      {activeTab === 'dashboard' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <FeatureGate
              access={reportAccess}
              onUpgrade={onUpgrade}
              onManageBilling={onManageBilling}
              title="Relatórios mensais indisponíveis"
            >
              <FinanceChart data={reportData} />
            </FeatureGate>
          </div>
          <div className="space-y-6">
            <div className="card p-6 rounded-2xl">
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
            <FeatureGate
              access={exportAccess}
              onUpgrade={onUpgrade}
              onManageBilling={onManageBilling}
              title="Exportações indisponíveis"
            >
              <div className="bg-gradient-to-br from-primary/10 to-transparent border border-primary/20 p-6 rounded-2xl">
                <h3 className="text-sm font-bold text-white mb-2">Exportação Rápida</h3>
                <p className="text-xs text-gray-400 mb-4">Gere um documento PDF com todos os dados financeiros deste mês.</p>
                <button onClick={exportToPDF} className="w-full btn-primary flex items-center justify-center gap-2">
                  <FileText size={18} />
                  GERAR RELATÓRIO
                </button>
              </div>
            </FeatureGate>
          </div>
        </div>
      ) : (
        <ExpensesTable expenses={expenses} onEdit={handleOpenModal} onDelete={handleDeleteExpense} />
      )}

      <ExpenseModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmitExpense}
        editingExpense={editingExpense}
      />
    </div>
  );
};
