'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import api from '@/lib/api';
import { useToast } from './Toast';
import {
    Webhook,
    MessageSquare,
    Send,
    Bot,
    CheckCircle,
    AlertCircle,
    Copy,
    Terminal,
    User,
    ShieldCheck,
    Zap,
    Clock,
    XCircle,
    RefreshCw,
    LogOut,
    Loader2,
    Smartphone,
    QrCode,
    Wifi,
    WifiOff,
    Settings2,
    Save,
    RotateCcw
} from 'lucide-react';

interface BotMessage {
    id: string;
    sender: 'user' | 'bot';
    text: string;
    timestamp: Date;
}

interface WhatsAppStatus {
    status: 'disconnected' | 'qr' | 'connecting' | 'connected';
    qrCode: string | null;
    connectedNumber: string | null;
    connectedName: string | null;
    error: string | null;
}

interface BotConfig {
    welcome_message: string;
    ask_name_message: string;
    attendant_message: string;
    confirmation_message: string;
    reminder_message: string;
    invalid_option_message: string;
    session_expired_message: string;
}

export const WhatsAppModule = () => {
    const [messages, setMessages] = useState<BotMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'simulador' | 'config' | 'mensagens'>('config');
    const [waStatus, setWaStatus] = useState<WhatsAppStatus>({
        status: 'disconnected',
        qrCode: null,
        connectedNumber: null,
        connectedName: null,
        error: null
    });
    const [botConfig, setBotConfig] = useState<BotConfig>({
        welcome_message: '',
        ask_name_message: '',
        attendant_message: '',
        confirmation_message: '',
        reminder_message: '',
        invalid_option_message: '',
        session_expired_message: ''
    });
    const [configLoading, setConfigLoading] = useState(false);
    const [statusLoading, setStatusLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const { showToast } = useToast();

    // Polling do status do WhatsApp
    const fetchStatus = useCallback(async () => {
        try {
            const response = await api.get('/whatsapp/status');
            setWaStatus(response.data);
            setStatusLoading(false);
        } catch (error) {
            setStatusLoading(false);
        }
    }, []);

    // Buscar configuração de mensagens
    const fetchConfig = useCallback(async () => {
        setConfigLoading(true);
        try {
            const response = await api.get('/whatsapp/config');
            setBotConfig(response.data);
        } catch (error) {
            showToast('Erro ao carregar configurações de mensagens', 'error');
        } finally {
            setConfigLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 3000);
        return () => clearInterval(interval);
    }, [fetchStatus]);

    useEffect(() => {
        if (activeTab === 'mensagens') {
            fetchConfig();
        }
    }, [activeTab, fetchConfig]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputText.trim()) return;

        const userMsg: BotMessage = {
            id: Date.now().toString(),
            sender: 'user',
            text: inputText,
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMsg]);
        setInputText('');
        setLoading(true);

        try {
            const response = await api.post('/whatsapp/webhook', {
                phone: '5511999999999',
                message: inputText,
                barbershopId: 'local-test'
            });

            if (response.data.botResponse) {
                const botMsg: BotMessage = {
                    id: (Date.now() + 1).toString(),
                    sender: 'bot',
                    text: response.data.botResponse,
                    timestamp: new Date()
                };
                setMessages(prev => [...prev, botMsg]);
            }
            setLoading(false);
        } catch (error) {
            showToast('Erro ao enviar mensagem para o bot', 'error');
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        setActionLoading(true);
        try {
            await api.post('/whatsapp/logout');
            showToast('WhatsApp desconectado', 'success');
            fetchStatus();
        } catch (error) {
            showToast('Erro ao desconectar', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleRestart = async () => {
        setActionLoading(true);
        try {
            await api.post('/whatsapp/restart');
            showToast('Reconectando WhatsApp...', 'success');
            fetchStatus();
        } catch (error) {
            showToast('Erro ao reconectar', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleSaveConfig = async () => {
        setActionLoading(true);
        try {
            await api.put('/whatsapp/config', botConfig);
            showToast('Configurações salvas com sucesso!', 'success');
        } catch (error) {
            showToast('Erro ao salvar configurações', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleResetConfig = async () => {
        if (!confirm('Tem certeza que deseja resetar todas as mensagens para o padrão?')) return;

        setActionLoading(true);
        try {
            const response = await api.post('/whatsapp/config/reset');
            setBotConfig(response.data);
            showToast('Mensagens resetadas para o padrão', 'success');
        } catch (error) {
            showToast('Erro ao resetar configurações', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const getStatusConfig = () => {
        switch (waStatus.status) {
            case 'connected':
                return {
                    icon: <CheckCircle size={20} />,
                    label: 'Conectado',
                    sublabel: waStatus.connectedName || waStatus.connectedNumber || '',
                    color: 'text-green-500',
                    bg: 'bg-green-500/10',
                    border: 'border-green-500/20',
                    barColor: 'bg-green-500',
                    pulse: true
                };
            case 'qr':
                return {
                    icon: <QrCode size={20} />,
                    label: 'Aguardando QR Code',
                    sublabel: 'Escaneie o código com seu WhatsApp',
                    color: 'text-amber-500',
                    bg: 'bg-amber-500/10',
                    border: 'border-amber-500/20',
                    barColor: 'bg-amber-500',
                    pulse: false
                };
            case 'connecting':
                return {
                    icon: <Loader2 size={20} className="animate-spin" />,
                    label: 'Conectando...',
                    sublabel: 'Carregando sessão do WhatsApp',
                    color: 'text-blue-500',
                    bg: 'bg-blue-500/10',
                    border: 'border-blue-500/20',
                    barColor: 'bg-blue-500',
                    pulse: false
                };
            default:
                return {
                    icon: <WifiOff size={20} />,
                    label: 'Desconectado',
                    sublabel: waStatus.error || 'Clique em reconectar para iniciar',
                    color: 'text-red-500',
                    bg: 'bg-red-500/10',
                    border: 'border-red-500/20',
                    barColor: 'bg-red-500',
                    pulse: false
                };
        }
    };

    const statusConfig = getStatusConfig();

    return (
        <div className="space-y-8 animate-fade-in pb-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-white tracking-tight">WhatsApp Business Bot</h2>
                    <p className="text-gray-400">Automatize seus agendamentos e lembretes via WhatsApp.</p>
                </div>
                <div className="flex p-1 bg-dark-light border border-gray-800 rounded-xl">
                    <button
                        onClick={() => setActiveTab('config')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'config' ? 'bg-primary text-black' : 'text-gray-400 hover:text-white'}`}
                    >
                        <Smartphone size={16} />
                        Conexão
                    </button>
                    <button
                        onClick={() => setActiveTab('mensagens')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'mensagens' ? 'bg-primary text-black' : 'text-gray-400 hover:text-white'}`}
                    >
                        <Settings2 size={16} />
                        Mensagens
                    </button>
                    <button
                        onClick={() => setActiveTab('simulador')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'simulador' ? 'bg-primary text-black' : 'text-gray-400 hover:text-white'}`}
                    >
                        <Bot size={16} />
                        Simulador
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Lado Esquerdo - Status e Info */}
                <div className="space-y-6">
                    <div className={`bg-dark-light border ${statusConfig.border} p-6 rounded-2xl relative overflow-hidden group transition-all duration-500`}>
                        <div className={`absolute top-0 right-0 w-2 h-full ${statusConfig.barColor} opacity-20`} />
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Zap size={14} className="text-primary" />
                            Status da Conexão
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

                        {/* Ações */}
                        <div className="mt-4 flex gap-2">
                            {waStatus.status === 'connected' && (
                                <button
                                    onClick={handleLogout}
                                    disabled={actionLoading}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg transition-all disabled:opacity-50"
                                >
                                    {actionLoading ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />}
                                    Desconectar
                                </button>
                            )}
                            {waStatus.status === 'disconnected' && (
                                <button
                                    onClick={handleRestart}
                                    disabled={actionLoading}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider bg-primary/10 text-primary hover:bg-primary/20 rounded-lg transition-all disabled:opacity-50"
                                >
                                    {actionLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                                    Reconectar
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="bg-dark-light border border-gray-800 p-6 rounded-2xl">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Recursos Ativos</h3>
                        <ul className="space-y-4">
                            <li className="flex items-start gap-3">
                                <ShieldCheck size={16} className="text-primary mt-1" />
                                <p className="text-xs text-silver leading-relaxed">Agendamento Automático (24/7)</p>
                            </li>
                            <li className="flex items-start gap-3">
                                <Clock size={16} className="text-primary mt-1" />
                                <p className="text-xs text-silver leading-relaxed">Lembretes Automáticos (2h antes)</p>
                            </li>
                            <li className="flex items-start gap-3">
                                <User size={16} className="text-primary mt-1" />
                                <p className="text-xs text-silver leading-relaxed">Captura de novos clientes</p>
                            </li>
                            <li className="flex items-start gap-3">
                                <Wifi size={16} className="text-primary mt-1" />
                                <p className="text-xs text-silver leading-relaxed">Conexão local via wwebjs</p>
                            </li>
                        </ul>
                    </div>
                </div>

                {/* Lado Direito - Conteúdo Dinâmico */}
                <div className="lg:col-span-3">
                    {activeTab === 'config' && (
                        <div className="bg-dark-light border border-gray-800 rounded-2xl overflow-hidden animate-fade-in">
                            <div className="p-8 border-b border-gray-800 bg-black/20">
                                <h3 className="text-xl font-bold text-white mb-2">Conexão WhatsApp</h3>
                                <p className="text-gray-400 text-sm">Conecte-se ao WhatsApp escaneando o QR Code abaixo com seu celular.</p>
                            </div>
                            <div className="p-8">
                                {/* QR Code Display */}
                                {waStatus.status === 'qr' && waStatus.qrCode && (
                                    <div className="flex flex-col items-center space-y-6">
                                        <div className="relative p-6 bg-white rounded-2xl shadow-2xl shadow-primary/10 transition-all duration-500 scale-100 hover:scale-105">
                                            <img
                                                src={waStatus.qrCode}
                                                alt="QR Code WhatsApp"
                                                className="w-[280px] h-[280px]"
                                                style={{ imageRendering: 'pixelated' }}
                                            />
                                            <div className="absolute -top-3 -right-3 w-10 h-10 bg-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/30">
                                                <QrCode size={20} className="text-black" />
                                            </div>
                                        </div>

                                        <div className="text-center space-y-2 max-w-sm">
                                            <div className="flex items-center justify-center gap-2 text-amber-400">
                                                <Smartphone size={18} />
                                                <p className="text-sm font-bold uppercase tracking-wider">Escaneie o QR Code</p>
                                            </div>
                                            <ol className="text-xs text-gray-400 space-y-1 text-left list-decimal list-inside">
                                                <li>Abra o <strong className="text-white">WhatsApp</strong> no celular</li>
                                                <li>Toque em <strong className="text-white">Aparelhos conectados</strong></li>
                                                <li>Toque em <strong className="text-white">Conectar um aparelho</strong></li>
                                                <li>Aponte a câmera para o QR Code acima</li>
                                            </ol>
                                        </div>
                                    </div>
                                )}

                                {/* Conectado */}
                                {waStatus.status === 'connected' && (
                                    <div className="flex flex-col items-center space-y-6 py-8">
                                        <div className="w-24 h-24 bg-green-500/10 rounded-full flex items-center justify-center border-2 border-green-500/30 animate-pulse">
                                            <CheckCircle size={48} className="text-green-500" />
                                        </div>
                                        <div className="text-center space-y-2">
                                            <h4 className="text-2xl font-bold text-white">WhatsApp Conectado!</h4>
                                            <p className="text-gray-400 text-sm">O bot está ativo e pronto para receber mensagens.</p>
                                            {waStatus.connectedNumber && (
                                                <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-xl">
                                                    <Smartphone size={16} className="text-green-500" />
                                                    <span className="text-green-400 font-mono text-sm font-bold">
                                                        +{waStatus.connectedNumber}
                                                    </span>
                                                    {waStatus.connectedName && (
                                                        <span className="text-gray-500 text-xs ml-1">
                                                            ({waStatus.connectedName})
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Conectando */}
                                {waStatus.status === 'connecting' && (
                                    <div className="flex flex-col items-center space-y-6 py-8">
                                        <div className="w-24 h-24 bg-blue-500/10 rounded-full flex items-center justify-center border-2 border-blue-500/30">
                                            <Loader2 size={48} className="text-blue-500 animate-spin" />
                                        </div>
                                        <div className="text-center space-y-2">
                                            <h4 className="text-xl font-bold text-white">Conectando...</h4>
                                            <p className="text-gray-400 text-sm">Carregando a sessão do WhatsApp. Aguarde um momento.</p>
                                        </div>
                                    </div>
                                )}

                                {/* Desconectado */}
                                {waStatus.status === 'disconnected' && (
                                    <div className="flex flex-col items-center space-y-6 py-8">
                                        <div className="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center border-2 border-red-500/30">
                                            <WifiOff size={48} className="text-red-500" />
                                        </div>
                                        <div className="text-center space-y-2">
                                            <h4 className="text-xl font-bold text-white">WhatsApp Desconectado</h4>
                                            <p className="text-gray-400 text-sm">Clique no botão abaixo para iniciar a conexão.</p>
                                            <button
                                                onClick={handleRestart}
                                                disabled={actionLoading}
                                                className="mt-4 flex items-center gap-2 px-6 py-3 bg-primary hover:bg-orange-600 text-black font-bold rounded-xl transition-all shadow-lg shadow-primary/20 mx-auto disabled:opacity-50"
                                            >
                                                {actionLoading ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                                                Conectar WhatsApp
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Status Loading */}
                                {statusLoading && waStatus.status === 'disconnected' && (
                                    <div className="flex flex-col items-center space-y-6 py-8">
                                        <Loader2 size={48} className="text-gray-600 animate-spin" />
                                        <p className="text-gray-500 text-sm">Verificando status do WhatsApp...</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'mensagens' && (
                        <div className="bg-dark-light border border-gray-800 rounded-2xl overflow-hidden animate-fade-in">
                            <div className="p-8 border-b border-gray-800 bg-black/20 flex justify-between items-center">
                                <div>
                                    <h3 className="text-xl font-bold text-white mb-2">Personalizar Mensagens</h3>
                                    <p className="text-gray-400 text-sm">Defina como o bot deve falar com seus clientes.</p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleResetConfig}
                                        disabled={actionLoading || configLoading}
                                        className="p-3 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-xl transition-all disabled:opacity-50"
                                        title="Resetar para o padrão"
                                    >
                                        <RotateCcw size={20} />
                                    </button>
                                    <button
                                        onClick={handleSaveConfig}
                                        disabled={actionLoading || configLoading}
                                        className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-orange-600 text-black font-bold rounded-xl transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
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
                                <div className="p-8 space-y-8 max-h-[600px] overflow-y-auto custom-scrollbar">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                                <MessageSquare size={14} className="text-primary" />
                                                Mensagem de Boas-vindas
                                            </label>
                                            <textarea
                                                value={botConfig.welcome_message || ''}
                                                onChange={(e) => setBotConfig({ ...botConfig, welcome_message: e.target.value })}
                                                rows={6}
                                                placeholder="Olá! Bem-vindo à {nome_barbearia}..."
                                                className="w-full bg-black/40 border border-gray-800 p-4 rounded-xl text-sm text-gray-300 focus:outline-none focus:border-primary transition-all resize-none"
                                            />
                                            <p className="text-[10px] text-gray-600 italic">Disponível: {'{nome_barbearia}'}</p>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                                <User size={14} className="text-primary" />
                                                Pergunta de Nome (Novo Cliente)
                                            </label>
                                            <textarea
                                                value={botConfig.ask_name_message || ''}
                                                onChange={(e) => setBotConfig({ ...botConfig, ask_name_message: e.target.value })}
                                                rows={6}
                                                className="w-full bg-black/40 border border-gray-800 p-4 rounded-xl text-sm text-gray-300 focus:outline-none focus:border-primary transition-all resize-none"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                                <CheckCircle size={14} className="text-primary" />
                                                Confirmação de Agendamento
                                            </label>
                                            <textarea
                                                value={botConfig.confirmation_message || ''}
                                                onChange={(e) => setBotConfig({ ...botConfig, confirmation_message: e.target.value })}
                                                rows={6}
                                                className="w-full bg-black/40 border border-gray-800 p-4 rounded-xl text-sm text-gray-300 focus:outline-none focus:border-primary transition-all resize-none"
                                            />
                                            <p className="text-[10px] text-gray-600 italic">Disponível: {'{servico}, {barbeiro}, {data}, {horario}, {valor}'}</p>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                                <Clock size={14} className="text-primary" />
                                                Mensagem de Lembrete (2h antes)
                                            </label>
                                            <textarea
                                                value={botConfig.reminder_message || ''}
                                                onChange={(e) => setBotConfig({ ...botConfig, reminder_message: e.target.value })}
                                                rows={6}
                                                className="w-full bg-black/40 border border-gray-800 p-4 rounded-xl text-sm text-gray-300 focus:outline-none focus:border-primary transition-all resize-none"
                                            />
                                            <p className="text-[10px] text-gray-600 italic">Disponível: {'{nome_cliente}, {servico}, {barbeiro}, {horario}'}</p>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                                <AlertCircle size={14} className="text-primary" />
                                                Opção Inválida / Erro
                                            </label>
                                            <textarea
                                                value={botConfig.invalid_option_message || ''}
                                                onChange={(e) => setBotConfig({ ...botConfig, invalid_option_message: e.target.value })}
                                                rows={4}
                                                className="w-full bg-black/40 border border-gray-800 p-4 rounded-xl text-sm text-gray-300 focus:outline-none focus:border-primary transition-all resize-none"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                                <LogOut size={14} className="text-primary" />
                                                Sessão Expirada
                                            </label>
                                            <textarea
                                                value={botConfig.session_expired_message || ''}
                                                onChange={(e) => setBotConfig({ ...botConfig, session_expired_message: e.target.value })}
                                                rows={4}
                                                className="w-full bg-black/40 border border-gray-800 p-4 rounded-xl text-sm text-gray-300 focus:outline-none focus:border-primary transition-all resize-none"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'simulador' && (
                        <div className="bg-dark-light border border-gray-800 rounded-2xl flex flex-col h-[600px] overflow-hidden animate-fade-in">
                            <div className="p-4 border-b border-gray-800 bg-black/40 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center text-primary">
                                        <MessageSquare size={20} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-white text-sm">Teste o Bot</h3>
                                        <p className="text-[10px] text-green-500 font-bold uppercase tracking-tighter">BarberBot Online</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setMessages([])}
                                    className="text-xs text-gray-500 hover:text-white uppercase font-black"
                                >
                                    Limpar Conversa
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                                {messages.length === 0 && (
                                    <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
                                        <Terminal size={48} className="text-gray-700" />
                                        <div>
                                            <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">Simulador de WhatsApp</p>
                                            <p className="text-xs text-gray-600">Mande um &quot;Oi&quot; para começar o agendamento.</p>
                                        </div>
                                    </div>
                                )}
                                {messages.map((msg) => (
                                    <div
                                        key={msg.id}
                                        className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div className={`max-w-[80%] p-4 rounded-2xl text-sm ${msg.sender === 'user'
                                            ? 'bg-primary text-black font-medium rounded-tr-none'
                                            : 'bg-black/40 text-gray-200 border border-gray-800 rounded-tl-none'
                                            }`}>
                                            <p className="whitespace-pre-wrap">{msg.text}</p>
                                            <p className={`text-[10px] mt-2 opacity-60 ${msg.sender === 'user' ? 'text-black' : 'text-gray-500'}`}>
                                                {format(msg.timestamp, 'HH:mm')}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                                {loading && (
                                    <div className="flex justify-start">
                                        <div className="bg-black/40 p-4 rounded-2xl rounded-tl-none border border-gray-800">
                                            <div className="flex gap-1">
                                                <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" />
                                                <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                                                <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <div ref={chatEndRef} />
                            </div>

                            <form onSubmit={handleSendMessage} className="p-4 bg-black/20 border-t border-gray-800">
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={inputText}
                                        onChange={(e) => setInputText(e.target.value)}
                                        placeholder="Envie uma mensagem..."
                                        className="flex-1 bg-black/40 border border-gray-800 p-3 rounded-xl text-sm text-white focus:outline-none focus:border-primary transition-all"
                                    />
                                    <button
                                        type="submit"
                                        className="bg-primary hover:bg-orange-600 text-black p-3 rounded-xl transition-all shadow-lg shadow-primary/20"
                                    >
                                        <Send size={20} />
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
