import { BaseRepository } from './BaseRepository.js';

const mapRowToSettings = (row) => ({
  whatsappInstanceName: row.whatsapp_instance_name,
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

const mapRowToProfile = (row) => ({
  cpfCnpj: row.cpf_cnpj || null,
});

const mapRowToAccountProfile = (row) => ({
  barbershopName: row.barbershop_name,
  ownerName: row.owner_name,
  whatsapp: row.whatsapp || '',
  cpfCnpj: row.cpf_cnpj || '',
  email: row.email,
});

const mapRowToAccountUser = (row) => ({
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

const mapRowToOperationalSettings = (row) => ({
  openingTime: row.opening_time,
  closingTime: row.closing_time,
  slotIntervalMinutes: row.slot_interval_minutes,
  allowWalkins: row.allow_walkins,
  autoConfirmAppointments: row.auto_confirm_appointments,
  timezone: row.timezone,
});

class BarbershopSettingsRepository extends BaseRepository {
  constructor() {
    super('barbershop_settings');
  }

  async findByBarbershopId(barbershopId, executor = this.pool) {
    const result = await executor.query(
      `SELECT
         COALESCE(NULLIF(b.whatsapp_instance_name, ''), '') AS whatsapp_instance_name,
         COALESCE(to_char(s.opening_time, 'HH24:MI'), '09:00') AS opening_time,
         COALESCE(to_char(s.closing_time, 'HH24:MI'), '20:00') AS closing_time,
         COALESCE(s.slot_interval_minutes, 30) AS slot_interval_minutes,
         COALESCE(s.allow_walkins, true) AS allow_walkins,
         COALESCE(s.auto_confirm_appointments, false) AS auto_confirm_appointments,
         COALESCE(s.email_reminders, true) AS email_reminders,
         COALESCE(s.whatsapp_reminders, true) AS whatsapp_reminders,
         COALESCE(s.google_calendar_enabled, false) AS google_calendar_enabled,
         COALESCE(s.custom_webhook_url, '') AS custom_webhook_url
       FROM barbershops b
       LEFT JOIN barbershop_settings s ON s.barbershop_id = b.id
       WHERE b.id = $1 AND b.active = true`,
      [barbershopId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return mapRowToSettings(result.rows[0]);
  }

  async findOperationalSettingsByBarbershopId(barbershopId, executor = this.pool) {
    const result = await executor.query(
      `SELECT
         to_char(s.opening_time, 'HH24:MI') AS opening_time,
         to_char(s.closing_time, 'HH24:MI') AS closing_time,
         s.slot_interval_minutes,
         s.allow_walkins,
         s.auto_confirm_appointments,
         COALESCE(NULLIF(to_jsonb(s) ->> 'timezone', ''), NULLIF(to_jsonb(b) ->> 'timezone', '')) AS timezone
       FROM barbershops b
       LEFT JOIN barbershop_settings s ON s.barbershop_id = b.id
       WHERE b.id = $1 AND b.active = true
       LIMIT 1`,
      [barbershopId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return mapRowToOperationalSettings(result.rows[0]);
  }

  async findProfileByBarbershopId(barbershopId, executor = this.pool) {
    const result = await executor.query(
      `SELECT b.cpf_cnpj
       FROM barbershops b
       WHERE b.id = $1
         AND b.active = true`,
      [barbershopId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return mapRowToProfile(result.rows[0]);
  }

  async findAccountProfileByUserId(barbershopId, userId, executor = this.pool) {
    const result = await executor.query(
      `SELECT
         b.name AS barbershop_name,
         b.owner_name,
         COALESCE(b.whatsapp, '') AS whatsapp,
         COALESCE(b.cpf_cnpj, '') AS cpf_cnpj,
         u.email
       FROM users u
       JOIN barbershops b ON b.id = u.barbershop_id
       WHERE u.id = $1
         AND u.barbershop_id = $2
         AND u.blocked = false
         AND b.active = true
       LIMIT 1`,
      [userId, barbershopId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return mapRowToAccountProfile(result.rows[0]);
  }

  async findAccountUserById(barbershopId, userId, executor = this.pool) {
    try {
      const result = await executor.query(
        `SELECT
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
         WHERE u.id = $1
           AND u.barbershop_id = $2
           AND u.blocked = false
           AND b.active = true
         LIMIT 1`,
        [userId, barbershopId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return mapRowToAccountUser(result.rows[0]);
    } catch (error) {
      if (error?.code !== '42703') {
        throw error;
      }

      const legacyResult = await executor.query(
        `SELECT
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
         WHERE u.id = $1
           AND u.barbershop_id = $2
           AND u.blocked = false
           AND b.active = true
         LIMIT 1`,
        [userId, barbershopId]
      );

      if (legacyResult.rows.length === 0) {
        return null;
      }

      return mapRowToAccountUser(legacyResult.rows[0]);
    }
  }

  async findWhatsAppInstanceContextByBarbershopId(barbershopId, executor = this.pool) {
    const result = await executor.query(
      `SELECT id,
              name,
              active,
              whatsapp_instance_name
         FROM barbershops
        WHERE id = $1
        LIMIT 1`,
      [barbershopId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return {
      id: result.rows[0].id,
      name: result.rows[0].name,
      active: result.rows[0].active,
      whatsappInstanceName: result.rows[0].whatsapp_instance_name || null,
    };
  }

  async updateProfile(barbershopId, payload, executor = this.pool) {
    const result = await executor.query(
      `UPDATE barbershops
       SET cpf_cnpj = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
         AND active = true
       RETURNING cpf_cnpj`,
      [barbershopId, payload.cpfCnpj]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return mapRowToProfile(result.rows[0]);
  }

  async updateAccountProfile(barbershopId, userId, payload, executor = this.pool) {
    const shouldUpdateEmail = payload.emailChanged === true;
    const barbershopQuery = shouldUpdateEmail
      ? `UPDATE barbershops
         SET name = $3,
             owner_name = $4,
             whatsapp = $5,
             cpf_cnpj = $6,
             email = $7,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND active = true
           AND EXISTS (
             SELECT 1
             FROM users u
             WHERE u.id = $2
               AND u.barbershop_id = $1
               AND u.blocked = false
           )
         RETURNING id`
      : `UPDATE barbershops
         SET name = $3,
             owner_name = $4,
             whatsapp = $5,
             cpf_cnpj = $6,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND active = true
           AND EXISTS (
             SELECT 1
             FROM users u
             WHERE u.id = $2
               AND u.barbershop_id = $1
               AND u.blocked = false
           )
         RETURNING id`;
    const barbershopParams = shouldUpdateEmail
      ? [barbershopId, userId, payload.barbershopName, payload.ownerName, payload.whatsapp, payload.cpfCnpj, payload.email]
      : [barbershopId, userId, payload.barbershopName, payload.ownerName, payload.whatsapp, payload.cpfCnpj];

    const barbershopResult = await executor.query(barbershopQuery, barbershopParams);

    if (barbershopResult.rowCount === 0) {
      return null;
    }

    if (shouldUpdateEmail) {
      await executor.query(
        `UPDATE users
         SET email = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
           AND barbershop_id = $1
           AND blocked = false`,
        [barbershopId, userId, payload.email]
      );
    }

    return this.findAccountProfileByUserId(barbershopId, userId, executor);
  }

  async updateUserPassword(barbershopId, userId, passwordHash, executor = this.pool) {
    const result = await executor.query(
      `UPDATE users
       SET password_hash = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
         AND barbershop_id = $1
         AND blocked = false
       RETURNING id`,
      [barbershopId, userId, passwordHash]
    );

    return result.rows[0] || null;
  }

  async upsert(barbershopId, payload) {
    const client = await this.getClient();

    try {
      await client.query('BEGIN');

      const barbershopResult = await client.query(
        `UPDATE barbershops
         SET whatsapp_instance_name = NULLIF(lower(btrim($2)), '')
         WHERE id = $1 AND active = true
         RETURNING id`,
        [barbershopId, payload.whatsappInstanceName]
      );

      if (barbershopResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      await client.query(
        `INSERT INTO barbershop_settings (
           barbershop_id,
           opening_time,
           closing_time,
           slot_interval_minutes,
           allow_walkins,
           auto_confirm_appointments,
           email_reminders,
           whatsapp_reminders,
           google_calendar_enabled,
           custom_webhook_url
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (barbershop_id) DO UPDATE SET
           opening_time = EXCLUDED.opening_time,
           closing_time = EXCLUDED.closing_time,
           slot_interval_minutes = EXCLUDED.slot_interval_minutes,
           allow_walkins = EXCLUDED.allow_walkins,
           auto_confirm_appointments = EXCLUDED.auto_confirm_appointments,
           email_reminders = EXCLUDED.email_reminders,
           whatsapp_reminders = EXCLUDED.whatsapp_reminders,
           google_calendar_enabled = EXCLUDED.google_calendar_enabled,
           custom_webhook_url = EXCLUDED.custom_webhook_url,
           updated_at = CURRENT_TIMESTAMP`,
        [
          barbershopId,
          payload.openingTime,
          payload.closingTime,
          payload.slotIntervalMinutes,
          payload.allowWalkins,
          payload.autoConfirmAppointments,
          payload.emailReminders,
          payload.whatsappReminders,
          payload.googleCalendarEnabled,
          payload.customWebhookUrl,
        ]
      );

      const persisted = await this.findByBarbershopId(barbershopId, client);
      await client.query('COMMIT');
      return persisted;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findByWhatsAppInstanceName(instanceName, executor = this.pool) {
    if (typeof instanceName !== 'string') {
      return null;
    }

    const normalizedInstanceName = instanceName.trim().toLowerCase();

    if (!normalizedInstanceName) {
      return null;
    }

    const result = await executor.query(
      `SELECT id,
              name,
              whatsapp_instance_name
         FROM barbershops
        WHERE active = true
          AND NULLIF(btrim(whatsapp_instance_name), '') IS NOT NULL
          AND lower(btrim(whatsapp_instance_name)) = $1
        LIMIT 1`,
      [normalizedInstanceName]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return {
      id: result.rows[0].id,
      name: result.rows[0].name,
      whatsappInstanceName: result.rows[0].whatsapp_instance_name,
    };
  }

  async ensureWhatsAppInstanceName(barbershopId, buildInstanceName) {
    const client = await this.getClient();

    try {
      await client.query('BEGIN');

      const result = await client.query(
        `SELECT id,
                name,
                active,
                whatsapp_instance_name
           FROM barbershops
          WHERE id = $1
          FOR UPDATE`,
        [barbershopId]
      );

      if (!result.rows.length || result.rows[0].active !== true) {
        await client.query('ROLLBACK');
        return null;
      }

      const current = result.rows[0];
      const currentInstanceName = typeof current.whatsapp_instance_name === 'string'
        ? current.whatsapp_instance_name.trim().toLowerCase()
        : '';

      if (currentInstanceName) {
        await client.query('COMMIT');
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

      const updateResult = await client.query(
        `UPDATE barbershops
            SET whatsapp_instance_name = $2,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING id, name, active, whatsapp_instance_name`,
        [barbershopId, nextInstanceName]
      );

      await client.query('COMMIT');

      return {
        id: updateResult.rows[0].id,
        name: updateResult.rows[0].name,
        active: updateResult.rows[0].active,
        whatsappInstanceName: updateResult.rows[0].whatsapp_instance_name,
        createdNow: true,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findWhatsAppInstanceNameDiagnostics(instanceName, executor = this.pool) {
    if (typeof instanceName !== 'string') {
      return [];
    }

    const normalizedInstanceName = instanceName.trim().toLowerCase();

    if (!normalizedInstanceName) {
      return [];
    }

    const result = await executor.query(
      `SELECT id,
              name,
              active,
              whatsapp,
              whatsapp_instance_name
         FROM barbershops
        WHERE NULLIF(btrim(whatsapp_instance_name), '') IS NOT NULL
          AND lower(btrim(whatsapp_instance_name)) = $1
        ORDER BY active DESC, created_at ASC NULLS LAST, id ASC
        LIMIT 5`,
      [normalizedInstanceName]
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      active: row.active,
      whatsapp: row.whatsapp,
      whatsappInstanceName: row.whatsapp_instance_name,
    }));
  }
}

export const barbershopSettingsRepository = new BarbershopSettingsRepository();
