import { barbershopSettingsRepository } from '../repositories/barbershopSettingsRepository.js';
import bcrypt from 'bcryptjs';
import { authRepository } from '../repositories/authRepository.js';
import { supabaseAuthService } from './supabaseAuthService.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
import { isValidCpfCnpj, normalizeDocumentDigits } from '../utils/cpfCnpj.js';
import { normalizeWhatsAppInstanceName } from './whatsapp/whatsappInstanceService.js';

const ALLOWED_SLOT_INTERVALS = new Set([15, 20, 30, 45, 60]);
const TENANT_ACCOUNT_ROLE = 'tenant_admin';

const toMinutes = (timeValue) => {
  const [hours, minutes] = timeValue.split(':').map(Number);
  return (hours * 60) + minutes;
};

const normalizeOptionalText = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
};

const normalizeOptionalInstanceName = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return normalizeWhatsAppInstanceName(String(value));
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const normalizePhoneDigits = (value) => {
  const digits = String(value || '').replace(/\D+/g, '');
  return digits || '';
};

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
      shopName: data.shopName.trim(),
      whatsappInstanceName: normalizeOptionalInstanceName(data.whatsappInstanceName),
      contactPhone: normalizeOptionalText(data.contactPhone),
      address: normalizeOptionalText(data.address),
      openingTime: data.openingTime,
      closingTime: data.closingTime,
      slotIntervalMinutes: data.slotIntervalMinutes,
      allowWalkins: data.allowWalkins,
      autoConfirmAppointments: data.autoConfirmAppointments,
      emailReminders: data.emailReminders,
      whatsappReminders: data.whatsappReminders,
      googleCalendarEnabled: data.googleCalendarEnabled,
      customWebhookUrl: normalizeOptionalText(data.customWebhookUrl) || null,
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

    const normalizedEmail = normalizeEmail(data.email);
    const normalizedWhatsapp = normalizePhoneDigits(data.whatsapp);
    const normalizedCpfCnpj = normalizeDocumentDigits(data.cpfCnpj);

    if (!isValidCpfCnpj(normalizedCpfCnpj)) {
      throw new ValidationError('CPF/CNPJ inválido', ['Informe um CPF ou CNPJ válido para continuar.']);
    }

    if (normalizedWhatsapp.length < 10 || normalizedWhatsapp.length > 18) {
      throw new ValidationError('WhatsApp inválido', ['Informe um telefone/WhatsApp com DDD válido.']);
    }

    const currentUser = await barbershopSettingsRepository.findAccountUserById(barbershopId, userId);

    if (!currentUser) {
      throw new NotFoundError('Conta');
    }

    if (normalizedEmail !== currentUser.email) {
      const conflictingUser = await authRepository.findAnyUserByEmail(normalizedEmail);

      if (conflictingUser && conflictingUser.id !== userId) {
        throw new ConflictError('Este e-mail já está em uso por outra conta.');
      }
    }

    const client = await authRepository.getClient();

    try {
      await client.query('BEGIN');

      if (normalizedEmail !== currentUser.email && currentUser.supabaseUserId) {
        await supabaseAuthService.updateUserEmailById(currentUser.supabaseUserId, normalizedEmail);
      }

      const updatedProfile = await barbershopSettingsRepository.updateAccountProfile(
        barbershopId,
        userId,
        {
          barbershopName: data.barbershopName.trim(),
          ownerName: data.ownerName.trim(),
          whatsapp: normalizedWhatsapp,
          cpfCnpj: normalizedCpfCnpj,
          email: normalizedEmail,
        },
        client
      );

      if (!updatedProfile) {
        throw new NotFoundError('Conta');
      }

      const sessionUser = await barbershopSettingsRepository.findAccountUserById(barbershopId, userId, client);

      await client.query('COMMIT');

      return {
        profile: updatedProfile,
        sessionUser,
        emailChanged: normalizedEmail !== currentUser.email,
      };
    } catch (error) {
      await client.query('ROLLBACK');
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
