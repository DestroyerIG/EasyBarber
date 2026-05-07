import { barbershopSettingsRepository } from '../repositories/barbershopSettingsRepository.js';
import bcrypt from 'bcryptjs';
import { authRepository } from '../repositories/authRepository.js';
import { supabaseAuthService } from './supabaseAuthService.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
import { isValidCpfCnpj, normalizeDocumentDigits } from '../utils/cpfCnpj.js';
import { normalizeWhatsAppInstanceName } from './whatsapp/whatsappInstanceService.js';
import logger from '../utils/logger.js';

const ALLOWED_SLOT_INTERVALS = new Set([0, 15, 20, 30, 45, 60, 90, 120]);
const ALLOWED_OPEN_DAYS = new Set(['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom']);
const DEFAULT_OPEN_DAYS = ['seg', 'ter', 'qua', 'qui', 'sex'];
const TENANT_ACCOUNT_ROLE = 'tenant_admin';

interface UpdateSettingsData {
  slotIntervalMinutes: number;
  openingTime: string;
  closingTime: string;
  whatsappInstanceName?: unknown;
  diasAbertos?: unknown;
  allowWalkins?: unknown;
  autoConfirmAppointments?: unknown;
  emailReminders?: unknown;
  whatsappReminders?: unknown;
  googleCalendarEnabled?: unknown;
  customWebhookUrl?: unknown;
}

interface UpdateProfileData {
  cpfCnpj: string;
}

interface AuthContext {
  barbershopId: string;
  userId: string;
  role: string;
}

interface AccountProfileData {
  barbershopName: string;
  ownerName: string;
  whatsapp: string;
  cpfCnpj: string;
  email: string;
}

interface PasswordData {
  currentPassword: string;
  newPassword: string;
}

const toMinutes = (timeValue: string): number => {
  const [hours = 0, minutes = 0] = timeValue.split(':').map(Number);
  return (hours * 60) + minutes;
};

const normalizeOptionalInstanceName = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return normalizeWhatsAppInstanceName(String(value));
};

const normalizeEmail = (value: unknown): string => String(value || '').trim().toLowerCase();
const normalizeText = (value: unknown): string => String(value || '').trim();

const normalizePhoneDigits = (value: unknown): string => {
  const digits = String(value || '').replace(/\D+/g, '');
  return digits || '';
};

const normalizeOpenDays = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [...DEFAULT_OPEN_DAYS];
  }

  const uniqueDays: string[] = [];
  for (const day of value) {
    const normalizedDay = String(day || '').trim().toLowerCase();
    if (ALLOWED_OPEN_DAYS.has(normalizedDay) && !uniqueDays.includes(normalizedDay)) {
      uniqueDays.push(normalizedDay);
    }
  }

  return uniqueDays.length ? uniqueDays : [...DEFAULT_OPEN_DAYS];
};

const maskEmailForLog = (value: unknown): string | null => {
  const normalizedValue = normalizeEmail(value);

  if (!normalizedValue || !normalizedValue.includes('@')) {
    return null;
  }

  const [localPart, domain] = normalizedValue.split('@');
  const visibleLocal = localPart!.slice(0, 2);

  return `${visibleLocal}${'*'.repeat(Math.max(localPart!.length - visibleLocal.length, 0))}@${domain}`;
};

const maskDigitsForLog = (value: unknown, visibleSuffix = 4): string | null => {
  const digits = String(value || '').replace(/\D+/g, '');

  if (!digits) {
    return null;
  }

  const suffix = digits.slice(-visibleSuffix);
  return `${'*'.repeat(Math.max(digits.length - suffix.length, 0))}${suffix}`;
};

const summarizeAccountPayloadForLog = (payload: Record<string, unknown> | null | undefined): Record<string, unknown> => ({
  barbershopName: normalizeText(payload?.barbershopName) || null,
  ownerName: normalizeText(payload?.ownerName) || null,
  email: maskEmailForLog(payload?.email),
  whatsapp: maskDigitsForLog(payload?.whatsapp),
  cpfCnpj: maskDigitsForLog(payload?.cpfCnpj),
});

const summarizeUserForLog = (user: Record<string, unknown> | null | undefined): Record<string, unknown> => ({
  userId: user?.userId || null,
  barbershopId: user?.barbershopId || null,
  role: user?.role || null,
  email: maskEmailForLog(user?.email),
});

const isUniqueViolation = (error: unknown): boolean => (error as Record<string, unknown>)?.code === '23505';
const EMAIL_UNIQUE_CONSTRAINTS = new Set([
  'users_email_key',
  'barbershops_email_key',
]);

const isEmailUniqueViolation = (error: unknown): boolean => {
  if (!isUniqueViolation(error)) {
    return false;
  }

  const constraint = String((error as Record<string, unknown>)?.constraint || '').trim();
  return EMAIL_UNIQUE_CONSTRAINTS.has(constraint);
};

const isMissingColumnError = (error: unknown): boolean => (error as Record<string, unknown>)?.code === '42703';

const ensureTenantAdmin = (role: string): void => {
  if (String(role || '').trim().toLowerCase() !== TENANT_ACCOUNT_ROLE) {
    throw new ForbiddenError('Apenas o administrador da conta pode alterar os dados cadastrais.');
  }
};

export const barbershopSettingsService = {
  async getSettings(barbershopId: string): Promise<unknown> {
    const settings = await barbershopSettingsRepository.findByBarbershopId(barbershopId);
    if (!settings) {
      throw new NotFoundError('Barbearia');
    }
    return settings;
  },

  async updateSettings(barbershopId: string, data: UpdateSettingsData): Promise<unknown> {
    if (!ALLOWED_SLOT_INTERVALS.has(data.slotIntervalMinutes)) {
      throw new ValidationError('Intervalo de agenda inválido', ['Use sem intervalo, 15, 20, 30, 45, 60, 90 ou 120 minutos.']);
    }

    const openingMinutes = toMinutes(data.openingTime);
    const closingMinutes = toMinutes(data.closingTime);

    if (closingMinutes <= openingMinutes) {
      throw new ValidationError(
        'Horário de fechamento inválido',
        ['O horário de fechamento deve ser maior que o horário de abertura.']
      );
    }

    const payload = {
      whatsappInstanceName: normalizeOptionalInstanceName(data.whatsappInstanceName),
      diasAbertos: normalizeOpenDays(data.diasAbertos),
      openingTime: data.openingTime,
      closingTime: data.closingTime,
      slotIntervalMinutes: data.slotIntervalMinutes,
      allowWalkins: data.allowWalkins,
      autoConfirmAppointments: data.autoConfirmAppointments,
      emailReminders: data.emailReminders,
      whatsappReminders: data.whatsappReminders,
      googleCalendarEnabled: data.googleCalendarEnabled,
      customWebhookUrl: String(data.customWebhookUrl || '').trim() || null,
    };

    let settings: unknown;

    try {
      settings = await barbershopSettingsRepository.upsert(barbershopId, payload);
    } catch (error) {
      const errRecord = error as Record<string, unknown>;
      const uniqueViolation = errRecord?.code === '23505';
      const conflictingConstraint = String(errRecord?.constraint || '').trim();

      if (uniqueViolation && conflictingConstraint === 'uq_barbershops_whatsapp_instance_name_norm') {
        throw new ValidationError(
          'Instancia do WhatsApp ja vinculada',
          ['Esta instancia ja esta em uso por outra barbearia. Escolha outro nome de instancia.']
        );
      }

      throw error;
    }

    if (!settings) {
      throw new NotFoundError('Barbearia');
    }

    return settings;
  },

  async getProfile(barbershopId: string): Promise<unknown> {
    const profile = await barbershopSettingsRepository.findProfileByBarbershopId(barbershopId);
    if (!profile) {
      throw new NotFoundError('Barbearia');
    }

    return profile;
  },

  async updateProfile(barbershopId: string, data: UpdateProfileData): Promise<unknown> {
    const normalizedCpfCnpj = normalizeDocumentDigits(data.cpfCnpj);

    if (!isValidCpfCnpj(normalizedCpfCnpj)) {
      throw new ValidationError('CPF/CNPJ inválido', ['Informe um CPF ou CNPJ válido para continuar com o Pix.']);
    }

    const profile = await barbershopSettingsRepository.updateProfile(barbershopId, {
      cpfCnpj: normalizedCpfCnpj,
    });

    if (!profile) {
      throw new NotFoundError('Barbearia');
    }

    return profile;
  },

  async getAccountProfile({ barbershopId, userId, role }: AuthContext): Promise<unknown> {
    ensureTenantAdmin(role);

    const profile = await barbershopSettingsRepository.findAccountProfileByUserId(barbershopId, userId);

    if (!profile) {
      throw new NotFoundError('Conta');
    }

    return profile;
  },

  async updateAccountProfile({ barbershopId, userId, role }: AuthContext, data: AccountProfileData): Promise<{
    profile: unknown;
    sessionUser: unknown;
    emailChanged: boolean;
  }> {
    ensureTenantAdmin(role);

    const currentStage = {
      value: 'normalize_input',
    };
    const normalizedPayload = {
      barbershopName: normalizeText(data.barbershopName),
      ownerName: normalizeText(data.ownerName),
      whatsapp: normalizePhoneDigits(data.whatsapp),
      cpfCnpj: normalizeDocumentDigits(data.cpfCnpj),
      email: normalizeEmail(data.email),
    };

    logger.info(
      {
        operation: 'updateAccountProfile',
        stage: currentStage.value,
        authUser: summarizeUserForLog({ barbershopId, userId, role }),
        payload: summarizeAccountPayloadForLog(normalizedPayload as Record<string, unknown>),
      },
      'Atualizacao de dados cadastrais iniciada'
    );

    if (!normalizedPayload.barbershopName) {
      throw new ValidationError('Nome da barbearia obrigatório', ['Informe o nome da barbearia.']);
    }

    if (!normalizedPayload.ownerName) {
      throw new ValidationError('Nome do responsável obrigatório', ['Informe o nome do responsável.']);
    }

    if (!normalizedPayload.email) {
      throw new ValidationError('E-mail obrigatório', ['Informe o e-mail da conta.']);
    }

    if (!normalizedPayload.whatsapp) {
      throw new ValidationError('WhatsApp obrigatório', ['Informe o telefone/WhatsApp.']);
    }

    if (!normalizedPayload.cpfCnpj) {
      throw new ValidationError('CPF/CNPJ obrigatório', ['Informe o CPF/CNPJ.']);
    }

    if (!isValidCpfCnpj(normalizedPayload.cpfCnpj)) {
      throw new ValidationError('CPF/CNPJ inválido', ['Informe um CPF ou CNPJ válido para continuar.']);
    }

    if (normalizedPayload.whatsapp.length < 10 || normalizedPayload.whatsapp.length > 18) {
      throw new ValidationError('WhatsApp inválido', ['Informe um telefone/WhatsApp com DDD válido.']);
    }

    currentStage.value = 'load_current_account';
    const currentUser = await barbershopSettingsRepository.findAccountUserById(barbershopId, userId) as Record<string, unknown> | null;
    const currentProfile = await barbershopSettingsRepository.findAccountProfileByUserId(barbershopId, userId) as Record<string, unknown> | null;

    logger.info(
      {
        operation: 'updateAccountProfile',
        stage: currentStage.value,
        authUser: summarizeUserForLog({ barbershopId, userId, role }),
        resolvedUser: summarizeUserForLog(currentUser ?? undefined),
        resolvedTenantProfile: summarizeAccountPayloadForLog(currentProfile ?? undefined),
      },
      'Dados atuais da conta carregados para atualizacao cadastral'
    );

    if (!currentUser || !currentProfile) {
      throw new NotFoundError('Conta');
    }

    const currentEmailNormalized = normalizeEmail(currentUser.email);
    const emailChanged = normalizedPayload.email !== currentEmailNormalized;

    logger.info(
      {
        operation: 'updateAccountProfile',
        stage: 'compare_email_state',
        currentUserId: currentUser.userId || userId,
        currentEmailNormalized: maskEmailForLog(currentEmailNormalized),
        nextEmailNormalized: maskEmailForLog(normalizedPayload.email),
        emailChanged,
      },
      'Estado do e-mail comparado antes da validacao de conflito'
    );

    if (emailChanged) {
      currentStage.value = 'check_email_conflict';
      const conflictingUser = await (authRepository as unknown as {
        findOtherUserByEmail: (email: string, userId: string) => Promise<Record<string, unknown> | null>;
      }).findOtherUserByEmail(normalizedPayload.email, userId);

      logger.info(
        {
          operation: 'updateAccountProfile',
          stage: currentStage.value,
          currentUserId: currentUser.userId || userId,
          currentEmailNormalized: maskEmailForLog(currentEmailNormalized),
          nextEmailNormalized: maskEmailForLog(normalizedPayload.email),
          emailChanged,
          conflictUserId: (conflictingUser as Record<string, unknown> | null)?.id || null,
        },
        'Resultado da validacao de unicidade do e-mail'
      );

      if (conflictingUser) {
        throw new ConflictError('Este e-mail já está em uso por outra conta.');
      }
    }

    const client = await (authRepository as unknown as { getClient: () => Promise<unknown> }).getClient();
    let supabaseEmailUpdated = false;

    try {
      if (emailChanged && currentUser.supabaseUserId) {
        currentStage.value = 'update_supabase_email';
        await (supabaseAuthService as unknown as {
          updateUserEmailById: (id: string, email: string) => Promise<void>;
        }).updateUserEmailById(currentUser.supabaseUserId as string, normalizedPayload.email);
        supabaseEmailUpdated = true;
      }

      currentStage.value = 'begin_transaction';
      if (client && typeof (client as Record<string, unknown>).query === 'function') {
        await (client as { query: (sql: string) => Promise<unknown> }).query('BEGIN');
      }

      currentStage.value = 'update_local_profile';
      const updatedProfile = await barbershopSettingsRepository.updateAccountProfile(
        barbershopId,
        userId,
        {
          ...normalizedPayload,
          emailChanged,
        },
        client
      );

      if (!updatedProfile) {
        throw new NotFoundError('Conta');
      }

      currentStage.value = 'load_session_user';
      const sessionUser = await barbershopSettingsRepository.findAccountUserById(barbershopId, userId, client);

      currentStage.value = 'commit_transaction';
      if (client && typeof (client as Record<string, unknown>).query === 'function') {
        await (client as { query: (sql: string) => Promise<unknown> }).query('COMMIT');
      }

      logger.info(
        {
          operation: 'updateAccountProfile',
          stage: 'completed',
          authUser: summarizeUserForLog({ barbershopId, userId, role }),
          updatedProfile: summarizeAccountPayloadForLog(updatedProfile as Record<string, unknown>),
          emailChanged,
          supabaseEmailUpdated,
        },
        'Dados cadastrais atualizados com sucesso'
      );

      return {
        profile: updatedProfile,
        sessionUser,
        emailChanged,
      };
    } catch (error) {
      try {
        if (client && typeof (client as Record<string, unknown>).query === 'function') {
          await (client as { query: (sql: string) => Promise<unknown> }).query('ROLLBACK');
        }
      } catch (rollbackError) {
        logger.error(
          {
            err: rollbackError,
            operation: 'updateAccountProfile',
            stage: currentStage.value,
            authUser: summarizeUserForLog({ barbershopId, userId, role }),
          },
          'Falha ao executar rollback da atualizacao cadastral'
        );
      }

      if (supabaseEmailUpdated && currentUser.supabaseUserId) {
        try {
          await (supabaseAuthService as unknown as {
            updateUserEmailById: (id: string, email: string) => Promise<void>;
          }).updateUserEmailById(currentUser.supabaseUserId as string, currentEmailNormalized);
          logger.warn(
            {
              operation: 'updateAccountProfile',
              stage: 'compensate_supabase_email',
              authUser: summarizeUserForLog({ barbershopId, userId, role }),
              restoredEmail: maskEmailForLog(currentEmailNormalized),
            },
            'E-mail do Supabase restaurado apos falha no banco local'
          );
        } catch (revertError) {
          logger.error(
            {
              err: revertError,
              operation: 'updateAccountProfile',
              stage: 'compensate_supabase_email',
              authUser: summarizeUserForLog({ barbershopId, userId, role }),
              attemptedRestoreEmail: maskEmailForLog(currentEmailNormalized),
            },
            'Falha ao restaurar e-mail no Supabase apos erro local'
          );
        }
      }

      if (isEmailUniqueViolation(error)) {
        throw new ConflictError('Este e-mail já está em uso por outra conta.');
      }

      if (isMissingColumnError(error)) {
        logger.error(
          {
            err: error,
            operation: 'updateAccountProfile',
            stage: currentStage.value,
            authUser: summarizeUserForLog({ barbershopId, userId, role }),
          },
          'Estrutura do banco incompatível com a atualização cadastral'
        );
      } else {
        logger.error(
          {
            err: error,
            operation: 'updateAccountProfile',
            stage: currentStage.value,
            authUser: summarizeUserForLog({ barbershopId, userId, role }),
            payload: summarizeAccountPayloadForLog(normalizedPayload as Record<string, unknown>),
          },
          'Falha ao atualizar dados cadastrais'
        );
      }

      throw error;
    } finally {
      if (client && typeof (client as Record<string, unknown>).release === 'function') {
        (client as { release: () => void }).release();
      }
    }
  },

  async updatePassword({ barbershopId, userId, role }: AuthContext, data: PasswordData): Promise<{
    message: string;
    sessionUser: unknown;
  }> {
    ensureTenantAdmin(role);

    const user = await barbershopSettingsRepository.findAccountUserById(barbershopId, userId) as Record<string, unknown> | null;

    if (!user) {
      throw new NotFoundError('Conta');
    }

    const authProvider = String(user.authProvider || '').trim().toLowerCase();
    const currentPassword = String(data.currentPassword || '');
    const newPassword = String(data.newPassword || '');

    if (authProvider === 'supabase' || user.supabaseUserId) {
      await (supabaseAuthService as unknown as {
        signInWithPassword: (email: string, password: string) => Promise<void>;
      }).signInWithPassword(user.email as string, currentPassword);
    } else {
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, (user.passwordHash as string) || '');

      if (!isCurrentPasswordValid) {
        throw new ValidationError('Senha atual incorreta', ['Confirme a senha atual para continuar.']);
      }
    }

    const currentMatchesNew = await bcrypt.compare(newPassword, (user.passwordHash as string) || '');
    if (currentMatchesNew) {
      throw new ValidationError('Nova senha inválida', ['A nova senha deve ser diferente da senha atual.']);
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    const client = await (authRepository as unknown as { getClient: () => Promise<unknown> }).getClient();

    try {
      if (client && typeof (client as Record<string, unknown>).query === 'function') {
        await (client as { query: (sql: string) => Promise<unknown> }).query('BEGIN');
      }

      if (user.supabaseUserId) {
        await (supabaseAuthService as unknown as {
          updateUserPasswordById: (id: string, password: string) => Promise<void>;
        }).updateUserPasswordById(user.supabaseUserId as string, newPassword);
      }

      const updatedPassword = await barbershopSettingsRepository.updateUserPassword(
        barbershopId,
        userId,
        passwordHash,
        client
      );

      if (!updatedPassword) {
        throw new NotFoundError('Conta');
      }

      const sessionUser = await barbershopSettingsRepository.findAccountUserById(barbershopId, userId, client);

      if (client && typeof (client as Record<string, unknown>).query === 'function') {
        await (client as { query: (sql: string) => Promise<unknown> }).query('COMMIT');
      }

      return {
        message: 'Senha alterada com sucesso.',
        sessionUser,
      };
    } catch (error) {
      if (client && typeof (client as Record<string, unknown>).query === 'function') {
        await (client as { query: (sql: string) => Promise<unknown> }).query('ROLLBACK');
      }
      throw error;
    } finally {
      if (client && typeof (client as Record<string, unknown>).release === 'function') {
        (client as { release: () => void }).release();
      }
    }
  },
};
