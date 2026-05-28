import { prisma } from '../config/prisma.js';
import { Prisma } from '@prisma/client';

const mapRowToSettings = (row: Record<string, unknown>) => ({
  whatsappInstanceName: row.whatsapp_instance_name,
  diasAbertos: row.dias_abertos,
  openingTime: row.opening_time,
  closingTime: row.closing_time,
  slotIntervalMinutes: row.slot_interval_minutes,
  allowWalkins: row.allow_walkins,
  autoConfirmAppointments: row.auto_confirm_appointments,
  emailReminders: row.email_reminders,
  whatsappReminders: row.whatsapp_reminders,
  googleCalendarEnabled: row.google_calendar_enabled,
  customWebhookUrl: row.custom_webhook_url,
});

const mapRowToProfile = (row: Record<string, unknown>) => ({
  cpfCnpj: row.cpf_cnpj || null,
});

const mapRowToAccountProfile = (row: Record<string, unknown>) => ({
  barbershopName: row.barbershop_name,
  ownerName: row.owner_name,
  whatsapp: row.whatsapp || '',
  cpfCnpj: row.cpf_cnpj || '',
  email: row.email,
});

const mapRowToAccountUser = (row: Record<string, unknown>) => ({
  userId: row.user_id,
  barbershopId: row.barbershop_id,
  role: row.role,
  email: row.email,
  passwordHash: row.password_hash,
  authProvider: row.auth_provider || 'legacy',
  supabaseUserId: row.supabase_user_id || null,
  emailVerified: row.email_verified,
  plan: row.plan,
  barbershopName: row.barbershop_name,
  subscriptionStatus: row.subscription_status,
  subscriptionCurrentPeriodEnd: row.subscription_current_period_end,
});

const mapRowToOperationalSettings = (row: Record<string, unknown>) => ({
  openingTime: row.opening_time,
  closingTime: row.closing_time,
  slotIntervalMinutes: row.slot_interval_minutes,
  diasAbertos: row.dias_abertos,
  allowWalkins: row.allow_walkins,
  autoConfirmAppointments: row.auto_confirm_appointments,
  timezone: row.timezone,
});

export const barbershopSettingsRepository = {
  async findByBarbershopId(barbershopId: unknown, _executor: unknown = null) {
    const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT
         COALESCE(NULLIF(b.whatsapp_instance_name, ''), '') AS whatsapp_instance_name,
         COALESCE(to_char(s.opening_time, 'HH24:MI'), '09:00') AS opening_time,
         COALESCE(to_char(s.closing_time, 'HH24:MI'), '20:00') AS closing_time,
         COALESCE(s.slot_interval_minutes, 30) AS slot_interval_minutes,
         COALESCE(s.dias_abertos, ARRAY['seg','ter','qua','qui','sex']::text[]) AS dias_abertos,
         COALESCE(s.allow_walkins, true) AS allow_walkins,
         COALESCE(s.auto_confirm_appointments, false) AS auto_confirm_appointments,
         COALESCE(s.email_reminders, true) AS email_reminders,
         COALESCE(s.whatsapp_reminders, true) AS whatsapp_reminders,
         COALESCE(s.google_calendar_enabled, false) AS google_calendar_enabled,
         COALESCE(s.custom_webhook_url, '') AS custom_webhook_url
       FROM barbershops b
       LEFT JOIN barbershop_settings s ON s.barbershop_id = b.id
       WHERE b.id = ${barbershopId}::uuid AND b.active = true
    `);

    if (result.length === 0) {
      return null;
    }

    return mapRowToSettings(result[0]!);
  },

  async findOperationalSettingsByBarbershopId(barbershopId: unknown, _executor: unknown = null) {
    const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT
         to_char(s.opening_time, 'HH24:MI') AS opening_time,
         to_char(s.closing_time, 'HH24:MI') AS closing_time,
         s.slot_interval_minutes,
         COALESCE(s.dias_abertos, ARRAY['seg','ter','qua','qui','sex']::text[]) AS dias_abertos,
         s.allow_walkins,
         s.auto_confirm_appointments,
         COALESCE(NULLIF(to_jsonb(s) ->> 'timezone', ''), NULLIF(to_jsonb(b) ->> 'timezone', '')) AS timezone
       FROM barbershops b
       LEFT JOIN barbershop_settings s ON s.barbershop_id = b.id
       WHERE b.id = ${barbershopId}::uuid AND b.active = true
       LIMIT 1
    `);

    if (result.length === 0) {
      return null;
    }

    return mapRowToOperationalSettings(result[0]!);
  },

  async findProfileByBarbershopId(barbershopId: unknown, _executor: unknown = null) {
    const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT b.cpf_cnpj
       FROM barbershops b
       WHERE b.id = ${barbershopId}::uuid
         AND b.active = true
    `);

    if (result.length === 0) {
      return null;
    }

    return mapRowToProfile(result[0]!);
  },

  async findAccountProfileByUserId(barbershopId: unknown, userId: unknown, _executor: unknown = null) {
    const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT
         b.name AS barbershop_name,
         b.owner_name,
         COALESCE(b.whatsapp, '') AS whatsapp,
         COALESCE(b.cpf_cnpj, '') AS cpf_cnpj,
         u.email
       FROM users u
       JOIN barbershops b ON b.id = u.barbershop_id
       WHERE u.id = ${userId}::uuid
         AND u.barbershop_id = ${barbershopId}::uuid
         AND u.blocked = false
         AND b.active = true
       LIMIT 1
    `);

    if (result.length === 0) {
      return null;
    }

    return mapRowToAccountProfile(result[0]!);
  },

  async findAccountUserById(barbershopId: unknown, userId: unknown, _executor: unknown = null) {
    try {
      const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT
           u.id AS user_id,
           u.barbershop_id,
           u.role,
           u.email,
           u.password_hash,
           u.email_verified,
           u.supabase_user_id,
           u.auth_provider,
           b.plan,
           b.name AS barbershop_name,
           b.subscription_status,
           b.subscription_current_period_end
         FROM users u
         JOIN barbershops b ON b.id = u.barbershop_id
         WHERE u.id = ${userId}::uuid
           AND u.barbershop_id = ${barbershopId}::uuid
           AND u.blocked = false
           AND b.active = true
         LIMIT 1
      `);

      if (result.length === 0) {
        return null;
      }

      return mapRowToAccountUser(result[0]!);
    } catch (error: unknown) {
      if ((error as { code?: string })?.code !== '42703') {
        throw error;
      }

      const legacyResult = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT
           u.id AS user_id,
           u.barbershop_id,
           u.role,
           u.email,
           u.password_hash,
           u.email_verified,
           NULL::UUID AS supabase_user_id,
           'legacy'::VARCHAR AS auth_provider,
           b.plan,
           b.name AS barbershop_name,
           b.subscription_status,
           b.subscription_current_period_end
         FROM users u
         JOIN barbershops b ON b.id = u.barbershop_id
         WHERE u.id = ${userId}::uuid
           AND u.barbershop_id = ${barbershopId}::uuid
           AND u.blocked = false
           AND b.active = true
         LIMIT 1
      `);

      if (legacyResult.length === 0) {
        return null;
      }

      return mapRowToAccountUser(legacyResult[0]!);
    }
  },

  async findWhatsAppInstanceContextByBarbershopId(barbershopId: unknown, _executor: unknown = null) {
    const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT id,
              name,
              active,
              whatsapp_instance_name
         FROM barbershops
        WHERE id = ${barbershopId}::uuid
        LIMIT 1
    `);

    if (result.length === 0) {
      return null;
    }

    const row0 = result[0]!;
    return {
      id: row0.id,
      name: row0.name,
      active: row0.active,
      whatsappInstanceName: row0.whatsapp_instance_name ?? null,
    };
  },

  async updateProfile(barbershopId: unknown, payload: { cpfCnpj: unknown }, _executor: unknown = null) {
    const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      UPDATE barbershops
       SET cpf_cnpj = ${payload.cpfCnpj},
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ${barbershopId}::uuid
         AND active = true
       RETURNING cpf_cnpj
    `);

    if (result.length === 0) {
      return null;
    }

    return mapRowToProfile(result[0]!);
  },

  async updateAccountProfile(
    barbershopId: unknown,
    userId: unknown,
    payload: {
      emailChanged?: boolean;
      barbershopName: unknown;
      ownerName: unknown;
      whatsapp: unknown;
      cpfCnpj: unknown;
      email?: unknown;
    },
    _executor: unknown = null,
  ) {
    const shouldUpdateEmail = payload.emailChanged === true;

    let barbershopResult: Array<Record<string, unknown>>;

    if (shouldUpdateEmail) {
      barbershopResult = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        UPDATE barbershops
         SET name = ${payload.barbershopName},
             owner_name = ${payload.ownerName},
             whatsapp = ${payload.whatsapp},
             cpf_cnpj = ${payload.cpfCnpj},
             email = ${payload.email},
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ${barbershopId}::uuid
           AND active = true
           AND EXISTS (
             SELECT 1
             FROM users u
             WHERE u.id = ${userId}::uuid
               AND u.barbershop_id = ${barbershopId}::uuid
               AND u.blocked = false
           )
         RETURNING id
      `);
    } else {
      barbershopResult = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        UPDATE barbershops
         SET name = ${payload.barbershopName},
             owner_name = ${payload.ownerName},
             whatsapp = ${payload.whatsapp},
             cpf_cnpj = ${payload.cpfCnpj},
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ${barbershopId}::uuid
           AND active = true
           AND EXISTS (
             SELECT 1
             FROM users u
             WHERE u.id = ${userId}::uuid
               AND u.barbershop_id = ${barbershopId}::uuid
               AND u.blocked = false
           )
         RETURNING id
      `);
    }

    if (barbershopResult.length === 0) {
      return null;
    }

    if (shouldUpdateEmail) {
      await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        UPDATE users
         SET email = ${payload.email},
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ${userId}::uuid
           AND barbershop_id = ${barbershopId}::uuid
           AND blocked = false
      `);
    }

    return barbershopSettingsRepository.findAccountProfileByUserId(barbershopId, userId);
  },

  async updateUserPassword(barbershopId: unknown, userId: unknown, passwordHash: unknown, _executor: unknown = null) {
    const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      UPDATE users
       SET password_hash = ${passwordHash},
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ${userId}::uuid
         AND barbershop_id = ${barbershopId}::uuid
         AND blocked = false
       RETURNING id
    `);

    return result[0] ?? null;
  },

  async upsert(
    barbershopId: unknown,
    payload: {
      whatsappInstanceName: unknown;
      openingTime: unknown;
      closingTime: unknown;
      slotIntervalMinutes: unknown;
      diasAbertos: unknown;
      allowWalkins: unknown;
      autoConfirmAppointments: unknown;
      emailReminders: unknown;
      whatsappReminders: unknown;
      googleCalendarEnabled: unknown;
      customWebhookUrl: unknown;
    },
  ) {
    // Transaction support deferred — run as sequential queries
    const barbershopResult = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      UPDATE barbershops
       SET whatsapp_instance_name = NULLIF(lower(btrim(${payload.whatsappInstanceName}::text)), '')
       WHERE id = ${barbershopId}::uuid AND active = true
       RETURNING id
    `);

    if (barbershopResult.length === 0) {
      return null;
    }

    await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      INSERT INTO barbershop_settings (
         barbershop_id,
         opening_time,
         closing_time,
         slot_interval_minutes,
         dias_abertos,
         allow_walkins,
         auto_confirm_appointments,
         email_reminders,
         whatsapp_reminders,
         google_calendar_enabled,
         custom_webhook_url
       ) VALUES (
         ${barbershopId}::uuid,
         ${payload.openingTime}::time,
         ${payload.closingTime}::time,
         ${payload.slotIntervalMinutes},
         ${payload.diasAbertos},
         ${payload.allowWalkins},
         ${payload.autoConfirmAppointments},
         ${payload.emailReminders},
         ${payload.whatsappReminders},
         ${payload.googleCalendarEnabled},
         ${payload.customWebhookUrl}
       )
       ON CONFLICT (barbershop_id) DO UPDATE SET
         opening_time = EXCLUDED.opening_time,
         closing_time = EXCLUDED.closing_time,
         slot_interval_minutes = EXCLUDED.slot_interval_minutes,
         dias_abertos = EXCLUDED.dias_abertos,
         allow_walkins = EXCLUDED.allow_walkins,
         auto_confirm_appointments = EXCLUDED.auto_confirm_appointments,
         email_reminders = EXCLUDED.email_reminders,
         whatsapp_reminders = EXCLUDED.whatsapp_reminders,
         google_calendar_enabled = EXCLUDED.google_calendar_enabled,
         custom_webhook_url = EXCLUDED.custom_webhook_url,
         updated_at = CURRENT_TIMESTAMP
    `);

    return barbershopSettingsRepository.findByBarbershopId(barbershopId);
  },

  async findByWhatsAppInstanceName(instanceName: unknown, _executor: unknown = null) {
    if (typeof instanceName !== 'string') {
      return null;
    }

    const normalizedInstanceName = instanceName.trim().toLowerCase();

    if (!normalizedInstanceName) {
      return null;
    }

    const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT id,
              name,
              whatsapp_instance_name
         FROM barbershops
        WHERE active = true
          AND NULLIF(btrim(whatsapp_instance_name), '') IS NOT NULL
          AND lower(btrim(whatsapp_instance_name)) = ${normalizedInstanceName}
        LIMIT 1
    `);

    if (result.length === 0) {
      return null;
    }

    const found = result[0]!;
    return {
      id: found.id,
      name: found.name,
      whatsappInstanceName: found.whatsapp_instance_name,
    };
  },

  async ensureWhatsAppInstanceName(
    barbershopId: unknown,
    buildInstanceName: (ctx: { id: unknown; name: unknown }) => unknown,
  ) {
    // Transaction support deferred — FOR UPDATE lock omitted; run as sequential queries
    const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT id,
              name,
              active,
              whatsapp_instance_name
         FROM barbershops
        WHERE id = ${barbershopId}::uuid
    `);

    if (!result.length || result[0]!.active !== true) {
      return null;
    }

    const current = result[0]!;
    const currentInstanceName =
      typeof current.whatsapp_instance_name === 'string'
        ? current.whatsapp_instance_name.trim().toLowerCase()
        : '';

    if (currentInstanceName) {
      return {
        id: current.id,
        name: current.name,
        active: current.active,
        whatsappInstanceName: currentInstanceName,
        createdNow: false,
      };
    }

    const nextInstanceName = buildInstanceName({
      id: current.id,
      name: current.name,
    });

    const updateResult = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      UPDATE barbershops
          SET whatsapp_instance_name = ${nextInstanceName},
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ${barbershopId}::uuid
        RETURNING id, name, active, whatsapp_instance_name
    `);

    const updated = updateResult[0]!;
    return {
      id: updated.id,
      name: updated.name,
      active: updated.active,
      whatsappInstanceName: updated.whatsapp_instance_name,
      createdNow: true,
    };
  },

  async findWhatsAppInstanceNameDiagnostics(instanceName: unknown, _executor: unknown = null) {
    if (typeof instanceName !== 'string') {
      return [];
    }

    const normalizedInstanceName = instanceName.trim().toLowerCase();

    if (!normalizedInstanceName) {
      return [];
    }

    const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT id,
              name,
              active,
              whatsapp,
              whatsapp_instance_name
         FROM barbershops
        WHERE NULLIF(btrim(whatsapp_instance_name), '') IS NOT NULL
          AND lower(btrim(whatsapp_instance_name)) = ${normalizedInstanceName}
        ORDER BY active DESC, created_at ASC NULLS LAST, id ASC
        LIMIT 5
    `);

    return result.map((row) => ({
      id: row.id,
      name: row.name,
      active: row.active,
      whatsapp: row.whatsapp,
      whatsappInstanceName: row.whatsapp_instance_name,
    }));
  },
};
