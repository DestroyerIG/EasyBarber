'use client';

import { User, Phone, Edit2, TrendingUp, Calendar, Mail, Clock, MapPin, FileText } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import type { Client, Appointment } from '@/types';

function formatDate(dateString: string | null) {
  if (!dateString) return 'Nunca';
  return new Date(dateString).toLocaleDateString('pt-BR');
}

interface ClientDetailPanelProps {
  client: Client;
  history: Appointment[];
  loadingHistory: boolean;
  onEdit: () => void;
}

export function ClientDetailPanel({ client, history, loadingHistory, onEdit }: ClientDetailPanelProps) {
  return (
    <div className="card rounded-xl p-6 lg:p-8 space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center text-primary border border-primary/30">
            <User size={32} />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-white uppercase tracking-tight">{client.name}</h3>
            <p className="text-gray-400 flex items-center gap-2">
              <Phone size={14} className="text-primary" /> {client.phone}
            </p>
          </div>
        </div>
        <button
          onClick={onEdit}
          className="p-2 text-gray-400 hover:text-primary hover:bg-white/5 rounded-lg transition-all"
          aria-label="Editar Cliente"
        >
          <Edit2 size={20} />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-black/40 border border-gray-800 p-4 rounded-xl">
          <TrendingUp className="text-green-500 mb-2" size={20} />
          <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Gasto Total</p>
          <h4 className="text-xl font-bold text-white">{formatCurrency(client.total_spent)}</h4>
        </div>
        <div className="bg-black/40 border border-gray-800 p-4 rounded-xl">
          <Calendar className="text-blue-500 mb-2" size={20} />
          <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Última Visita</p>
          <h4 className="text-lg font-bold text-white">{formatDate(client.last_visit)}</h4>
        </div>
        <div className="bg-black/40 border border-gray-800 p-4 rounded-xl">
          <Mail className="text-purple-500 mb-2" size={20} />
          <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">E-mail</p>
          <h4 className="text-sm font-medium text-white truncate" title={client.email || 'Não informado'}>
            {client.email || 'Não informado'}
          </h4>
        </div>
        <div className="bg-black/40 border border-gray-800 p-4 rounded-xl">
          <Clock className="text-orange-500 mb-2" size={20} />
          <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Cliente desde</p>
          <h4 className="text-lg font-bold text-white">{formatDate(client.created_at)}</h4>
        </div>
      </div>

      {/* Info Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b border-gray-800 pb-2">
          <FileText className="text-primary" size={20} />
          <h4 className="font-bold text-white uppercase tracking-widest text-sm">Informações de Cadastro</h4>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <MapPin className="text-gray-500 mt-1" size={18} />
              <div>
                <p className="text-gray-500 font-bold uppercase text-[10px] tracking-widest">Endereço</p>
                <p className="text-gray-300">{client.address || 'Não cadastrado'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Calendar className="text-gray-500 mt-1" size={18} />
              <div>
                <p className="text-gray-500 font-bold uppercase text-[10px] tracking-widest">Nascimento</p>
                <p className="text-gray-300">{client.birth_date ? new Date(client.birth_date).toLocaleDateString('pt-BR') : 'Não informado'}</p>
              </div>
            </div>
          </div>
          <div className="bg-black/20 border border-gray-800 p-4 rounded-xl">
            <p className="text-gray-500 font-bold uppercase text-[10px] tracking-widest mb-2">Notas / Observações</p>
            <p className="text-gray-300 italic">{client.notes || 'Nenhuma observação adicionada.'}</p>
          </div>
        </div>
      </div>

      {/* History */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b border-gray-800 pb-2">
          <Clock className="text-primary" size={20} />
          <h4 className="font-bold text-white uppercase tracking-widest text-sm">Histórico de Atendimento</h4>
        </div>
        <div className="bg-black/40 border border-gray-800 rounded-xl overflow-hidden">
          {loadingHistory ? (
            <div className="p-8 text-center text-gray-500">Buscando histórico...</div>
          ) : history.length === 0 ? (
            <div className="p-8 text-center text-gray-500">Nenhum atendimento anterior encontrado.</div>
          ) : (
            <table className="w-full text-left">
              <thead className="bg-dark-light/50 text-gray-400 text-xs uppercase tracking-widest">
                <tr>
                  <th className="px-6 py-4 font-bold border-b border-gray-800">Data</th>
                  <th className="px-6 py-4 font-bold border-b border-gray-800">Barbeiro</th>
                  <th className="px-6 py-4 font-bold border-b border-gray-800">Serviço</th>
                  <th className="px-6 py-4 font-bold border-b border-gray-800 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 text-sm">
                {history.map((item: any) => (
                  <tr key={item.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 text-white font-medium">{formatDate(item.date)}</td>
                    <td className="px-6 py-4">
                      <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold border border-primary/20">
                        {item.barber_name}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-300">{item.service_name}</td>
                    <td className="px-6 py-4 text-right text-white font-bold">{formatCurrency(item.service_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
