'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { useToast } from './Toast';
import { PageHeader } from '@/components/ui';
import { ConnectionPanel } from '@/components/whatsapp/ConnectionPanel';
import { MessageConfigPanel, BotConfig } from '@/components/whatsapp/MessageConfigPanel';
import { MenuOptionsPanel, MenuOption } from '@/components/whatsapp/MenuOptionsPanel';
import { ChatSimulator } from '@/components/whatsapp/ChatSimulator';
import {
  Smartphone,
  Settings2,
  Bot,
  Zap,
  ShieldCheck,
  Clock,
  User,
  Wifi,
  Loader2,
  CheckCircle,
  QrCode,
  WifiOff,
  LogOut,
  RefreshCw,
  List,
} from 'lucide-react';

interface WhatsAppStatus {
  status: 'disconnected' | 'qr' | 'connecting' | 'connected';
  qrCode: string | null;
  connectedNumber: string | null;
  connectedName: string | null;
  error: string | null;
}

export const WhatsAppModule = () => {
  const [activeTab, setActiveTab] = useState<'simulador' | 'config' | 'mensagens' | 'menu'>('config');
  const [waStatus, setWaStatus] = useState<WhatsAppStatus>({
    status: 'disconnected', qrCode: null, connectedNumber: null, connectedName: null, error: null,
  });
  const [botConfig, setBotConfig] = useState<BotConfig>({
    welcome_header: '', ask_name_message: '', attendant_message: '',
    confirmation_message: '', reminder_message: '', invalid_option_message: '', session_expired_message: '',
    end_session_message: '', name_validation_message: '', no_slots_message: '',
    cancel_no_appointments_message: '', cancel_list_message: '', cancel_success_message: '',
    reschedule_no_appointments_message: '', reschedule_list_message: '',
    no_previous_appointments_message: '', rating_question_message: '', rating_confirmation_message: '',
    promotions_message: '', instagram_message: '',
  });
  const [menuOptions, setMenuOptions] = useState<MenuOption[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const { showToast } = useToast();

  const fetchStatus = useCallback(async () => {
    try {
      const response = await api.get('/whatsapp/status');
      setWaStatus(response.data);
    } catch { /* ignore */ } finally {
      setStatusLoading(false);
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    setConfigLoading(true);
    try {
      const response = await api.get('/whatsapp/config');
      setBotConfig(response.data);
    } catch {
      showToast('Erro ao carregar configurações de mensagens', 'error');
    } finally {
      setConfigLoading(false);
    }
  }, [showToast]);

  const fetchMenuOptions = useCallback(async () => {
    setMenuLoading(true);
    try {
      const response = await api.get('/whatsapp/config/menu');
      setMenuOptions(response.data);
    } catch {
      showToast('Erro ao carregar opções do menu', 'error');
    } finally {
      setMenuLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  useEffect(() => {
    if (activeTab === 'mensagens') fetchConfig();
    if (activeTab === 'menu') fetchMenuOptions();
  }, [activeTab, fetchConfig, fetchMenuOptions]);

  const handleLogout = async () => {
    setActionLoading(true);
    try { await api.post('/whatsapp/logout'); showToast('WhatsApp desconectado', 'success'); fetchStatus(); }
    catch { showToast('Erro ao desconectar', 'error'); }
    finally { setActionLoading(false); }
  };

  const handleRestart = async () => {
    setActionLoading(true);
    try { await api.post('/whatsapp/restart'); showToast('Reconectando WhatsApp...', 'success'); fetchStatus(); }
    catch { showToast('Erro ao reconectar', 'error'); }
    finally { setActionLoading(false); }
  };

  const handleSaveConfig = async () => {
    setActionLoading(true);
    try { await api.put('/whatsapp/config', botConfig); showToast('Configurações salvas com sucesso!', 'success'); }
    catch { showToast('Erro ao salvar configurações', 'error'); }
    finally { setActionLoading(false); }
  };

  const handleResetConfig = async () => {
    if (!confirm('Tem certeza que deseja resetar todas as mensagens para o padrão?')) return;
    setActionLoading(true);
    try { const r = await api.post('/whatsapp/config/reset'); setBotConfig(r.data); showToast('Mensagens resetadas para o padrão', 'success'); }
    catch { showToast('Erro ao resetar configurações', 'error'); }
    finally { setActionLoading(false); }
  };

  // Menu CRUD handlers
  const handleMenuToggle = async (id: string, active: boolean) => {
    setActionLoading(true);
    try { const r = await api.put(`/whatsapp/config/menu/${id}`, { active }); setMenuOptions(prev => prev.map(o => o.id === id ? r.data : o)); }
    catch { showToast('Erro ao atualizar opção', 'error'); }
    finally { setActionLoading(false); }
  };

  const handleMenuUpdate = async (id: string, data: Partial<MenuOption>) => {
    setActionLoading(true);
    try { const r = await api.put(`/whatsapp/config/menu/${id}`, data); setMenuOptions(prev => prev.map(o => o.id === id ? r.data : o)); showToast('Opção atualizada', 'success'); }
    catch { showToast('Erro ao atualizar opção', 'error'); }
    finally { setActionLoading(false); }
  };

  const handleMenuDelete = async (id: string) => {
    setActionLoading(true);
    try { await api.delete(`/whatsapp/config/menu/${id}`); await fetchMenuOptions(); showToast('Opção excluída', 'success'); }
    catch { showToast('Erro ao excluir opção', 'error'); }
    finally { setActionLoading(false); }
  };

  const handleMenuCreate = async (data: { label: string; emoji: string; response_message: string }) => {
    setActionLoading(true);
    try { await api.post('/whatsapp/config/menu', data); await fetchMenuOptions(); showToast('Opção criada!', 'success'); }
    catch { showToast('Erro ao criar opção', 'error'); }
    finally { setActionLoading(false); }
  };

  const handleMenuReorder = async (ids: string[]) => {
    setActionLoading(true);
    try { const r = await api.put('/whatsapp/config/menu-reorder', { order: ids }); setMenuOptions(r.data); }
    catch { showToast('Erro ao reordenar menu', 'error'); }
    finally { setActionLoading(false); }
  };

  const handleMenuReset = async () => {
    if (!confirm('Resetar menu para as opções padrão? Opções personalizadas serão excluídas.')) return;
    setActionLoading(true);
    try { const r = await api.post('/whatsapp/config/menu/reset'); setMenuOptions(r.data); showToast('Menu resetado', 'success'); }
    catch { showToast('Erro ao resetar menu', 'error'); }
    finally { setActionLoading(false); }
  };

  const handleSimulatorMessage = async (text: string): Promise<string | null> => {
    try {
      const response = await api.post('/whatsapp/webhook', {
        phone: '5511999999999', message: text, barbershopId: 'local-test',
      });
      return response.data.botResponse || null;
    } catch {
      showToast('Erro ao enviar mensagem para o bot', 'error');
      return null;
    }
  };

  const getStatusConfig = () => {
    switch (waStatus.status) {
      case 'connected': return { icon: <CheckCircle size={20} />, label: 'Conectado', sublabel: waStatus.connectedName || waStatus.connectedNumber || '', color: 'text-green-500', bg: 'bg-green-500/10', border: 'border-green-500/20', barColor: 'bg-green-500', pulse: true };
      case 'qr': return { icon: <QrCode size={20} />, label: 'Aguardando QR Code', sublabel: 'Escaneie o código com seu WhatsApp', color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20', barColor: 'bg-amber-500', pulse: false };
      case 'connecting': return { icon: <Loader2 size={20} className="animate-spin" />, label: 'Conectando...', sublabel: 'Carregando sessão do WhatsApp', color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20', barColor: 'bg-blue-500', pulse: false };
      default: return { icon: <WifiOff size={20} />, label: 'Desconectado', sublabel: waStatus.error || 'Clique em reconectar para iniciar', color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20', barColor: 'bg-red-500', pulse: false };
    }
  };

  const statusConfig = getStatusConfig();

  const tabs = [
    { id: 'config' as const, label: 'Conexão', icon: Smartphone },
    { id: 'menu' as const, label: 'Menu', icon: List },
    { id: 'mensagens' as const, label: 'Mensagens', icon: Settings2 },
    { id: 'simulador' as const, label: 'Simulador', icon: Bot },
  ];

  return (
    <div className="space-y-8 pb-10">
      <PageHeader
        title="WhatsApp Business Bot"
        description="Automatize seus agendamentos e lembretes via WhatsApp."
        action={
          <div className="flex p-1 bg-dark-light border border-gray-800 rounded-xl">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-2 ${activeTab === t.id ? 'tab-active' : 'tab-inactive'}`}
              >
                <t.icon size={16} /> {t.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar */}
        <div className="space-y-6">
          <div className={`card border ${statusConfig.border} p-6 rounded-2xl relative overflow-hidden transition-all duration-500`}>
            <div className={`absolute top-0 right-0 w-2 h-full ${statusConfig.barColor} opacity-20`} />
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Zap size={14} className="text-primary" /> Status da Conexão
            </h3>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 ${statusConfig.bg} rounded-full flex items-center justify-center ${statusConfig.color} ${statusConfig.pulse ? 'animate-pulse' : ''}`}>
                {statusLoading ? <Loader2 size={20} className="animate-spin" /> : statusConfig.icon}
              </div>
              <div>
                <p className={`text-sm font-bold uppercase italic ${statusConfig.color}`}>
                  {statusLoading ? 'Verificando...' : statusConfig.label}
                </p>
                <p className="text-[10px] text-gray-500 font-medium">
                  {statusLoading ? '' : (statusConfig.sublabel?.length > 30 ? statusConfig.sublabel.substring(0, 30) + '...' : statusConfig.sublabel)}
                </p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              {waStatus.status === 'connected' && (
                <button onClick={handleLogout} disabled={actionLoading} className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg transition-all disabled:opacity-50">
                  {actionLoading ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />} Desconectar
                </button>
              )}
              {waStatus.status === 'disconnected' && (
                <button onClick={handleRestart} disabled={actionLoading} className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider bg-primary/10 text-primary hover:bg-primary/20 rounded-lg transition-all disabled:opacity-50">
                  {actionLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Reconectar
                </button>
              )}
            </div>
          </div>

          <div className="card p-6 rounded-2xl">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Recursos Ativos</h3>
            <ul className="space-y-4">
              {[
                { icon: ShieldCheck, text: 'Agendamento Automático (24/7)' },
                { icon: Clock, text: 'Lembretes Automáticos (2h antes)' },
                { icon: User, text: 'Captura de novos clientes' },
                { icon: Wifi, text: 'Conexão local via wwebjs' },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-3">
                  <Icon size={16} className="text-primary mt-1" />
                  <p className="text-xs text-silver leading-relaxed">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Main content */}
        <div className="lg:col-span-3">
          {activeTab === 'config' && (
            <ConnectionPanel
              waStatus={waStatus}
              statusLoading={statusLoading}
              actionLoading={actionLoading}
              onRestart={handleRestart}
            />
          )}
          {activeTab === 'menu' && (
            <MenuOptionsPanel
              options={menuOptions}
              loading={menuLoading}
              actionLoading={actionLoading}
              onToggle={handleMenuToggle}
              onUpdate={handleMenuUpdate}
              onDelete={handleMenuDelete}
              onCreate={handleMenuCreate}
              onReorder={handleMenuReorder}
              onReset={handleMenuReset}
            />
          )}
          {activeTab === 'mensagens' && (
            <MessageConfigPanel
              botConfig={botConfig}
              onChange={setBotConfig}
              configLoading={configLoading}
              actionLoading={actionLoading}
              onSave={handleSaveConfig}
              onReset={handleResetConfig}
            />
          )}
          {activeTab === 'simulador' && (
            <ChatSimulator onSendMessage={handleSimulatorMessage} />
          )}
        </div>
      </div>
    </div>
  );
};
