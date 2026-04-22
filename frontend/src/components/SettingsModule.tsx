'use client';

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { BellRing, Clock3, Link2, RotateCcw, Save, Store } from 'lucide-react';
import { PageHeader } from '@/components/ui';
import { useToast } from '@/components/Toast';
import api from '@/lib/api';
import { getApiErrorMessage } from '@/utils/handleApiError';

const SETTINGS_STORAGE_KEY = 'easybarber.settings.v1';

interface SettingsModuleProps {
  initialBarbershopName: string;
}

interface SettingsState {
  shopName: string;
  whatsappInstanceName: string;
  contactPhone: string;
  address: string;
  openingTime: string;
  closingTime: string;
  slotIntervalMinutes: number;
  allowWalkins: boolean;
  autoConfirmAppointments: boolean;
  emailReminders: boolean;
  whatsappReminders: boolean;
  googleCalendarEnabled: boolean;
  customWebhookUrl: string;
}

const buildDefaultSettings = (barbershopName: string): SettingsState => ({
  shopName: barbershopName || 'Minha Barbearia',
  whatsappInstanceName: '',
  contactPhone: '',
  address: '',
  openingTime: '09:00',
  closingTime: '20:00',
  slotIntervalMinutes: 30,
  allowWalkins: true,
  autoConfirmAppointments: false,
  emailReminders: true,
  whatsappReminders: true,
  googleCalendarEnabled: false,
  customWebhookUrl: '',
});

const shouldUseLocalFallback = (error: unknown) => {
  if (!axios.isAxiosError(error)) {
    return true;
  }

  const status = error.response?.status;
  if (!status) {
    return true;
  }

  if (status === 404) {
    return true;
  }

  return status >= 500;
};

export function SettingsModule({ initialBarbershopName }: SettingsModuleProps) {
  const defaults = useMemo(() => buildDefaultSettings(initialBarbershopName), [initialBarbershopName]);
  const [settings, setSettings] = useState<SettingsState>(defaults);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [usingLocalFallback, setUsingLocalFallback] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    const loadSettings = async () => {
      setLoading(true);

      try {
        const response = await api.get('/barbershop/settings');
        const remoteSettings = response.data as Partial<SettingsState>;
        setSettings({
          ...defaults,
          ...remoteSettings,
        });

        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
          ...defaults,
          ...remoteSettings,
        }));
        setUsingLocalFallback(false);
      } catch (error: unknown) {
        if (!shouldUseLocalFallback(error)) {
          setSettings(defaults);
          setUsingLocalFallback(false);
          showToast(getApiErrorMessage(error, 'Não foi possível carregar as configurações.'), 'error');
          return;
        }

        try {
          const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
          if (!raw) {
            setSettings(defaults);
          } else {
            const parsed = JSON.parse(raw) as Partial<SettingsState>;
            setSettings({
              ...defaults,
              ...parsed,
            });
          }
          setUsingLocalFallback(true);
        } catch {
          setSettings(defaults);
          setUsingLocalFallback(true);
        }
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [defaults, showToast]);

  const updateField = <K extends keyof SettingsState>(field: K, value: SettingsState[K]) => {
    setSettings(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const saveSettings = async () => {
    setSaving(true);

    try {
      const response = await api.put('/barbershop/settings', settings);
      const persisted = response.data as Partial<SettingsState>;
      const mergedSettings = {
        ...settings,
        ...persisted,
      };

      setSettings(mergedSettings);

      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(mergedSettings));
      setUsingLocalFallback(false);
      showToast('Configurações salvas com sucesso.', 'success');
    } catch (error: unknown) {
      if (shouldUseLocalFallback(error)) {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
        const message = getApiErrorMessage(error, 'Não foi possível salvar no servidor. Dados salvos localmente neste navegador.');
        setUsingLocalFallback(true);
        showToast(message, 'error');
      } else {
        setUsingLocalFallback(false);
        showToast(getApiErrorMessage(error, 'Não foi possível salvar as configurações.'), 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const resetSettings = () => {
    setSettings(defaults);
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
    showToast('Configurações restauradas para o padrão.', 'info');
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Configurações"
        description="Ajuste dados da barbearia, horários de atendimento, lembretes e integrações."
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={resetSettings}
              className="btn-secondary flex items-center gap-2"
              type="button"
            >
              <RotateCcw size={16} /> Restaurar padrão
            </button>

            <button
              onClick={saveSettings}
              className="btn-primary flex items-center gap-2"
              type="button"
              disabled={saving || loading}
            >
              <Save size={18} /> {saving ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        }
      />

      {loading && (
        <div className="card border border-primary/20 text-sm text-gray-300">
          Carregando configurações...
        </div>
      )}

      {!loading && usingLocalFallback && (
        <div className="card border border-amber-500/30 text-sm text-amber-200">
          Configurações em modo local por indisponibilidade temporária do servidor.
        </div>
      )}

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card space-y-5">
          <div className="flex items-center gap-3">
            <Store className="text-primary" size={20} />
            <h3 className="text-lg font-bold text-white">Dados da barbearia</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="shopName" className="block text-sm text-gray-400 mb-2">
                Nome da barbearia
              </label>
              <input
                id="shopName"
                className="input"
                value={settings.shopName}
                onChange={event => updateField('shopName', event.target.value)}
                placeholder="Ex: Barbearia Central"
              />
            </div>

            <div>
              <label htmlFor="contactPhone" className="block text-sm text-gray-400 mb-2">
                Telefone principal
              </label>
              <input
                id="contactPhone"
                className="input"
                value={settings.contactPhone}
                onChange={event => updateField('contactPhone', event.target.value)}
                placeholder="(11) 99999-9999"
              />
            </div>

            <div>
              <label htmlFor="address" className="block text-sm text-gray-400 mb-2">
                Endereço
              </label>
              <input
                id="address"
                className="input"
                value={settings.address}
                onChange={event => updateField('address', event.target.value)}
                placeholder="Rua, numero e bairro"
              />
            </div>
          </div>
        </div>

        <div className="card space-y-5">
          <div className="flex items-center gap-3">
            <Clock3 className="text-primary" size={20} />
            <h3 className="text-lg font-bold text-white">Horarios de atendimento</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="openingTime" className="block text-sm text-gray-400 mb-2">
                Abre as
              </label>
              <input
                id="openingTime"
                type="time"
                className="input"
                value={settings.openingTime}
                onChange={event => updateField('openingTime', event.target.value)}
              />
            </div>

            <div>
              <label htmlFor="closingTime" className="block text-sm text-gray-400 mb-2">
                Fecha as
              </label>
              <input
                id="closingTime"
                type="time"
                className="input"
                value={settings.closingTime}
                onChange={event => updateField('closingTime', event.target.value)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="slotIntervalMinutes" className="block text-sm text-gray-400 mb-2">
              Intervalo entre horarios (min)
            </label>
            <select
              id="slotIntervalMinutes"
              className="input"
              value={settings.slotIntervalMinutes}
              onChange={event => updateField('slotIntervalMinutes', Number(event.target.value))}
            >
              <option value={15}>15 minutos</option>
              <option value={20}>20 minutos</option>
              <option value={30}>30 minutos</option>
              <option value={45}>45 minutos</option>
              <option value={60}>60 minutos</option>
            </select>
          </div>

          <label className="flex items-center justify-between gap-3 p-4 rounded-xl border border-white/10 bg-black/20">
            <span className="text-gray-300">Permitir encaixes sem agendamento</span>
            <input
              type="checkbox"
              checked={settings.allowWalkins}
              onChange={event => updateField('allowWalkins', event.target.checked)}
              className="h-4 w-4 accent-primary"
            />
          </label>

          <label className="flex items-center justify-between gap-3 p-4 rounded-xl border border-white/10 bg-black/20">
            <span className="text-gray-300">Confirmacao automatica de agendamentos</span>
            <input
              type="checkbox"
              checked={settings.autoConfirmAppointments}
              onChange={event => updateField('autoConfirmAppointments', event.target.checked)}
              className="h-4 w-4 accent-primary"
            />
          </label>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card space-y-5">
          <div className="flex items-center gap-3">
            <BellRing className="text-primary" size={20} />
            <h3 className="text-lg font-bold text-white">Lembretes e notificacoes</h3>
          </div>

          <label className="flex items-center justify-between gap-3 p-4 rounded-xl border border-white/10 bg-black/20">
            <span className="text-gray-300">Enviar lembretes por WhatsApp</span>
            <input
              type="checkbox"
              checked={settings.whatsappReminders}
              onChange={event => updateField('whatsappReminders', event.target.checked)}
              className="h-4 w-4 accent-primary"
            />
          </label>

          <label className="flex items-center justify-between gap-3 p-4 rounded-xl border border-white/10 bg-black/20">
            <span className="text-gray-300">Enviar lembretes por email</span>
            <input
              type="checkbox"
              checked={settings.emailReminders}
              onChange={event => updateField('emailReminders', event.target.checked)}
              className="h-4 w-4 accent-primary"
            />
          </label>
        </div>

        <div className="card space-y-5">
          <div className="flex items-center gap-3">
            <Link2 className="text-primary" size={20} />
            <h3 className="text-lg font-bold text-white">Integracoes</h3>
          </div>

          <label className="flex items-center justify-between gap-3 p-4 rounded-xl border border-white/10 bg-black/20">
            <span className="text-gray-300">Sincronizar com Google Calendar</span>
            <input
              type="checkbox"
              checked={settings.googleCalendarEnabled}
              onChange={event => updateField('googleCalendarEnabled', event.target.checked)}
              className="h-4 w-4 accent-primary"
            />
          </label>

          <div>
            <label htmlFor="whatsappInstanceName" className="block text-sm text-gray-400 mb-2">
              Nome da instancia WhatsApp (Evolution)
            </label>
            <input
              id="whatsappInstanceName"
              className="input"
              value={settings.whatsappInstanceName}
              onChange={event => updateField('whatsappInstanceName', event.target.value)}
              placeholder="ex: easybarber-centro"
            />
            <p className="text-xs text-gray-500 mt-2">
              Esse valor vincula os webhooks da Evolution ao tenant correto desta barbearia.
            </p>
          </div>

          <div>
            <label htmlFor="customWebhookUrl" className="block text-sm text-gray-400 mb-2">
              URL de webhook personalizado
            </label>
            <input
              id="customWebhookUrl"
              className="input"
              value={settings.customWebhookUrl}
              onChange={event => updateField('customWebhookUrl', event.target.value)}
              placeholder="https://seu-webhook.exemplo.com/eventos"
            />
            <p className="text-xs text-gray-500 mt-2">
              Use para integrar automacoes externas quando um agendamento for criado ou atualizado.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
