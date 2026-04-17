import { BaseRepository } from './BaseRepository.js';

const mapRowToSettings = (row) => ({
  shopName: row.shop_name,
  contactPhone: row.contact_phone,
  address: row.address,
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

class BarbershopSettingsRepository extends BaseRepository {
  constructor() {
    super('barbershop_settings');
  }

  async findByBarbershopId(barbershopId, executor = this.pool) {
    const result = await executor.query(
      `SELECT
         b.name AS shop_name,
         COALESCE(s.contact_phone, '') AS contact_phone,
         COALESCE(s.address, '') AS address,
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

  async upsert(barbershopId, payload) {
    const client = await this.getClient();

    try {
      await client.query('BEGIN');

      const barbershopResult = await client.query(
        `UPDATE barbershops
         SET name = $2
         WHERE id = $1 AND active = true
         RETURNING id`,
        [barbershopId, payload.shopName]
      );

      if (barbershopResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      await client.query(
        `INSERT INTO barbershop_settings (
           barbershop_id,
           contact_phone,
           address,
           opening_time,
           closing_time,
           slot_interval_minutes,
           allow_walkins,
           auto_confirm_appointments,
           email_reminders,
           whatsapp_reminders,
           google_calendar_enabled,
           custom_webhook_url
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (barbershop_id) DO UPDATE SET
           contact_phone = EXCLUDED.contact_phone,
           address = EXCLUDED.address,
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
          payload.contactPhone,
          payload.address,
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
}

export const barbershopSettingsRepository = new BarbershopSettingsRepository();
