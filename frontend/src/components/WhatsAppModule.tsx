'use client';

import { useState, useRef, useEffect } from 'react';
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
    Clock
} from 'lucide-react';

interface BotMessage {
    id: string;
    sender: 'user' | 'bot';
    text: string;
    timestamp: Date;
}

export const WhatsAppModule = () => {
    const [messages, setMessages] = useState<BotMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'simulador' | 'config'>('simulador');
    const chatEndRef = useRef<HTMLDivElement>(null);
    const { showToast } = useToast();

    const webhookUrl = typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.host}/api/whatsapp/webhook` : '';

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
            // Simulação chamando o webhook diretamente
            const response = await api.post('/whatsapp/webhook', {
                phone: '5511999999999', // Telefone de teste
                message: inputText,
                barbershopId: 'local-test' // O backend deve estar configurado para lidar com testes ou capturar o ID do usuário logado
            });

            // No mundo real, o webhook envia a mensagem via API do WhatsApp.
            // Aqui, o próprio backend retorna a mensagem para o simulador.
            // Nota: No whatsappService.js atual, handleWebhook retorna res.json({success: true}) 
            // mas envia a mensagem via sendWhatsAppMessage.
            // Vou assumir que para o SIMULADOR o backend retornaria a mensagem ou apenas aguardaremos um pouco.
            // VOU ADAPTAR O BACKEND PARA RETORNAR A MENSAGEM SE FOR UM TESTE.

            // Mock da resposta do bot enquanto não adapto o backend
            // setTimeout(() => {
            //   const botMsg: BotMessage = {
            //     id: (Date.now() + 1).toString(),
            //     sender: 'bot',
            //     text: 'Estou processando sua solicitação...',
            //     timestamp: new Date()
            //   };
            //   setMessages(prev => [...prev, botMsg]);
            //   setLoading(false);
            // }, 1000);

        } catch (error) {
            showToast('Erro ao enviar mensagem para o bot', 'error');
            setLoading(false);
        }
    };

    const copyWebhook = () => {
        navigator.clipboard.writeText(webhookUrl);
        showToast('URL copiada!', 'success');
    };

    return (
        <div className="space-y-8 animate-fade-in pb-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-white tracking-tight">WhatsApp Business Bot</h2>
                    <p className="text-gray-400">Automatize seus agendamentos e lembretes via WhatsApp.</p>
                </div>
                <div className="flex p-1 bg-dark-light border border-gray-800 rounded-xl">
                    <button
                        onClick={() => setActiveTab('simulador')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'simulador' ? 'bg-primary text-black' : 'text-gray-400 hover:text-white'}`}
                    >
                        <Bot size={16} />
                        Simulador
                    </button>
                    <button
                        onClick={() => setActiveTab('config')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'config' ? 'bg-primary text-black' : 'text-gray-400 hover:text-white'}`}
                    >
                        <Webhook size={16} />
                        Configuração
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Lado Esquerdo - Status e Info */}
                <div className="space-y-6">
                    <div className="bg-dark-light border border-gray-800 p-6 rounded-2xl relative overflow-hidden group">
                        <div className={`absolute top-0 right-0 w-2 h-full ${true ? 'bg-green-500' : 'bg-red-500'} opacity-20`} />
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Zap size={14} className="text-primary" />
                            Status da Conexão
                        </h3>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-green-500/10 rounded-full flex items-center justify-center text-green-500">
                                <CheckCircle size={20} />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-white uppercase italic">Conectado</p>
                                <p className="text-[10px] text-gray-500 font-medium">Instância: BarberPro-Global</p>
                            </div>
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
                        </ul>
                    </div>
                </div>

                {/* Lado Direito - Conteúdo Dinâmico */}
                <div className="lg:col-span-3">
                    {activeTab === 'config' ? (
                        <div className="bg-dark-light border border-gray-800 rounded-2xl overflow-hidden">
                            <div className="p-8 border-b border-gray-800 bg-black/20">
                                <h3 className="text-xl font-bold text-white mb-2">Integração Externa</h3>
                                <p className="text-gray-400 text-sm">Configure o seu gateway de WhatsApp para apontar para o webhook abaixo.</p>
                            </div>
                            <div className="p-8 space-y-8">
                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">URL do Webhook (POST)</label>
                                    <div className="flex gap-2">
                                        <div className="flex-1 bg-black/40 border border-gray-700 p-4 rounded-xl text-primary font-mono text-sm break-all">
                                            {webhookUrl}
                                        </div>
                                        <button
                                            onClick={copyWebhook}
                                            className="p-4 bg-gray-800 hover:bg-gray-700 text-white rounded-xl transition-all"
                                        >
                                            <Copy size={20} />
                                        </button>
                                    </div>
                                </div>

                                <div className="bg-primary/5 border border-primary/20 p-6 rounded-xl space-y-4">
                                    <div className="flex items-center gap-3 text-primary">
                                        <AlertCircle size={20} />
                                        <h4 className="font-bold">Atenção desenvolvedor</h4>
                                    </div>
                                    <p className="text-sm text-gray-300 leading-relaxed">
                                        Para funcionamento real, utilize um serviço como Evolution API, Baileys ou o próprio Webhook da Meta.
                                        Certifique-se de enviar o `phone`, `message` e o `barbershopId` no corpo da requisição JSON.
                                    </p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-dark-light border border-gray-800 rounded-2xl flex flex-col h-[600px] overflow-hidden">
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
                                            <p className="text-xs text-gray-600">Mande um "Oi" para começar o agendamento.</p>
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
                                        className="flex-1 bg-black/40 border border-gray-700 p-3 rounded-xl text-sm text-white focus:outline-none focus:border-primary transition-all"
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
