import pool from '../config/database.js';

const db = (client) => client || pool;

const normalizeJsonb = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  return JSON.stringify(value);
};

export const subscriptionRepository = {
  async getBarbershopBillingContext(barbershopId, client = null) {
    const result = await db(client).query(
      `SELECT id, name, owner_name, email, whatsapp, plan, desired_plan,
              cpf_cnpj,
              asaas_customer_id,
              stripe_customer_id,
              stripe_subscription_id,
              stripe_price_id,
              stripe_payment_mode,
              provider,
              provider_customer_id,
              provider_subscription_id,
              provider_payment_id,
              payment_method,
              subscription_status,
              subscription_current_period_start,
              subscription_current_period_end,
              subscription_cancel_at_period_end,
              current_period_start,
              current_period_end,
              next_due_date,
              last_payment_date,
              canceled_at,
              metadata
       FROM barbershops
       WHERE id = $1::uuid AND active = true`,
      [barbershopId]
    );

    return result?.rows?.[0] || null;
  },

  async findByStripeCustomerId(stripeCustomerId, client = null) {
    const result = await db(client).query(
      `SELECT id, name, owner_name, email, whatsapp, plan,
              stripe_customer_id,
              stripe_subscription_id,
              stripe_price_id,
              stripe_payment_mode,
              provider,
              provider_customer_id,
              provider_subscription_id,
              provider_payment_id,
              payment_method,
              subscription_status,
              subscription_current_period_start,
              subscription_current_period_end,
              subscription_cancel_at_period_end,
              current_period_start,
              current_period_end,
              next_due_date,
              last_payment_date,
              canceled_at,
              metadata
       FROM barbershops
       WHERE stripe_customer_id = $1::text AND active = true`,
      [stripeCustomerId]
    );

    return result.rows[0] || null;
  },

  async setStripeCustomerId(barbershopId, stripeCustomerId, client = null) {
    const result = await db(client).query(
      `UPDATE barbershops
       SET stripe_customer_id = $2::text,
           provider = COALESCE(provider, 'stripe'),
           provider_customer_id = COALESCE(provider_customer_id, $2::text),
           subscription_updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid
       RETURNING stripe_customer_id, provider, provider_customer_id`,
      [barbershopId, stripeCustomerId]
    );

    return result.rows[0] || null;
  },

  async setAsaasCustomerId(barbershopId, asaasCustomerId, client = null) {
    if (!barbershopId || !asaasCustomerId) {
      return null;
    }

    const metadataPatchQuery = `jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{asaas,customerId}',
      to_jsonb($2::text),
      true
    )`;

    try {
      const result = await db(client).query(
        `UPDATE barbershops
         SET asaas_customer_id = $2::text,
             metadata = ${metadataPatchQuery},
             subscription_updated_at = CURRENT_TIMESTAMP
         WHERE id = $1::uuid
         RETURNING id, asaas_customer_id, provider_customer_id, metadata`,
        [barbershopId, asaasCustomerId]
      );

      return result.rows[0] || null;
    } catch (error) {
      if (error?.code !== '42703') {
        throw error;
      }

      const fallback = await db(client).query(
        `UPDATE barbershops
         SET metadata = ${metadataPatchQuery},
             provider_customer_id = CASE
               WHEN provider = 'asaas' OR payment_method = 'pix'
                 THEN $2::text
               ELSE provider_customer_id
             END,
             subscription_updated_at = CURRENT_TIMESTAMP
         WHERE id = $1::uuid
         RETURNING id, provider_customer_id, metadata`,
        [barbershopId, asaasCustomerId]
      );

      return fallback.rows[0] || null;
    }
  },

  async findByProviderCustomerId(provider, providerCustomerId, client = null) {
    const result = await db(client).query(
      `SELECT id, name, owner_name, email, whatsapp, plan,
              stripe_customer_id,
              stripe_subscription_id,
              stripe_price_id,
              stripe_payment_mode,
              provider,
              provider_customer_id,
              provider_subscription_id,
              provider_payment_id,
              payment_method,
              subscription_status,
              subscription_current_period_start,
              subscription_current_period_end,
              subscription_cancel_at_period_end,
              current_period_start,
              current_period_end,
              next_due_date,
              last_payment_date,
              canceled_at,
              metadata
       FROM barbershops
       WHERE provider = $1::text
         AND provider_customer_id = $2::text
         AND active = true`,
      [provider, providerCustomerId]
    );

    return result.rows[0] || null;
  },

  async findByProviderSubscriptionId(provider, providerSubscriptionId, client = null) {
    const result = await db(client).query(
      `SELECT id, name, owner_name, email, whatsapp, plan,
              stripe_customer_id,
              stripe_subscription_id,
              stripe_price_id,
              stripe_payment_mode,
              provider,
              provider_customer_id,
              provider_subscription_id,
              provider_payment_id,
              payment_method,
              subscription_status,
              subscription_current_period_start,
              subscription_current_period_end,
              subscription_cancel_at_period_end,
              current_period_start,
              current_period_end,
              next_due_date,
              last_payment_date,
              canceled_at,
              metadata
       FROM barbershops
       WHERE provider = $1::text
         AND provider_subscription_id = $2::text
         AND active = true`,
      [provider, providerSubscriptionId]
    );

    return result.rows[0] || null;
  },

  async findByProviderPaymentId(provider, providerPaymentId, client = null) {
    const result = await db(client).query(
      `SELECT id, name, owner_name, email, whatsapp, plan,
              stripe_customer_id,
              stripe_subscription_id,
              stripe_price_id,
              stripe_payment_mode,
              provider,
              provider_customer_id,
              provider_subscription_id,
              provider_payment_id,
              payment_method,
              subscription_status,
              subscription_current_period_start,
              subscription_current_period_end,
              subscription_cancel_at_period_end,
              current_period_start,
              current_period_end,
              next_due_date,
              last_payment_date,
              canceled_at,
              metadata
       FROM barbershops
       WHERE provider = $1::text
         AND provider_payment_id = $2::text
         AND active = true`,
      [provider, providerPaymentId]
    );

    return result.rows[0] || null;
  },

  async updateSubscriptionState(barbershopId, payload, client = null) {
    const result = await db(client).query(
      `UPDATE barbershops
       SET plan = COALESCE($2::text, plan),
           stripe_subscription_id = CASE
             WHEN $11::boolean THEN NULL
             ELSE COALESCE($3::text, stripe_subscription_id)
           END,
           stripe_price_id = COALESCE($4::text, stripe_price_id),
           subscription_status = COALESCE($5::text, subscription_status),
           subscription_current_period_start = COALESCE($6::timestamp, subscription_current_period_start),
           subscription_current_period_end = COALESCE($7::timestamp, subscription_current_period_end),
           subscription_cancel_at_period_end = COALESCE($8::boolean, subscription_cancel_at_period_end),
           stripe_payment_mode = COALESCE($9::text, stripe_payment_mode),
           payment_method = COALESCE($10::text, payment_method),
           provider = COALESCE(
             $12::text,
             provider,
             CASE
               WHEN $3::text IS NOT NULL OR $9::text IS NOT NULL OR $13::text IS NOT NULL THEN 'stripe'
               ELSE provider
             END
           ),
           provider_customer_id = COALESCE($13::text, provider_customer_id),
           provider_subscription_id = CASE
             WHEN $11::boolean THEN NULL
             ELSE COALESCE($14::text, provider_subscription_id, $3::text)
           END,
           provider_payment_id = COALESCE($15::text, provider_payment_id),
           current_period_start = COALESCE($16::timestamp, current_period_start, $6::timestamp),
           current_period_end = COALESCE($17::timestamp, current_period_end, $7::timestamp),
           next_due_date = COALESCE($18::timestamp, next_due_date, $7::timestamp),
           last_payment_date = COALESCE($19::timestamp, last_payment_date),
           canceled_at = COALESCE($20::timestamp, canceled_at),
           metadata = COALESCE($21::jsonb, metadata),
           subscription_updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid
       RETURNING id, plan, subscription_status,
                 subscription_current_period_start,
                 subscription_current_period_end,
                 subscription_cancel_at_period_end,
                 stripe_payment_mode,
                 payment_method,
                 stripe_subscription_id,
                 stripe_price_id,
                 provider,
                 provider_customer_id,
                 provider_subscription_id,
                 provider_payment_id,
                 current_period_start,
                 current_period_end,
                 next_due_date,
                 last_payment_date,
                 canceled_at,
                 metadata`,
      [
        barbershopId,
        payload.plan ?? null,
        payload.stripeSubscriptionId ?? null,
        payload.stripePriceId ?? null,
        payload.subscriptionStatus ?? null,
        payload.currentPeriodStart ?? null,
        payload.currentPeriodEnd ?? null,
        typeof payload.cancelAtPeriodEnd === 'boolean' ? payload.cancelAtPeriodEnd : null,
        payload.stripePaymentMode ?? null,
        payload.paymentMethod ?? null,
        Boolean(payload.clearStripeSubscriptionId),
        payload.provider ?? null,
        payload.providerCustomerId ?? null,
        payload.providerSubscriptionId ?? null,
        payload.providerPaymentId ?? null,
        payload.currentPeriodStartGeneric ?? payload.currentPeriodStart ?? null,
        payload.currentPeriodEndGeneric ?? payload.currentPeriodEnd ?? null,
        payload.nextDueDate ?? null,
        payload.lastPaymentDate ?? null,
        payload.canceledAt ?? null,
        normalizeJsonb(payload.metadata),
      ]
    );

    return result.rows[0] || null;
  },

  async storeSubscriptionEvent(event, client) {
    const result = await db(client).query(
      `INSERT INTO subscription_events (stripe_event_id, event_type, barbershop_id, payload)
       VALUES ($1::text, $2::text, $3::uuid, $4::jsonb)
       ON CONFLICT (stripe_event_id) DO NOTHING
       RETURNING id`,
      [
        event.eventId,
        event.eventType,
        event.barbershopId || null,
        normalizeJsonb(event.payload),
      ]
    );

    return result.rows[0] || null;
  },

  async hasProcessedEvent(eventId, client = null) {
    const result = await db(client).query(
      'SELECT 1 FROM subscription_events WHERE stripe_event_id = $1::text LIMIT 1',
      [eventId]
    );

    return Boolean(result.rows[0]);
  },

  async getSubscriptionStatus(barbershopId, client = null) {
    const result = await db(client).query(
      `SELECT plan,
              desired_plan,
              asaas_customer_id,
              stripe_customer_id,
              stripe_subscription_id,
              stripe_payment_mode,
              provider,
              provider_customer_id,
              provider_subscription_id,
              provider_payment_id,
              payment_method,
              subscription_status,
              subscription_current_period_start,
              subscription_current_period_end,
              subscription_cancel_at_period_end,
              current_period_start,
              current_period_end,
              next_due_date,
              last_payment_date,
              canceled_at,
              metadata
       FROM barbershops
       WHERE id = $1::uuid AND active = true`,
      [barbershopId]
    );

    return result.rows[0] || null;
  },

  async expireOneTimeSubscriptions(client = null) {
    const result = await db(client).query(
      `UPDATE barbershops
       SET subscription_status = 'unpaid',
           subscription_updated_at = CURRENT_TIMESTAMP
       WHERE (
         stripe_payment_mode = 'payment'
         OR (provider = 'asaas' AND payment_method = 'pix')
       )
         AND subscription_status IN ('active', 'trialing', 'pending')
         AND COALESCE(current_period_end, subscription_current_period_end) IS NOT NULL
         AND COALESCE(current_period_end, subscription_current_period_end) <= NOW()
       RETURNING id`
    );

    return {
      expiredCount: result.rowCount,
      barbershopIds: result.rows.map((row) => row.id),
    };
  },

  async storeBillingWebhookEvent(event, client = null) {
    const result = await db(client).query(
      `INSERT INTO billing_webhook_events (
         provider,
         event_id,
         event_type,
         barbershop_id,
         payload,
         processed_at,
         status
       )
       VALUES ($1::text, $2::text, $3::text, $4::uuid, $5::jsonb, CURRENT_TIMESTAMP, $6::text)
       ON CONFLICT (provider, event_id) DO NOTHING
       RETURNING id, provider, event_id, event_type, status, processed_at`,
      [
        event.provider,
        event.eventId,
        event.eventType,
        event.barbershopId || null,
        normalizeJsonb(event.payload),
        event.status || 'processed',
      ]
    );

    return result.rows[0] || null;
  },

  async hasProcessedBillingWebhookEvent(provider, eventId, client = null) {
    const result = await db(client).query(
      `SELECT 1
       FROM billing_webhook_events
       WHERE provider = $1::text
         AND event_id = $2::text
       LIMIT 1`,
      [provider, eventId]
    );

    return Boolean(result.rows[0]);
  },

  async upsertBillingPayment(payment, client = null) {
    const result = await db(client).query(
      `INSERT INTO billing_payments (
         barbershop_id,
         provider,
         provider_payment_id,
         provider_subscription_id,
         payment_method,
         external_status,
         internal_status,
         amount,
         due_date,
         paid_at,
         pix_copy_paste,
         qr_code,
         metadata
       )
       VALUES (
         $1::uuid,
         $2::text,
         $3::text,
         $4::text,
         $5::text,
         $6::text,
         $7::text,
         $8::numeric,
         $9::timestamp,
         $10::timestamp,
         $11::text,
         $12::text,
         $13::jsonb
       )
       ON CONFLICT (provider, provider_payment_id)
       DO UPDATE SET
         barbershop_id = EXCLUDED.barbershop_id,
         provider_subscription_id = COALESCE(EXCLUDED.provider_subscription_id, billing_payments.provider_subscription_id),
         payment_method = COALESCE(EXCLUDED.payment_method, billing_payments.payment_method),
         external_status = COALESCE(EXCLUDED.external_status, billing_payments.external_status),
         internal_status = COALESCE(EXCLUDED.internal_status, billing_payments.internal_status),
         amount = COALESCE(EXCLUDED.amount, billing_payments.amount),
         due_date = COALESCE(EXCLUDED.due_date, billing_payments.due_date),
         paid_at = COALESCE(EXCLUDED.paid_at, billing_payments.paid_at),
         pix_copy_paste = COALESCE(EXCLUDED.pix_copy_paste, billing_payments.pix_copy_paste),
         qr_code = COALESCE(EXCLUDED.qr_code, billing_payments.qr_code),
         metadata = COALESCE(EXCLUDED.metadata, billing_payments.metadata),
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        payment.barbershopId,
        payment.provider,
        payment.providerPaymentId,
        payment.providerSubscriptionId ?? null,
        payment.paymentMethod ?? null,
        payment.externalStatus ?? null,
        payment.internalStatus ?? null,
        payment.amount ?? null,
        payment.dueDate ?? null,
        payment.paidAt ?? null,
        payment.pixCopyPaste ?? null,
        payment.qrCode ?? null,
        normalizeJsonb(payment.metadata),
      ]
    );

    return result.rows[0] || null;
  },

  async findBillingPaymentByProviderPaymentId(provider, providerPaymentId, client = null) {
    const result = await db(client).query(
      `SELECT *
       FROM billing_payments
       WHERE provider = $1::text
         AND provider_payment_id = $2::text
       LIMIT 1`,
      [provider, providerPaymentId]
    );

    return result.rows[0] || null;
  },

  async getClient() {
    return pool.connect();
  },
};
