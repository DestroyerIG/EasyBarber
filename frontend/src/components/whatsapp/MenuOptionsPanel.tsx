'use client';

import { useState } from 'react';
import {
  GripVertical,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Loader2,
  Save,
  RotateCcw,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';

export interface MenuOption {
  id: string;
  option_order: number;
  label: string;
  emoji: string;
  type: 'system' | 'custom';
  handler: string | null;
  response_message: string | null;
  active: boolean;
}

interface MenuOptionsPanelProps {
  options: MenuOption[];
  loading: boolean;
  actionLoading: boolean;
  onToggle: (id: string, active: boolean) => void;
  onUpdate: (id: string, data: Partial<MenuOption>) => void;
  onDelete: (id: string) => void;
  onCreate: (data: { label: string; emoji: string; response_message: string }) => void;
  onReorder: (ids: string[]) => void;
  onReset: () => void;
}

export const MenuOptionsPanel = ({
  options,
  loading,
  actionLoading,
  onToggle,
  onUpdate,
  onDelete,
  onCreate,
  onReorder,
  onReset,
}: MenuOptionsPanelProps) => {
  const [showCreate, setShowCreate] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newEmoji, setNewEmoji] = useState('');
  const [newResponse, setNewResponse] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editEmoji, setEditEmoji] = useState('');
  const [editResponse, setEditResponse] = useState('');

  const handleCreate = () => {
    if (!newLabel.trim() || !newResponse.trim()) return;
    onCreate({ label: newLabel.trim(), emoji: newEmoji.trim(), response_message: newResponse.trim() });
    setNewLabel('');
    setNewEmoji('');
    setNewResponse('');
    setShowCreate(false);
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const ids = options.map(o => o.id);
    [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
    onReorder(ids);
  };

  const handleMoveDown = (index: number) => {
    if (index === options.length - 1) return;
    const ids = options.map(o => o.id);
    [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
    onReorder(ids);
  };

  const startEdit = (opt: MenuOption) => {
    setEditingId(opt.id);
    setEditLabel(opt.label);
    setEditEmoji(opt.emoji);
    setEditResponse(opt.response_message || '');
  };

  const saveEdit = (opt: MenuOption) => {
    const updates: Partial<MenuOption> = {};
    if (editLabel !== opt.label) updates.label = editLabel;
    if (editEmoji !== opt.emoji) updates.emoji = editEmoji;
    if (opt.type === 'custom' && editResponse !== (opt.response_message || '')) {
      updates.response_message = editResponse;
    }
    if (Object.keys(updates).length > 0) onUpdate(opt.id, updates);
    setEditingId(null);
  };

  const NUMBER_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '1️⃣1️⃣', '1️⃣2️⃣', '1️⃣3️⃣', '1️⃣4️⃣', '1️⃣5️⃣'];

  return (
    <div className="card rounded-2xl overflow-hidden">
      <div className="p-8 border-b border-gray-800 bg-black/20 flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold text-white mb-2">Opções do Menu</h3>
          <p className="text-gray-400 text-sm">Configure as opções do menu principal do bot.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onReset}
            disabled={actionLoading || loading}
            className="p-3 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-xl transition-all disabled:opacity-50"
            title="Resetar menu para padrão"
          >
            <RotateCcw size={20} />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            disabled={actionLoading || loading || options.length >= 15}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            <Plus size={20} /> Nova Opção
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-20 flex flex-col items-center justify-center space-y-4">
          <Loader2 size={48} className="text-primary animate-spin" />
          <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Carregando menu...</p>
        </div>
      ) : (
        <div className="p-6 space-y-3 max-h-[600px] overflow-y-auto">
          {/* Create form */}
          {showCreate && (
            <div className="border border-primary/30 bg-primary/5 rounded-xl p-5 space-y-4 mb-4">
              <h4 className="text-sm font-bold text-white uppercase tracking-wider">Nova Opção Personalizada</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Nome da opção *</label>
                  <input
                    type="text"
                    value={newLabel}
                    onChange={e => setNewLabel(e.target.value)}
                    placeholder="Ex: Horário de funcionamento"
                    className="w-full bg-black/40 border border-gray-800 p-3 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-primary"
                    maxLength={50}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Emoji</label>
                  <input
                    type="text"
                    value={newEmoji}
                    onChange={e => setNewEmoji(e.target.value)}
                    placeholder="🕐"
                    className="w-full bg-black/40 border border-gray-800 p-3 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-primary"
                    maxLength={4}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Mensagem de resposta *</label>
                <textarea
                  value={newResponse}
                  onChange={e => setNewResponse(e.target.value)}
                  placeholder="Mensagem que o bot enviará quando o cliente escolher esta opção..."
                  rows={3}
                  className="w-full bg-black/40 border border-gray-800 p-3 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-primary resize-none"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-xs font-bold text-gray-400 hover:text-white transition-colors">
                  Cancelar
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!newLabel.trim() || !newResponse.trim() || actionLoading}
                  className="btn-primary flex items-center gap-2 text-xs disabled:opacity-50"
                >
                  <Save size={14} /> Criar
                </button>
              </div>
            </div>
          )}

          {/* Options list */}
          {options.map((opt, index) => (
            <div
              key={opt.id}
              className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${
                opt.active
                  ? 'bg-dark-light border-gray-800 hover:border-gray-700'
                  : 'bg-black/20 border-gray-900 opacity-60'
              }`}
            >
              <div className="flex flex-col gap-0.5 text-gray-600">
                <button onClick={() => handleMoveUp(index)} disabled={index === 0 || actionLoading} className="hover:text-white disabled:opacity-30 transition-colors">
                  <ChevronUp size={14} />
                </button>
                <GripVertical size={14} className="text-gray-700" />
                <button onClick={() => handleMoveDown(index)} disabled={index === options.length - 1 || actionLoading} className="hover:text-white disabled:opacity-30 transition-colors">
                  <ChevronDown size={14} />
                </button>
              </div>

              <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center text-xs font-bold text-primary">
                {NUMBER_EMOJIS[index] || index + 1}
              </div>

              {editingId === opt.id ? (
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editEmoji}
                      onChange={e => setEditEmoji(e.target.value)}
                      className="w-16 bg-black/40 border border-gray-800 p-2 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-primary"
                      maxLength={4}
                    />
                    <input
                      type="text"
                      value={editLabel}
                      onChange={e => setEditLabel(e.target.value)}
                      className="flex-1 bg-black/40 border border-gray-800 p-2 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-primary"
                      maxLength={50}
                    />
                  </div>
                  {opt.type === 'custom' && (
                    <textarea
                      value={editResponse}
                      onChange={e => setEditResponse(e.target.value)}
                      rows={2}
                      className="w-full bg-black/40 border border-gray-800 p-2 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-primary resize-none"
                    />
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => setEditingId(null)} className="text-[10px] text-gray-500 hover:text-white">Cancelar</button>
                    <button onClick={() => saveEdit(opt)} className="text-[10px] text-primary hover:text-primary/80 font-bold">Salvar</button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 cursor-pointer" onClick={() => startEdit(opt)}>
                  <p className="text-sm font-medium text-white">
                    {opt.emoji} {opt.label}
                  </p>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                    {opt.type === 'system' ? `Sistema • ${opt.handler}` : 'Personalizada'}
                    {opt.response_message && opt.type === 'custom' && (
                      <span className="ml-2 normal-case tracking-normal text-gray-600">
                        — {opt.response_message.substring(0, 50)}{opt.response_message.length > 50 ? '...' : ''}
                      </span>
                    )}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => onToggle(opt.id, !opt.active)}
                  disabled={actionLoading}
                  className={`transition-colors ${opt.active ? 'text-green-500 hover:text-green-400' : 'text-gray-600 hover:text-gray-400'}`}
                  title={opt.active ? 'Desativar' : 'Ativar'}
                >
                  {opt.active ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                </button>
                {opt.type === 'custom' && (
                  <button
                    onClick={() => { if (confirm('Excluir esta opção?')) onDelete(opt.id); }}
                    disabled={actionLoading}
                    className="text-gray-600 hover:text-red-500 transition-colors disabled:opacity-30"
                    title="Excluir"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}

          {options.length === 0 && (
            <div className="text-center py-10 text-gray-500 text-sm">
              Nenhuma opção configurada. Clique em &quot;Nova Opção&quot; ou resete para o padrão.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
