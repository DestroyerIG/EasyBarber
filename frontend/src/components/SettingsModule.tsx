'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { useToast } from '@/components/Toast';
import { PasswordInput } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { formatPhone } from '@/lib/formatters';
import { getApiErrorMessage } from '@/utils/handleApiError';
import { formatCpfCnpj, isValidCpfCnpj, normalizeCpfCnpjDigits } from '@/utils/cpfCnpj';

const SETTINGS_STORAGE_KEY = 'easybarber.settings.v1';
const PANEL_CLASS =
  'rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.96),rgba(10,10,10,0.98))] shadow-[0_24px_80px_rgba(0,0,0,0.35)]';
const FIELD_CLASS =
  'input min-h-[52px] rounded-2xl border-white/10 bg-black/40 px-4 py-3 text-[15px] placeholder:text-gray-500 focus:border-primary/70 focus:ring-primary/30';
const ERROR_FIELD_CLASS = 'border-red-400/70 focus:border-red-400 focus:ring-red-400/30';
const MUTED_TEXT_CLASS = 'text-sm leading-6 text-gray-400';

interface SettingsModuleProps {
  initialBarbershopName: string;
}

interface SettingsState {
  whatsappInstanceName: string;
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

const buildDefaultSettings = (): SettingsState => ({
  whatsappInstanceName: '',
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

function SettingsPanel({
  eyebrow,
  title,
  description,
  icon,
  children,
  className = '',
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${PANEL_CLASS} p-6 sm:p-7 ${className}`}>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="space-y-2">
          {eyebrow && (
            <span className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              {eyebrow}
            </span>
          )}
          <div>
            <h2 className="text-xl font-bold text-white sm:text-2xl">{title}</h2>
            {description && <p className={`${MUTED_TEXT_CLASS} mt-2 max-w-2xl`}>{description}</p>}
          </div>
        </div>
        {icon && (
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary">
            {icon}
          </div>
        )}
      </div>

      {children}
    </section>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-gray-200">
          {label}
        </label>
        {hint && <span className="text-xs text-gray-500">{hint}</span>}
      </div>
      {children}
      {error && <p className="text-xs font-medium text-red-300">{error}</p>}
    </div>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-white/10 bg-black/25 px-4 py-4 transition-colors hover:border-primary/20 hover:bg-black/35">
      <div className="space-y-1">
        <p className="text-sm font-medium text-white">{title}</p>
        <p className="text-sm text-gray-400">{description}</p>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 accent-primary"
      />
    </label>
  );
}

function LoadingBlock({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: lines }).map((_, index) => (
        <div key={index} className="skeleton h-12 rounded-2xl" />
      ))}
    </div>
  );
}

export function SettingsModule({ initialBarbershopName }: SettingsModuleProps) {
  const { user, refreshMe } = useAuth();
  const defaults = useMemo(() => buildDefaultSettings(), []);
  const isTenantAdmin = user?.role === 'tenant_admin';

  const [settings, setSettings] = useState<SettingsState>(defaults);
  const [accountProfile, setAccountProfile] = useState<AccountProfileState>(
    buildDefaultAccountProfile(initialBarbershopName, user?.email || '')
  );
  const [passwordForm, setPasswordForm] = useState<PasswordState>(buildDefaultPasswordState());

  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [usingLocalFallback, setUsingLocalFallback] = useState(false);

  const [accountLoading, setAccountLoading] = useState(isTenantAdmin);
  const [accountSaving, setAccountSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [accountErrors, setAccountErrors] = useState<FormErrors<keyof AccountProfileState>>({});
  const [passwordErrors, setPasswordErrors] = useState<FormErrors<keyof PasswordState>>({});

  const { showToast } = useToast();

  useEffect(() => {
    setAccountProfile((prev) => ({
      ...prev,
      barbershopName: prev.barbershopName || initialBarbershopName || '',
      email: prev.email || user?.email || '',
    }));
  }, [initialBarbershopName, user?.email]);

  useEffect(() => {
    const loadSettings = async () => {
      setSettingsLoading(true);

      try {
        const response = await api.get('/barbershop/settings');
        const merged = {
          ...defaults,
          ...(response.data as Partial<SettingsState>),
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
          const parsed = raw ? (JSON.parse(raw) as Partial<SettingsState>) : {};

          setSettings({
            ...defaults,
            ...parsed,
          });
          setUsingLocalFallback(true);
        } catch {
          setSettings(defaults);
          setUsingLocalFallback(true);
        }
      } finally {
        setSettingsLoading(false);
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

  const updateSettingsField = <K extends keyof SettingsState>(field: K, value: SettingsState[K]) => {
    setSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const updateAccountField = <K extends keyof AccountProfileState>(field: K, value: AccountProfileState[K]) => {
    setAccountProfile((prev) => ({
      ...prev,
      [field]: value,
    }));

    setAccountErrors((prev) => ({
      ...prev,
      [field]: undefined,
    }));
  };

  const updatePasswordField = <K extends keyof PasswordState>(field: K, value: PasswordState[K]) => {
    setPasswordForm((prev) => ({
      ...prev,
      [field]: value,
    }));

    setPasswordErrors((prev) => ({
      ...prev,
      [field]: undefined,
    }));
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
    setSettingsSaving(true);

    try {
      const response = await api.put('/barbershop/settings', settings);
      const merged = {
        ...settings,
        ...(response.data as Partial<SettingsState>),
      };

      setSettings(merged);
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(merged));
      setUsingLocalFallback(false);
      showToast('Preferências operacionais salvas com sucesso.', 'success');
    } catch (error: unknown) {
      if (shouldUseLocalFallback(error)) {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
        setUsingLocalFallback(true);
        showToast(
          getApiErrorMessage(
            error,
            'Não foi possível salvar no servidor. As preferências ficaram salvas localmente neste navegador.'
          ),
          'error'
        );
      } else {
        setUsingLocalFallback(false);
        showToast(getApiErrorMessage(error, 'Não foi possível salvar as preferências operacionais.'), 'error');
      }
    } finally {
      setSettingsSaving(false);
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
    showToast('Preferências operacionais restauradas para o padrão.', 'info');
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-1 pb-6">
      <section className={`${PANEL_CLASS} overflow-hidden p-6 sm:p-8`}>
        <div className="relative">
          <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.22),transparent_60%)]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <span className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
                Painel da conta
              </span>
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Configurações</h1>
                <p className="max-w-2xl text-base leading-7 text-gray-400">
                  Centralize os dados cadastrais, preferências operacionais e integrações da sua barbearia em um fluxo mais limpo e consistente.
                </p>
              </div>
            </div>

            {usingLocalFallback && (
              <div className="max-w-md rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                Algumas preferências operacionais estão em modo local por indisponibilidade temporária do servidor.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.92fr)]">
        <SettingsPanel
          eyebrow="Fonte oficial"
          title="Dados cadastrais"
          description="Edite aqui os dados oficiais da conta. Nome da barbearia, telefone, CPF/CNPJ e e-mail passam a ter uma única fonte de verdade."
          icon={<UserRound size={22} />}
        >
          {!isTenantAdmin && (
            <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-4 text-sm text-gray-300">
              Essa área fica disponível apenas para o administrador da conta do tenant.
            </div>
          )}

          {isTenantAdmin && accountLoading && <LoadingBlock lines={5} />}

          {isTenantAdmin && !accountLoading && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <Field id="accountBarbershopName" label="Nome da barbearia" error={accountErrors.barbershopName}>
                  <input
                    id="accountBarbershopName"
                    className={`${FIELD_CLASS} ${accountErrors.barbershopName ? ERROR_FIELD_CLASS : ''}`}
                    value={accountProfile.barbershopName}
                    onChange={(event) => updateAccountField('barbershopName', event.target.value)}
                    placeholder="Ex: EasyBarber Prime"
                  />
                </Field>

                <Field id="ownerName" label="Nome do responsável" error={accountErrors.ownerName}>
                  <input
                    id="ownerName"
                    className={`${FIELD_CLASS} ${accountErrors.ownerName ? ERROR_FIELD_CLASS : ''}`}
                    value={accountProfile.ownerName}
                    onChange={(event) => updateAccountField('ownerName', event.target.value)}
                    placeholder="Nome completo do responsável"
                  />
                </Field>

                <Field id="whatsapp" label="WhatsApp" error={accountErrors.whatsapp}>
                  <input
                    id="whatsapp"
                    className={`${FIELD_CLASS} ${accountErrors.whatsapp ? ERROR_FIELD_CLASS : ''}`}
                    value={accountProfile.whatsapp}
                    onChange={(event) => updateAccountField('whatsapp', formatPhoneInput(event.target.value))}
                    placeholder="(11) 99999-9999"
                  />
                </Field>

                <Field id="cpfCnpj" label="CPF/CNPJ" error={accountErrors.cpfCnpj}>
                  <input
                    id="cpfCnpj"
                    className={`${FIELD_CLASS} ${accountErrors.cpfCnpj ? ERROR_FIELD_CLASS : ''}`}
                    value={accountProfile.cpfCnpj}
                    onChange={(event) => updateAccountField('cpfCnpj', formatCpfCnpj(event.target.value))}
                    placeholder="000.000.000-00"
                  />
                </Field>
              </div>

              <Field id="accountEmail" label="E-mail da conta" error={accountErrors.email}>
                <input
                  id="accountEmail"
                  type="email"
                  className={`${FIELD_CLASS} ${accountErrors.email ? ERROR_FIELD_CLASS : ''}`}
                  value={accountProfile.email}
                  onChange={(event) => updateAccountField('email', event.target.value)}
                  placeholder="contato@barbearia.com"
                />
              </Field>

              <div className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-gray-500">
                  As alterações ficam no formulário mesmo se houver erro, para você ajustar e reenviar.
                </p>
                <button
                  type="button"
                  onClick={saveAccountProfile}
                  disabled={accountSaving}
                  className="btn-primary inline-flex min-h-[50px] items-center justify-center gap-2 rounded-2xl px-6 sm:min-w-[230px]"
                >
                  <Save size={18} /> {accountSaving ? 'Salvando...' : 'Salvar dados cadastrais'}
                </button>
              </div>
            </div>
          )}
        </SettingsPanel>

        <SettingsPanel
          eyebrow="Segurança"
          title="Alterar senha"
          description="A troca de senha fica isolada do cadastro principal para dar mais clareza e reforçar a segurança da conta."
          icon={<KeyRound size={22} />}
          className="h-full"
        >
          {!isTenantAdmin && (
            <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-4 text-sm text-gray-300">
              A troca de senha por essa tela fica disponível apenas para o administrador da conta.
            </div>
          )}

          {isTenantAdmin && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-primary/10 bg-primary/5 px-4 py-3 text-sm text-gray-300">
                Use a senha atual para confirmar sua identidade antes de definir uma nova senha.
              </div>

              <Field id="currentPassword" label="Senha atual" error={passwordErrors.currentPassword}>
                <PasswordInput
                  id="currentPassword"
                  className={`${FIELD_CLASS} ${passwordErrors.currentPassword ? ERROR_FIELD_CLASS : ''}`}
                  value={passwordForm.currentPassword}
                  onChange={(event) => updatePasswordField('currentPassword', event.target.value)}
                  placeholder="Digite sua senha atual"
                  autoComplete="current-password"
                  toggleLabel="senha atual"
                />
              </Field>

              <Field
                id="newPassword"
                label="Nova senha"
                hint="Mínimo 8 caracteres"
                error={passwordErrors.newPassword}
              >
                <PasswordInput
                  id="newPassword"
                  className={`${FIELD_CLASS} ${passwordErrors.newPassword ? ERROR_FIELD_CLASS : ''}`}
                  value={passwordForm.newPassword}
                  onChange={(event) => updatePasswordField('newPassword', event.target.value)}
                  placeholder="Inclua letra maiúscula e número"
                  autoComplete="new-password"
                  toggleLabel="nova senha"
                />
              </Field>

              <Field id="confirmNewPassword" label="Confirmar nova senha" error={passwordErrors.confirmNewPassword}>
                <PasswordInput
                  id="confirmNewPassword"
                  className={`${FIELD_CLASS} ${passwordErrors.confirmNewPassword ? ERROR_FIELD_CLASS : ''}`}
                  value={passwordForm.confirmNewPassword}
                  onChange={(event) => updatePasswordField('confirmNewPassword', event.target.value)}
                  placeholder="Repita a nova senha"
                  autoComplete="new-password"
                  toggleLabel="confirmação da nova senha"
                />
              </Field>

              <div className="flex flex-col gap-3 border-t border-white/10 pt-5">
                <button
                  type="button"
                  onClick={savePassword}
                  disabled={passwordSaving}
                  className="btn-primary inline-flex min-h-[50px] items-center justify-center gap-2 rounded-2xl px-6"
                >
                  <Save size={18} /> {passwordSaving ? 'Atualizando...' : 'Atualizar senha'}
                </button>
                <p className="text-xs leading-6 text-gray-500">
                  A senha nunca é carregada do backend e continua sendo validada no fluxo seguro do provedor de autenticação quando aplicável.
                </p>
              </div>
            </div>
          )}
        </SettingsPanel>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SettingsPanel
          eyebrow="Operação"
          title="Horários de atendimento"
          description="Defina a janela de atendimento e o comportamento padrão da agenda."
          icon={<Clock3 size={22} />}
        >
          {settingsLoading ? (
            <LoadingBlock lines={4} />
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Field id="openingTime" label="Abre às">
                  <input
                    id="openingTime"
                    type="time"
                    className={FIELD_CLASS}
                    value={settings.openingTime}
                    onChange={(event) => updateSettingsField('openingTime', event.target.value)}
                  />
                </Field>

                <Field id="closingTime" label="Fecha às">
                  <input
                    id="closingTime"
                    type="time"
                    className={FIELD_CLASS}
                    value={settings.closingTime}
                    onChange={(event) => updateSettingsField('closingTime', event.target.value)}
                  />
                </Field>
              </div>

              <Field id="slotIntervalMinutes" label="Intervalo entre horários">
                <select
                  id="slotIntervalMinutes"
                  className={FIELD_CLASS}
                  value={settings.slotIntervalMinutes}
                  onChange={(event) => updateSettingsField('slotIntervalMinutes', Number(event.target.value))}
                >
                  <option value={15}>15 minutos</option>
                  <option value={20}>20 minutos</option>
                  <option value={30}>30 minutos</option>
                  <option value={45}>45 minutos</option>
                  <option value={60}>60 minutos</option>
                </select>
              </Field>

              <div className="space-y-3">
                <ToggleRow
                  title="Permitir encaixes sem agendamento"
                  description="Mantém a agenda flexível para atender clientes fora da marcação formal."
                  checked={settings.allowWalkins}
                  onChange={(checked) => updateSettingsField('allowWalkins', checked)}
                />
                <ToggleRow
                  title="Confirmação automática de agendamentos"
                  description="Confirma novos agendamentos automaticamente para reduzir etapas no fluxo."
                  checked={settings.autoConfirmAppointments}
                  onChange={(checked) => updateSettingsField('autoConfirmAppointments', checked)}
                />
              </div>
            </div>
          )}
        </SettingsPanel>

        <SettingsPanel
          eyebrow="Comunicação"
          title="Lembretes e notificações"
          description="Escolha como a barbearia se comunica com os clientes ao longo da agenda."
          icon={<BellRing size={22} />}
        >
          {settingsLoading ? (
            <LoadingBlock lines={3} />
          ) : (
            <div className="space-y-3">
              <ToggleRow
                title="Enviar lembretes por WhatsApp"
                description="Usa o canal com melhor taxa de abertura para lembrar os clientes."
                checked={settings.whatsappReminders}
                onChange={(checked) => updateSettingsField('whatsappReminders', checked)}
              />
              <ToggleRow
                title="Enviar lembretes por e-mail"
                description="Mantém um segundo canal ativo para confirmações e reforço da comunicação."
                checked={settings.emailReminders}
                onChange={(checked) => updateSettingsField('emailReminders', checked)}
              />
            </div>
          )}
        </SettingsPanel>

        <SettingsPanel
          eyebrow="Conectividade"
          title="Integrações"
          description="Gerencie identificadores técnicos e conexões externas sem misturar com os dados oficiais da conta."
          icon={<Link2 size={22} />}
          className="lg:col-span-2"
        >
          {settingsLoading ? (
            <LoadingBlock lines={4} />
          ) : (
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="space-y-3">
                <ToggleRow
                  title="Sincronizar com Google Calendar"
                  description="Ative para integrar o calendário externo quando essa rotina estiver habilitada."
                  checked={settings.googleCalendarEnabled}
                  onChange={(checked) => updateSettingsField('googleCalendarEnabled', checked)}
                />
              </div>

              <div className="grid grid-cols-1 gap-5">
                <Field id="whatsappInstanceName" label="Nome da instância WhatsApp (Evolution)">
                  <input
                    id="whatsappInstanceName"
                    className={`${FIELD_CLASS} opacity-80`}
                    value={settings.whatsappInstanceName}
                    onChange={(event) => updateSettingsField('whatsappInstanceName', event.target.value)}
                    placeholder="Gerado automaticamente ao conectar"
                    readOnly
                  />
                </Field>

                <Field id="customWebhookUrl" label="Webhook personalizado" hint="Opcional">
                  <input
                    id="customWebhookUrl"
                    className={FIELD_CLASS}
                    value={settings.customWebhookUrl}
                    onChange={(event) => updateSettingsField('customWebhookUrl', event.target.value)}
                    placeholder="https://seu-webhook.exemplo.com/eventos"
                  />
                </Field>
              </div>
            </div>
          )}
        </SettingsPanel>
      </section>

      <section className={`${PANEL_CLASS} p-5 sm:p-6`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-white">
              <Store size={18} className="text-primary" />
              <span className="font-semibold">Preferências operacionais</span>
            </div>
            <p className={MUTED_TEXT_CLASS}>
              Horários, notificações e integrações técnicas continuam sendo salvos separadamente dos dados cadastrais da conta.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={resetSettings}
              className="btn-secondary inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl px-5"
            >
              <RotateCcw size={16} /> Restaurar padrões
            </button>
            <button
              type="button"
              onClick={saveSettings}
              disabled={settingsSaving || settingsLoading}
              className="btn-primary inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl px-6"
            >
              <Save size={18} /> {settingsSaving ? 'Salvando...' : 'Salvar preferências'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
