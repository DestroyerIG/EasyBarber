import { barbershopSettingsRepository } from '../repositories/barbershopSettingsRepository.js';
import bcrypt from 'bcryptjs';
import { authRepository } from '../repositories/authRepository.js';
import { supabaseAuthService } from './supabaseAuthService.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
import { isValidCpfCnpj, normalizeDocumentDigits } from '../utils/cpfCnpj.js';
import { normalizeWhatsAppInstanceName } from './whatsapp/whatsappInstanceService.js';
import logger from '../utils/logger.js';

const ALLOWED_SLOT_INTERVALS = new Set([15, 20, 30, 45, 60]);
const TENANT_ACCOUNT_ROLE = 'tenant_admin';

const toMinutes = (timeValue) => {
  const [hours, minutes] = timeValue.split(':').map(Number);
  return (hours * 60) + minutes;
};

const normalizeOptionalInstanceName = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return normalizeWhatsAppInstanceName(String(value));
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeText = (value) => String(value || '').trim();

const normalizePhoneDigits = (value) => {
  const digits = String(value || '').replace(/\D+/g, '');
  return digits || '';
};

const maskEmailForLog = (value) => {
  const normalizedValue = normalizeEmail(value);

  if (!normalizedValue || !normalizedValue.includes('@')) {
    return null;
  }

  const [localPart, domain] = normalizedValue.split('@');
  const visibleLocal = localPart.slice(0, 2);

  return `${visibleLocal}${'*'.repeat(Math.max(localPart.length - visibleLocal.length, 0))}@${domain}`;
};

const maskDigitsForLog = (value, visibleSuffix = 4) => {
  const digits = String(value || '').replace(/\D+/g, '');

  if (!digits) {
    return null;
  }

  const suffix = digits.slice(-visibleSuffix);
  return `${'*'.repeat(Math.max(digits.length - suffix.length, 0))}${suffix}`;
};

const summarizeAccountPayloadForLog = (payload) => ({
  barbershopName: normalizeText(payload?.barbershopName) || null,
  ownerName: normalizeText(payload?.ownerName) || null,
  email: maskEmailForLog(payload?.email),
  whatsapp: maskDigitsForLog(payload?.whatsapp),
  cpfCnpj: maskDigitsForLog(payload?.cpfCnpj),
});

const summarizeUserForLog = (user) => ({
  userId: user?.userId || null,
  barbershopId: user?.barbershopId || null,
  role: user?.role || null,
  email: maskEmailForLog(user?.email),
});

const isUniqueViolation = (error) => error?.code === '23505';
const EMAIL_UNIQUE_CONSTRAINTS = new Set([
  'users_email_key',
  'barbershops_email_key',
]);

const isEmailUniqueViolation = (error) => {
  if (!isUniqueViolation(error)) {
    return false;
  }

  const constraint = String(error?.constraint || '').trim();
  return EMAIL_UNIQUE_CONSTRAINTS.has(constraint);
};

const isMissingColumnError = (error) => error?.code === '42703';

const ensureTenantAdmin = (role) => {
  if (String(role || '').trim().toLowerCase() !== TENANT_ACCOUNT_ROLE) {
    throw new ForbiddenError('Apenas o administrador da conta pode alterar os dados cadastrais.');
  }
};

export const barbershopSettingsService = {
  async getSettings(barbershopId) {
    const settings = await barbershopSettingsRepository.findByBarbershopId(barbershopId);
    if (!settings) {
      throw new NotFoundError('Barbearia');
    }
    return settings;
  },

  async updateSettings(barbershopId, data) {
    if (!ALLOWED_SLOT_INTERVALS.has(data.slotIntervalMinutes)) {
      throw new ValidationError('Intervalo de agenda inválido', ['Use 15, 20, 30, 45 ou 60 minutos.']);
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

    let settings;

    try {
      settings = await barbershopSettingsRepository.upsert(barbershopId, payload);
    } catch (error) {
      const uniqueViolation = error?.code === '23505';
      const conflictingConstraint = String(error?.constraint || '').trim();

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

  async getProfile(barbershopId) {
    const profile = await barbershopSettingsRepository.findProfileByBarbershopId(barbershopId);
    if (!profile) {
      throw new NotFoundError('Barbearia');
    }

    return profile;
  },

  async updateProfile(barbershopId, data) {
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

  async getAccountProfile({ barbershopId, userId, role }) {
    ensureTenantAdmin(role);

    const profile = await barbershopSettingsRepository.findAccountProfileByUserId(barbershopId, userId);

    if (!profile) {
      throw new NotFoundError('Conta');
    }

    return profile;
  },

  async updateAccountProfile({ barbershopId, userId, role }, data) {
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
        payload: summarizeAccountPayloadForLog(normalizedPayload),
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
    const currentUser = await barbershopSettingsRepository.findAccountUserById(barbershopId, userId);
    const currentProfile = await barbershopSettingsRepository.findAccountProfileByUserId(barbershopId, userId);

    logger.info(
      {
        operation: 'updateAccountProfile',
        stage: currentStage.value,
        authUser: summarizeUserForLog({ barbershopId, userId, role }),
        resolvedUser: summarizeUserForLog(currentUser),
        resolvedTenantProfile: summarizeAccountPayloadForLog(currentProfile),
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
      const conflictingUser = await authRepository.findOtherUserByEmail(normalizedPayload.email, userId);

      logger.info(
        {
          operation: 'updateAccountProfile',
          stage: currentStage.value,
          currentUserId: currentUser.userId || userId,
          currentEmailNormalized: maskEmailForLog(currentEmailNormalized),
          nextEmailNormalized: maskEmailForLog(normalizedPayload.email),
          emailChanged,
          conflictUserId: conflictingUser?.id || null,
        },
        'Resultado da validacao de unicidade do e-mail'
      );

      if (conflictingUser) {
        throw new ConflictError('Este e-mail já está em uso por outra conta.');
      }
    }

    const client = await authRepository.getClient();
    let supabaseEmailUpdated = false;

    try {
      if (emailChanged && currentUser.supabaseUserId) {
        currentStage.value = 'update_supabase_email';
        await supabaseAuthService.updateUserEmailById(currentUser.supabaseUserId, normalizedPayload.email);
        supabaseEmailUpdated = true;
      }

      currentStage.value = 'begin_transaction';
      await client.query('BEGIN');

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
      await client.query('COMMIT');

      logger.info(
        {
          operation: 'updateAccountProfile',
          stage: 'completed',
          authUser: summarizeUserForLog({ barbershopId, userId, role }),
          updatedProfile: summarizeAccountPayloadForLog(updatedProfile),
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
        await client.query('ROLLBACK');
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
          await supabaseAuthService.updateUserEmailById(currentUser.supabaseUserId, currentEmailNormalized);
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
            payload: summarizeAccountPayloadForLog(normalizedPayload),
          },
          'Falha ao atualizar dados cadastrais'
        );
      }

      throw error;
    } finally {
      client.release();
    }
  },

  async updatePassword({ barbershopId, userId, role }, data) {
    ensureTenantAdmin(role);

    const user = await barbershopSettingsRepository.findAccountUserById(barbershopId, userId);

    if (!user) {
      throw new NotFoundError('Conta');
    }

    const authProvider = String(user.authProvider || '').trim().toLowerCase();
    const currentPassword = String(data.currentPassword || '');
    const newPassword = String(data.newPassword || '');

    if (authProvider === 'supabase' || user.supabaseUserId) {
      await supabaseAuthService.signInWithPassword(user.email, currentPassword);
    } else {
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash || '');

      if (!isCurrentPasswordValid) {
        throw new ValidationError('Senha atual incorreta', ['Confirme a senha atual para continuar.']);
      }
    }

    const currentMatchesNew = await bcrypt.compare(newPassword, user.passwordHash || '');
    if (currentMatchesNew) {
      throw new ValidationError('Nova senha inválida', ['A nova senha deve ser diferente da senha atual.']);
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    const client = await authRepository.getClient();

    try {
      await client.query('BEGIN');

      if (user.supabaseUserId) {
        await supabaseAuthService.updateUserPasswordById(user.supabaseUserId, newPassword);
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

      await client.query('COMMIT');

      return {
        message: 'Senha alterada com sucesso.',
        sessionUser,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
};
