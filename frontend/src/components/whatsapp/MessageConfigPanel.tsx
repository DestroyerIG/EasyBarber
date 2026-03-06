'use client';

import {
  MessageSquare,
  User,
  CheckCircle,
  Clock,
  AlertCircle,
  LogOut,
  Loader2,
  Save,
  RotateCcw,
  XCircle,
  CalendarX,
  RefreshCw,
  Star,
  Megaphone,
  Instagram,
  Ban,
  ListChecks,
} from 'lucide-react';

export interface BotConfig {
  welcome_header: string;
  ask_name_message: string;
  attendant_message: string;
  confirmation_message: string;
  reminder_message: string;
  invalid_option_message: string;
  session_expired_message: string;
  end_session_message: string;
  name_validation_message: string;
  no_slots_message: string;
  cancel_no_appointments_message: string;
  cancel_list_message: string;
  cancel_success_message: string;
  reschedule_no_appointments_message: string;
  reschedule_list_message: string;
  no_previous_appointments_message: string;
  rating_question_message: string;
  rating_confirmation_message: string;
  promotions_message: string;
  instagram_message: string;
}

interface MessageConfigPanelProps {
  botConfig: BotConfig;
  onChange: (config: BotConfig) => void;
  configLoading: boolean;
  actionLoading: boolean;
  onSave: () => void;
  onReset: () => void;
}

interface FieldDef {
  key: keyof BotConfig;
  label: string;
  icon: typeof MessageSquare;
  rows: number;
  hint?: string;
  category: string;
}

const FIELDS: FieldDef[] = [
  // Fluxo Principal
  { key: 'welcome_header', label: 'Cabeçalho de Boas-vindas', icon: MessageSquare, rows: 4, hint: 'Disponível: {nome_barbearia}. O menu é gerado automaticamente.', category: 'Fluxo Principal' },
  { key: 'ask_name_message', label: 'Pergunta de Nome (Novo Cliente)', icon: User, rows: 4, category: 'Fluxo Principal' },
  { key: 'name_validation_message', label: 'Nome Inválido', icon: AlertCircle, rows: 3, category: 'Fluxo Principal' },
  { key: 'invalid_option_message', label: 'Opção Inválida', icon: Ban, rows: 3, category: 'Fluxo Principal' },
  { key: 'session_expired_message', label: 'Sessão Expirada', icon: LogOut, rows: 3, category: 'Fluxo Principal' },
  { key: 'end_session_message', label: 'Encerrar Atendimento', icon: XCircle, rows: 3, category: 'Fluxo Principal' },
  { key: 'attendant_message', label: 'Falar com Atendente', icon: User, rows: 4, category: 'Fluxo Principal' },

  // Agendamento
  { key: 'confirmation_message', label: 'Confirmação de Agendamento', icon: CheckCircle, rows: 5, hint: 'Disponível: {servico}, {barbeiro}, {data}, {horario}, {valor}', category: 'Agendamento' },
  { key: 'reminder_message', label: 'Lembrete (2h antes)', icon: Clock, rows: 5, hint: 'Disponível: {nome_cliente}, {servico}, {barbeiro}, {horario}', category: 'Agendamento' },
  { key: 'no_slots_message', label: 'Sem Horários Disponíveis', icon: CalendarX, rows: 3, category: 'Agendamento' },

  // Cancelamento
  { key: 'cancel_no_appointments_message', label: 'Sem Agendamentos para Cancelar', icon: XCircle, rows: 3, category: 'Cancelamento' },
  { key: 'cancel_list_message', label: 'Lista de Agendamentos (Cancelar)', icon: ListChecks, rows: 4, hint: 'Disponível: {lista_agendamentos}', category: 'Cancelamento' },
  { key: 'cancel_success_message', label: 'Cancelamento Confirmado', icon: CheckCircle, rows: 3, category: 'Cancelamento' },

  // Reagendamento
  { key: 'reschedule_no_appointments_message', label: 'Sem Agendamentos para Reagendar', icon: RefreshCw, rows: 3, category: 'Reagendamento' },
  { key: 'reschedule_list_message', label: 'Lista de Agendamentos (Reagendar)', icon: ListChecks, rows: 4, hint: 'Disponível: {lista_agendamentos}', category: 'Reagendamento' },

  // Avaliação & Extras
  { key: 'no_previous_appointments_message', label: 'Sem Atendimentos Anteriores', icon: Star, rows: 3, category: 'Avaliação & Extras' },
  { key: 'rating_question_message', label: 'Pergunta de Avaliação', icon: Star, rows: 4, category: 'Avaliação & Extras' },
  { key: 'rating_confirmation_message', label: 'Confirmação de Avaliação', icon: CheckCircle, rows: 3, hint: 'Disponível: {avaliacao}', category: 'Avaliação & Extras' },
  { key: 'promotions_message', label: 'Promoções', icon: Megaphone, rows: 4, hint: 'Disponível: {nome_barbearia}', category: 'Avaliação & Extras' },
  { key: 'instagram_message', label: 'Instagram', icon: Instagram, rows: 4, hint: 'Disponível: {nome_barbearia}, {instagram_handle}', category: 'Avaliação & Extras' },
];

const CATEGORIES = ['Fluxo Principal', 'Agendamento', 'Cancelamento', 'Reagendamento', 'Avaliação & Extras'];

export const MessageConfigPanel = ({
  botConfig,
  onChange,
  configLoading,
  actionLoading,
  onSave,
  onReset,
}: MessageConfigPanelProps) => (
  <div className="card rounded-2xl overflow-hidden">
    <div className="p-8 border-b border-gray-800 bg-black/20 flex justify-between items-center">
      <div>
        <h3 className="text-xl font-bold text-white mb-2">Personalizar Mensagens</h3>
        <p className="text-gray-400 text-sm">Defina como o bot deve falar com seus clientes.</p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onReset}
          disabled={actionLoading || configLoading}
          className="p-3 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-xl transition-all disabled:opacity-50"
          title="Resetar para o padrão"
        >
          <RotateCcw size={20} />
        </button>
        <button
          onClick={onSave}
          disabled={actionLoading || configLoading}
          className="btn-primary flex items-center gap-2 disabled:opacity-50"
        >
          {actionLoading ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
          Salvar Alterações
        </button>
      </div>
    </div>

    {configLoading ? (
      <div className="p-20 flex flex-col items-center justify-center space-y-4">
        <Loader2 size={48} className="text-primary animate-spin" />
        <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Carregando configurações...</p>
      </div>
    ) : (
      <div className="p-8 space-y-8 max-h-[700px] overflow-y-auto">
        {CATEGORIES.map(category => {
          const categoryFields = FIELDS.filter(f => f.category === category);
          return (
            <div key={category}>
              <h4 className="text-xs font-bold text-primary uppercase tracking-widest mb-4 border-b border-gray-800 pb-2">
                {category}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {categoryFields.map(({ key, label, icon: Icon, rows, hint }) => (
                  <div key={key} className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                      <Icon size={14} className="text-primary" />
                      {label}
                    </label>
                    <textarea
                      value={botConfig[key] || ''}
                      onChange={e => onChange({ ...botConfig, [key]: e.target.value })}
                      rows={rows}
                      className="w-full bg-black/40 border border-gray-800 p-4 rounded-xl text-sm text-gray-300 focus:outline-none focus:border-primary transition-all resize-none"
                    />
                    {hint && <p className="text-[10px] text-gray-600 italic">{hint}</p>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
);
