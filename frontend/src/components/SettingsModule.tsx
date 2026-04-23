'use client';

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  BellRing,
  Clock3,
  KeyRound,
  Link2,
  RotateCcw,
  Save,
  Store,
  UserRound,
} from 'lucide-react';
import { PageHeader } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { formatPhone } from '@/lib/formatters';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { formatCpfCnpj, isValidCpfCnpj, normalizeCpfCnpjDigits } from '@/utils/cpfCnpj';

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

interface AccountProfileState {
  barbershopName: string;
  ownerName: string;
  whatsapp: string;
  cpfCnpj: string;
  email: string;
}

interface PasswordState {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}

type FormErrors<T extends string> = Partial<Record<T, string>>;

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

const buildDefaultAccountProfile = (barbershopName: string, email: string): AccountProfileState => ({
  barbershopName: barbershopName || '',
  ownerName: '',
  whatsapp: '',
  cpfCnpj: '',
  email: email || '',
});

const buildDefaultPasswordState = (): PasswordState => ({
  currentPassword: '',
  newPassword: '',
  confirmNewPassword: '',
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

const normalizePhoneDigits = (value: string) => value.replace(/\D+/g, '').slice(0, 18);

const formatPhoneInput = (value: string) => {
  const digits = normalizePhoneDigits(value).slice(0, 11);

  if (digits.length <= 2) {
    return digits;
  }

  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }

  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return formatPhone(digits);
};

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const getPasswordRequirementsError = (value: string) => {
  if (value.length < 8) {
    return 'A nova senha deve ter pelo menos 8 caracteres.';
  }

  if (!/[A-Z]/.test(value)) {
    return 'A nova senha deve conter pelo menos uma letra maiúscula.';
  }

  if (!/[0-9]/.test(value)) {
    return 'A nova senha deve conter pelo menos um número.';
  }

  return null;
};

export function SettingsModule({ initialBarbershopName }: SettingsModuleProps) {
  const { user, refreshMe } = useAuth();
  const defaults = useMemo(() => buildDefaultSettings(initialBarbershopName), [initialBarbershopName]);
  const isTenantAdmin = user?.role === 'tenant_admin';
  const [settings, setSettings] = useState<SettingsState>(defaults);
  const [accountProfile, setAccountProfile] = useState<AccountProfileState>(
    buildDefaultAccountProfile(initialBarbershopName, user?.email || '')
  );
  const [passwordForm, setPasswordForm] = useState<PasswordState>(buildDefaultPasswordState());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [usingLocalFallback, setUsingLocalFallback] = useState(false);
  const [accountLoading, setAccountLoading] = useState(isTenantAdmin);
  const [accountSaving, setAccountSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [accountErrors, setAccountErrors] = useState<FormErrors<keyof AccountProfileState>>({});
  const [passwordErrors, setPasswordErrors] = useState<FormErrors<keyof PasswordState>>({});
  const { showToast } = useToast();

  useEffect(() => {
    setAccountProfile(prev => ({
      ...prev,
      barbershopName: prev.barbershopName || initialBarbershopName || '',
      email: prev.email || user?.email || '',
    }));
  }, [initialBarbershopName, user?.email]);

  useEffect(() => {
    const loadSettings = async () => {
      setLoading(true);

      try {
        const response = await api.get('/barbershop/settings');
        const remoteSettings = response.data as Partial<SettingsState>;
        const merged = {
          ...defaults,
          ...remoteSettings,
        };

        setSettings(merged);
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(merged));
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

  useEffect(() => {
    if (!isTenantAdmin) {
      setAccountLoading(false);
      return;
    }

    const loadAccountProfile = async () => {
      setAccountLoading(true);

      try {
        const response = await api.get('/barbershop/account-profile');
        const data = response.data as AccountProfileState;

        setAccountProfile({
          barbershopName: data.barbershopName || initialBarbershopName || '',
          ownerName: data.ownerName || '',
          whatsapp: formatPhoneInput(data.whatsapp || ''),
          cpfCnpj: formatCpfCnpj(data.cpfCnpj || ''),
          email: data.email || user?.email || '',
        });
        setAccountErrors({});
      } catch (error: unknown) {
        showToast(getApiErrorMessage(error, 'Não foi possível carregar os dados cadastrais.'), 'error');
      } finally {
        setAccountLoading(false);
      }
    };

    loadAccountProfile();
  }, [initialBarbershopName, isTenantAdmin, showToast, user?.email]);

  const updateField = <K extends keyof SettingsState>(field: K, value: SettingsState[K]) => {
    setSettings(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const updateAccountField = <K extends keyof AccountProfileState>(field: K, value: AccountProfileState[K]) => {
    setAccountProfile(prev => ({
      ...prev,
      [field]: value,
    }));

    setAccountErrors(prev => {
      if (!prev[field]) {
        return prev;
      }

      return {
        ...prev,
        [field]: undefined,
      };
    });
  };

  const updatePasswordField = <K extends keyof PasswordState>(field: K, value: PasswordState[K]) => {
    setPasswordForm(prev => ({
      ...prev,
      [field]: value,
    }));

    setPasswordErrors(prev => {
      if (!prev[field]) {
        return prev;
      }

      return {
        ...prev,
        [field]: undefined,
      };
    });
  };

  const validateAccountProfile = () => {
    const nextErrors: FormErrors<keyof AccountProfileState> = {};

    if (!accountProfile.barbershopName.trim()) {
      nextErrors.barbershopName = 'Informe o nome da barbearia.';
    }

    if (!accountProfile.ownerName.trim()) {
      nextErrors.ownerName = 'Informe o nome do responsável.';
    }

    const whatsappDigits = normalizePhoneDigits(accountProfile.whatsapp);
    if (!whatsappDigits) {
      nextErrors.whatsapp = 'Informe o WhatsApp.';
    } else if (whatsappDigits.length < 10) {
      nextErrors.whatsapp = 'Informe um WhatsApp com DDD válido.';
    }

    const cpfCnpjDigits = normalizeCpfCnpjDigits(accountProfile.cpfCnpj);
    if (!cpfCnpjDigits) {
      nextErrors.cpfCnpj = 'Informe o CPF/CNPJ.';
    } else if (!isValidCpfCnpj(cpfCnpjDigits)) {
      nextErrors.cpfCnpj = 'Informe um CPF/CNPJ válido.';
    }

    if (!accountProfile.email.trim()) {
      nextErrors.email = 'Informe o e-mail da conta.';
    } else if (!isValidEmail(accountProfile.email)) {
      nextErrors.email = 'Informe um e-mail válido.';
    }

    setAccountErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const validatePasswordForm = () => {
    const nextErrors: FormErrors<keyof PasswordState> = {};

    if (!passwordForm.currentPassword) {
      nextErrors.currentPassword = 'Informe a senha atual.';
    }

    const passwordRequirementError = getPasswordRequirementsError(passwordForm.newPassword);
    if (!passwordForm.newPassword) {
      nextErrors.newPassword = 'Informe a nova senha.';
    } else if (passwordRequirementError) {
      nextErrors.newPassword = passwordRequirementError;
    }

    if (!passwordForm.confirmNewPassword) {
      nextErrors.confirmNewPassword = 'Confirme a nova senha.';
    } else if (passwordForm.confirmNewPassword !== passwordForm.newPassword) {
      nextErrors.confirmNewPassword = 'A confirmação da nova senha não confere.';
    }

    if (
      passwordForm.currentPassword &&
      passwordForm.newPassword &&
      passwordForm.currentPassword === passwordForm.newPassword
    ) {
      nextErrors.newPassword = 'A nova senha deve ser diferente da senha atual.';
    }

    setPasswordErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
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

  const saveAccountProfile = async () => {
    if (!validateAccountProfile()) {
      return;
    }

    setAccountSaving(true);

    try {
      const response = await api.put('/barbershop/account-profile', {
        barbershopName: accountProfile.barbershopName.trim(),
        ownerName: accountProfile.ownerName.trim(),
        whatsapp: normalizePhoneDigits(accountProfile.whatsapp),
        cpfCnpj: normalizeCpfCnpjDigits(accountProfile.cpfCnpj),
        email: accountProfile.email.trim().toLowerCase(),
      });

      const data = response.data as AccountProfileState;

      setAccountProfile({
        barbershopName: data.barbershopName || accountProfile.barbershopName.trim(),
        ownerName: data.ownerName || accountProfile.ownerName.trim(),
        whatsapp: formatPhoneInput(data.whatsapp || accountProfile.whatsapp),
        cpfCnpj: formatCpfCnpj(data.cpfCnpj || accountProfile.cpfCnpj),
        email: data.email || accountProfile.email.trim().toLowerCase(),
      });
      setAccountErrors({});
      await refreshMe();
      showToast('Dados cadastrais atualizados com sucesso.', 'success');
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Não foi possível atualizar os dados cadastrais.'), 'error');
    } finally {
      setAccountSaving(false);
    }
  };

  const savePassword = async () => {
    if (!validatePasswordForm()) {
      return;
    }

    setPasswordSaving(true);

    try {
      const response = await api.put('/barbershop/account-password', passwordForm);
      const payload = response.data as { message?: string };

      setPasswordForm(buildDefaultPasswordState());
      setPasswordErrors({});
      await refreshMe();
      showToast(payload.message || 'Senha alterada com sucesso.', 'success');
    } catch (error: unknown) {
      showToast(getApiErrorMessage(error, 'Não foi possível alterar a senha.'), 'error');
    } finally {
      setPasswordSaving(false);
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
              placeholder="Sera gerado automaticamente ao conectar"
              readOnly
            />
            <p className="text-xs text-gray-500 mt-2">
              Esse identificador tecnico e gerado automaticamente e vincula os webhooks da Evolution ao tenant correto.
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

      <section className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
        <div className="card space-y-5">
          <div className="flex items-center gap-3">
            <UserRound className="text-primary" size={20} />
            <div>
              <h3 className="text-lg font-bold text-white">Dados cadastrais</h3>
              <p className="text-sm text-gray-400">
                Atualize os dados da conta usados no cadastro do tenant autenticado.
              </p>
            </div>
          </div>

          {!isTenantAdmin && (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-gray-300">
              Essa seção fica disponível apenas para o administrador da conta do tenant.
            </div>
          )}

          {isTenantAdmin && accountLoading && (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-gray-300">
              Carregando dados cadastrais...
            </div>
          )}

          {isTenantAdmin && !accountLoading && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="accountBarbershopName" className="block text-sm text-gray-400 mb-2">
                    Nome da barbearia
                  </label>
                  <input
                    id="accountBarbershopName"
                    className="input"
                    value={accountProfile.barbershopName}
                    onChange={event => updateAccountField('barbershopName', event.target.value)}
                    placeholder="Ex: Barbearia Central"
                  />
                  {accountErrors.barbershopName && (
                    <p className="mt-2 text-xs text-red-300">{accountErrors.barbershopName}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="ownerName" className="block text-sm text-gray-400 mb-2">
                    Nome do responsável
                  </label>
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                    <input
                      id="ownerName"
                      className="input pl-10"
                      value={accountProfile.ownerName}
                      onChange={event => updateAccountField('ownerName', event.target.value)}
                      placeholder="Nome completo"
                    />
                  </div>
                  {accountErrors.ownerName && (
                    <p className="mt-2 text-xs text-red-300">{accountErrors.ownerName}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="whatsapp" className="block text-sm text-gray-400 mb-2">
                    WhatsApp
                  </label>
                  <input
                    id="whatsapp"
                    className="input"
                    value={accountProfile.whatsapp}
                    onChange={event => updateAccountField('whatsapp', formatPhoneInput(event.target.value))}
                    placeholder="(11) 99999-9999"
                  />
                  {accountErrors.whatsapp && (
                    <p className="mt-2 text-xs text-red-300">{accountErrors.whatsapp}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="cpfCnpj" className="block text-sm text-gray-400 mb-2">
                    CPF/CNPJ
                  </label>
                  <input
                    id="cpfCnpj"
                    className="input"
                    value={accountProfile.cpfCnpj}
                    onChange={event => updateAccountField('cpfCnpj', formatCpfCnpj(event.target.value))}
                    placeholder="000.000.000-00"
                  />
                  {accountErrors.cpfCnpj && (
                    <p className="mt-2 text-xs text-red-300">{accountErrors.cpfCnpj}</p>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="accountEmail" className="block text-sm text-gray-400 mb-2">
                  E-mail da conta
                </label>
                <input
                  id="accountEmail"
                  type="email"
                  className="input"
                  value={accountProfile.email}
                  onChange={event => updateAccountField('email', event.target.value)}
                  placeholder="contato@barbearia.com"
                />
                {accountErrors.email && (
                  <p className="mt-2 text-xs text-red-300">{accountErrors.email}</p>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={saveAccountProfile}
                  disabled={accountSaving}
                  className="btn-primary flex items-center gap-2"
                >
                  <Save size={18} /> {accountSaving ? 'Salvando...' : 'Salvar dados cadastrais'}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="card space-y-5">
          <div className="flex items-center gap-3">
            <KeyRound className="text-primary" size={20} />
            <div>
              <h3 className="text-lg font-bold text-white">Alterar senha</h3>
              <p className="text-sm text-gray-400">
                Esse fluxo é separado do formulário principal para manter a alteração mais segura.
              </p>
            </div>
          </div>

          {!isTenantAdmin && (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-gray-300">
              A troca de senha pela tela de configurações fica disponível apenas para o administrador da conta.
            </div>
          )}

          {isTenantAdmin && (
            <>
              <div>
                <label htmlFor="currentPassword" className="block text-sm text-gray-400 mb-2">
                  Senha atual
                </label>
                <input
                  id="currentPassword"
                  type="password"
                  className="input"
                  value={passwordForm.currentPassword}
                  onChange={event => updatePasswordField('currentPassword', event.target.value)}
                  placeholder="Digite sua senha atual"
                />
                {passwordErrors.currentPassword && (
                  <p className="mt-2 text-xs text-red-300">{passwordErrors.currentPassword}</p>
                )}
              </div>

              <div>
                <label htmlFor="newPassword" className="block text-sm text-gray-400 mb-2">
                  Nova senha
                </label>
                <input
                  id="newPassword"
                  type="password"
                  className="input"
                  value={passwordForm.newPassword}
                  onChange={event => updatePasswordField('newPassword', event.target.value)}
                  placeholder="Min. 8 caracteres, com maiúscula e número"
                />
                {passwordErrors.newPassword && (
                  <p className="mt-2 text-xs text-red-300">{passwordErrors.newPassword}</p>
                )}
              </div>

              <div>
                <label htmlFor="confirmNewPassword" className="block text-sm text-gray-400 mb-2">
                  Confirmar nova senha
                </label>
                <input
                  id="confirmNewPassword"
                  type="password"
                  className="input"
                  value={passwordForm.confirmNewPassword}
                  onChange={event => updatePasswordField('confirmNewPassword', event.target.value)}
                  placeholder="Repita a nova senha"
                />
                {passwordErrors.confirmNewPassword && (
                  <p className="mt-2 text-xs text-red-300">{passwordErrors.confirmNewPassword}</p>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={savePassword}
                  disabled={passwordSaving}
                  className="btn-primary flex items-center gap-2"
                >
                  <Save size={18} /> {passwordSaving ? 'Atualizando...' : 'Atualizar senha'}
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
