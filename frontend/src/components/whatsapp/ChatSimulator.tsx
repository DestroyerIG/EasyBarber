'use client';

import { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { MessageSquare, Send, Terminal } from 'lucide-react';

interface BotMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: Date;
}

interface ChatSimulatorProps {
  onSendMessage: (text: string) => Promise<string | null>;
}

export const ChatSimulator = ({ onSendMessage }: ChatSimulatorProps) => {
  const [messages, setMessages] = useState<BotMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const userMsg: BotMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: inputText,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setLoading(true);

    const botResponse = await onSendMessage(inputText);
    if (botResponse) {
      setMessages(prev => [
        ...prev,
        { id: (Date.now() + 1).toString(), sender: 'bot', text: botResponse, timestamp: new Date() },
      ]);
    }
    setLoading(false);
  };

  return (
    <div className="card rounded-2xl flex flex-col h-[600px] overflow-hidden">
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
        <button onClick={() => setMessages([])} className="text-xs text-gray-500 hover:text-white uppercase font-black">
          Limpar Conversa
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
            <Terminal size={48} className="text-gray-700" />
            <div>
              <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">Simulador de WhatsApp</p>
              <p className="text-xs text-gray-600">Mande um &quot;Oi&quot; para começar o agendamento.</p>
            </div>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] p-4 rounded-2xl text-sm ${
                msg.sender === 'user'
                  ? 'bg-primary text-black font-medium rounded-tr-none'
                  : 'bg-black/40 text-gray-200 border border-gray-800 rounded-tl-none'
              }`}
            >
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

      <form onSubmit={handleSubmit} className="p-4 bg-black/20 border-t border-gray-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder="Envie uma mensagem..."
            className="flex-1 bg-black/40 border border-gray-800 p-3 rounded-xl text-sm text-white focus:outline-none focus:border-primary transition-all"
          />
          <button type="submit" className="bg-primary hover:bg-orange-600 text-black p-3 rounded-xl transition-all shadow-lg shadow-primary/20">
            <Send size={20} />
          </button>
        </div>
      </form>
    </div>
  );
};
