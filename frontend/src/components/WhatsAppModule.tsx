'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { useToast } from './Toast';
import { useAuth } from '@/contexts/AuthContext';
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
  AlertTriangle,
  LogOut,
  RefreshCw,
  List,
} from 'lucide-react';

interface WhatsAppStatus {
  status:
    | 'provider_unavailable'
    | 'instance_not_found'
    | 'disconnected'
    | 'pairing'
    | 'connected'
    | 'error'
    | 'unavailable';
  qrCode: string | null;
  connectedNumber: string | null;
  connectedName: string | null;
  error: string | null;
  provider?: string;
}

const SUPPORTED_STATUS = [
  'provider_unavailable',
  'instance_not_found',
  'disconnected',
  'pairing',
  'connected',
  'error',
] as const;

const asObjectPayload = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
};

const normalizeStatusValue = (value: unknown): WhatsAppStatus['status'] => {
  const normalized = String(value || '').trim().toLowerCase();

  if (normalized === 'unavailable') {
    return 'provider_unavailable';
  }

  if (SUPPORTED_STATUS.includes(normalized as (typeof SUPPORTED_STATUS)[number])) {
    return normalized as WhatsAppStatus['status'];
  }

  return 'disconnected';
};

const normalizeStatusPayload = (value: unknown): WhatsAppStatus => {
  const payload = asObjectPayload(value);

  return {
    status: normalizeStatusValue(payload.status),
    qrCode: typeof payload.qrCode === 'string' && payload.qrCode.trim() ? payload.qrCode : null,
    connectedNumber:
      typeof payload.connectedNumber === 'string' && payload.connectedNumber.trim()
        ? payload.connectedNumber
        : null,
    connectedName:
      typeof payload.connectedName === 'string' && payload.connectedName.trim()
        ? payload.connectedName
        : null,
    error: typeof payload.error === 'string' && payload.error.trim() ? payload.error : null,
    provider: typeof payload.provider === 'string' && payload.provider.trim() ? payload.provider : undefined,
  };
};

const DEFAULT_WA_STATUS: WhatsAppStatus = {
  status: 'disconnected',
  qrCode: null,
  connectedNumber: null,
  connectedName: null,
  error: null,
};

export const WhatsAppModule = () => {
  const [activeTab, setActiveTab] = useState<'simulador' | 'config' | 'mensagens' | 'menu'>('config');
  const [waStatus, setWaStatus] = useState<WhatsAppStatus>(DEFAULT_WA_STATUS);
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
  const { user } = useAuth();

  const fetchStatus = useCallback(async () => {
    try {
      const response = await api.get('/whatsapp/status');
      const mergedStatus: WhatsAppStatus = {
        ...DEFAULT_WA_STATUS,
        ...normalizeStatusPayload(response.data),
      };

      if (mergedStatus.status === 'pairing' && !mergedStatus.qrCode) {
        try {
          const qrResponse = await api.get('/whatsapp/qrcode');
          const qrNormalized = normalizeStatusPayload(qrResponse.data);
          const qrPayload = asObjectPayload(qrResponse.data);

          mergedStatus.qrCode = qrNormalized.qrCode;
          if (qrPayload.status !== undefined) {
            mergedStatus.status = qrNormalized.status;
          }
        } catch {
          // manter fallback do status principal
        }
      }

      setWaStatus(mergedStatus);
    } catch {
      setWaStatus({
        ...DEFAULT_WA_STATUS,
        status: 'provider_unavailable',
        error: 'Nao foi possivel consultar a Evolution API no momento.',
      });
    } finally {
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

  // Status polling com backoff exponencial para evitar flood quando API cai
  useEffect(() => {
    const intervalMs = 3000;
    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = () => {
      fetchStatus();
      timeoutId = setTimeout(poll, intervalMs);
    };

    timeoutId = setTimeout(poll, 0);
    return () => clearTimeout(timeoutId);
  }, [fetchStatus]);

  useEffect(() => {
    if (activeTab === 'mensagens') fetchConfig();
    if (activeTab === 'menu') fetchMenuOptions();
  }, [activeTab, fetchConfig, fetchMenuOptions]);

  const handleDisconnect = async () => {
    setActionLoading(true);
    try { await api.post('/whatsapp/disconnect'); showToast('WhatsApp desconectado', 'success'); fetchStatus(); }
    catch { showToast('Erro ao desconectar', 'error'); }
    finally { setActionLoading(false); }
  };

  const handleConnect = async () => {
    setActionLoading(true);
    try {
      const initializeMode = waStatus.status === 'instance_not_found';
      const endpoint = initializeMode ? '/whatsapp/initialize' : '/whatsapp/connect';
      await api.post(endpoint);
      showToast(
        initializeMode
          ? 'Inicializacao da instancia solicitada. Aguardando status...'
          : 'Conexao iniciada. Aguardando status...',
        'success'
      );
      fetchStatus();
    }
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
    const barbershopId =
      typeof user?.barbershopId === 'string' && user.barbershopId.trim()
        ? user.barbershopId.trim()
        : null;

    if (!barbershopId) {
      showToast(
        'Nao foi possivel identificar a barbearia autenticada para o simulador. Faca login novamente.',
        'error'
      );
      return null;
    }

    try {
      const response = await api.post('/whatsapp/simulator/message', {
        text,
        phone: '5511999999999',
        pushName: 'Simulador',
        barbershopId,
      });

      return response.data?.lastBotResponse || null;
    } catch (error) {
      const apiError = error as {
        response?: {
          data?: {
            error?: { message?: string } | string;
            message?: string;
          };
        };
      };

      const rawError = apiError.response?.data?.error;
      const backendMessage =
        typeof rawError === 'object'
          ? rawError?.message
          : typeof rawError === 'string'
            ? rawError
            : apiError.response?.data?.message;

      showToast(backendMessage || 'Erro ao enviar mensagem para o bot', 'error');
      return null;
    }
  };

  const getStatusConfig = () => {
    switch (waStatus.status) {
      case 'connected': return { icon: <CheckCircle size={20} />, label: 'Conectado', sublabel: waStatus.connectedName || waStatus.connectedNumber || '', color: 'text-green-500', bg: 'bg-green-500/10', border: 'border-green-500/20', barColor: 'bg-green-500', pulse: true };
      case 'pairing': return { icon: <QrCode size={20} />, label: 'Aguardando pareamento', sublabel: 'Escaneie o QR Code no WhatsApp', color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20', barColor: 'bg-amber-500', pulse: false };
      case 'instance_not_found': return { icon: <AlertTriangle size={20} />, label: 'Instancia inexistente', sublabel: waStatus.error || 'A instancia configurada nao existe na Evolution', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', barColor: 'bg-yellow-500', pulse: false };
      case 'provider_unavailable':
      case 'unavailable': return { icon: <WifiOff size={20} />, label: 'API indisponivel', sublabel: waStatus.error || 'Evolution API fora do ar', color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/20', barColor: 'bg-slate-500', pulse: false };
      case 'error': return { icon: <AlertTriangle size={20} />, label: 'Erro', sublabel: waStatus.error || 'Falha inesperada no provider', color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/20', barColor: 'bg-orange-500', pulse: false };
      default: return { icon: <WifiOff size={20} />, label: 'Desconectado', sublabel: waStatus.error || 'Clique em conectar para iniciar', color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20', barColor: 'bg-red-500', pulse: false };
    }
  };

  const statusConfig = getStatusConfig();
  const connectButtonLabel = waStatus.status === 'instance_not_found'
    ? 'Criar/Recriar'
    : waStatus.status === 'provider_unavailable' || waStatus.status === 'unavailable'
      ? 'Tentar Novamente'
      : 'Conectar';

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
                <button onClick={handleDisconnect} disabled={actionLoading} className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg transition-all disabled:opacity-50">
                  {actionLoading ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />} Desconectar
                </button>
              )}
              {(
                waStatus.status === 'disconnected' ||
                waStatus.status === 'error' ||
                waStatus.status === 'pairing' ||
                waStatus.status === 'instance_not_found' ||
                waStatus.status === 'provider_unavailable' ||
                waStatus.status === 'unavailable'
              ) && (
                <button onClick={handleConnect} disabled={actionLoading} className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider bg-primary/10 text-primary hover:bg-primary/20 rounded-lg transition-all disabled:opacity-50">
                  {actionLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} {connectButtonLabel}
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
                { icon: Wifi, text: 'Conexao via Evolution API externa' },
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
              onConnect={handleConnect}
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
