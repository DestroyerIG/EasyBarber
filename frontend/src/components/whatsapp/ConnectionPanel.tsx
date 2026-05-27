'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle,
  Loader2,
  Smartphone,
  ShieldCheck,
  KeyRound,
  Trash2,
  Save,
  ExternalLink,
} from 'lucide-react';
import api from '@/lib/api';
import { useToast } from '@/components/Toast';

interface MetaConfig {
  configured: boolean;
  phoneNumberIdMasked: string | null;
  wabaId: string | null;
  displayNumber: string | null;
}

interface ConnectionPanelProps {
  /** Notifies the parent so the header status chip can refresh. */
  onChanged?: () => void;
}

const EMPTY_FORM = { phoneNumberId: '', accessToken: '', wabaId: '', displayNumber: '' };

export const ConnectionPanel = ({ onChanged }: ConnectionPanelProps) => {
  const { showToast } = useToast();
  const [config, setConfig] = useState<MetaConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await api.get('/whatsapp/meta/config');
      setConfig(res.data?.data ?? null);
    } catch {
      setConfig(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSave = async () => {
    if (!form.phoneNumberId.trim() || !form.accessToken.trim()) {
      showToast('Preencha o Phone Number ID e o Token de acesso', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.put('/whatsapp/meta/config', {
        phoneNumberId: form.phoneNumberId.trim(),
        accessToken: form.accessToken.trim(),
        wabaId: form.wabaId.trim() || undefined,
        displayNumber: form.displayNumber.trim() || undefined,
      });
      showToast('WhatsApp conectado via Meta!', 'success');
      setForm(EMPTY_FORM);
      setEditing(false);
      await fetchConfig();
      onChanged?.();
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { status?: number; data?: { error?: string; message?: string } };
        message?: string;
      };
      const serverMsg =
        axiosErr.response?.data?.error ||
        axiosErr.response?.data?.message ||
        (axiosErr.response?.status ? `HTTP ${axiosErr.response.status}` : axiosErr.message);
      showToast(serverMsg || 'Falha ao salvar credenciais', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setSaving(true);
    try {
      await api.delete('/whatsapp/meta/config');
      showToast('WhatsApp desconectado', 'success');
      await fetchConfig();
      onChanged?.();
    } catch {
      showToast('Falha ao desconectar', 'error');
    } finally {
      setSaving(false);
    }
  };

  const showForm = !config?.configured || editing;

  return (
    <div className="card rounded-2xl overflow-hidden">
      <div className="p-8 border-b border-gray-800 bg-black/20">
        <h3 className="text-xl font-bold text-white mb-2">Conexão WhatsApp (API Oficial Meta)</h3>
        <p className="text-gray-400 text-sm">
          Conecte o número da barbearia usando a WhatsApp Cloud API oficial da Meta.
        </p>
      </div>

      <div className="p-8">
        {loading && (
          <div className="flex flex-col items-center space-y-6 py-8">
            <Loader2 size={48} className="text-gray-600 animate-spin" />
            <p className="text-gray-500 text-sm">Carregando configuração...</p>
          </div>
        )}

        {!loading && config?.configured && !editing && (
          <div className="flex flex-col items-center space-y-6 py-8">
            <div className="w-24 h-24 bg-green-500/10 rounded-full flex items-center justify-center border-2 border-green-500/30">
              <CheckCircle size={48} className="text-green-500" />
            </div>
            <div className="text-center space-y-2">
              <h4 className="text-2xl font-bold text-white">WhatsApp Conectado!</h4>
              <p className="text-gray-400 text-sm">Bot ativo via API oficial da Meta.</p>
              {config.displayNumber && (
                <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-xl">
                  <Smartphone size={16} className="text-green-500" />
                  <span className="text-green-400 font-mono text-sm font-bold">{config.displayNumber}</span>
                </div>
              )}
              <p className="text-gray-600 text-xs font-mono mt-2">Phone Number ID: {config.phoneNumberIdMasked}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setForm(EMPTY_FORM); setEditing(true); }}
                disabled={saving}
                className="btn-secondary flex items-center gap-2 disabled:opacity-50"
              >
                <KeyRound size={18} /> Atualizar credenciais
              </button>
              <button
                onClick={handleDisconnect}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg transition-all disabled:opacity-50"
              >
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />} Desconectar
              </button>
            </div>
          </div>
        )}

        {!loading && showForm && (
          <div className="max-w-lg mx-auto space-y-5">
            <div className="flex items-start gap-3 p-4 bg-primary/5 border border-primary/20 rounded-xl">
              <ShieldCheck size={20} className="text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-gray-400 leading-relaxed">
                Pegue estes dados no <strong className="text-white">Meta for Developers</strong> → seu App →
                WhatsApp → API Setup. Cole o <strong className="text-white">Phone Number ID</strong> e um
                <strong className="text-white"> token de acesso permanente</strong> (System User).
                <a
                  href="https://developers.facebook.com/apps"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline ml-1"
                >
                  Abrir painel Meta <ExternalLink size={12} />
                </a>
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                Phone Number ID <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.phoneNumberId}
                onChange={(e) => setForm((f) => ({ ...f, phoneNumberId: e.target.value }))}
                placeholder="Ex: 123456789012345"
                className="w-full px-4 py-3 bg-black/30 border border-gray-700 rounded-xl text-white font-mono text-sm focus:border-primary focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                Token de acesso <span className="text-red-400">*</span>
              </label>
              <textarea
                value={form.accessToken}
                onChange={(e) => setForm((f) => ({ ...f, accessToken: e.target.value }))}
                placeholder="Cole aqui o token permanente do System User"
                rows={3}
                className="w-full px-4 py-3 bg-black/30 border border-gray-700 rounded-xl text-white font-mono text-xs focus:border-primary focus:outline-none resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                  WABA ID <span className="text-gray-600">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={form.wabaId}
                  onChange={(e) => setForm((f) => ({ ...f, wabaId: e.target.value }))}
                  placeholder="WhatsApp Business Account ID"
                  className="w-full px-4 py-3 bg-black/30 border border-gray-700 rounded-xl text-white font-mono text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                  Número exibido <span className="text-gray-600">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={form.displayNumber}
                  onChange={(e) => setForm((f) => ({ ...f, displayNumber: e.target.value }))}
                  placeholder="+55 83 99999-9999"
                  className="w-full px-4 py-3 bg-black/30 border border-gray-700 rounded-xl text-white text-sm focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                {saving ? 'Validando com a Meta...' : 'Salvar e conectar'}
              </button>
              {config?.configured && (
                <button
                  onClick={() => { setEditing(false); setForm(EMPTY_FORM); }}
                  disabled={saving}
                  className="btn-secondary disabled:opacity-50"
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
