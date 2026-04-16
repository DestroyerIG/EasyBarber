import pool from '../config/database.js';

const db = (client) => client || pool;

export const subscriptionRepository = {
  async getBarbershopBillingContext(barbershopId, client = null) {
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
       WHERE id = $1 AND active = true`,
      [barbershopId]
    );

    return result.rows[0] || null;
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
       WHERE stripe_customer_id = $1 AND active = true`,
      [stripeCustomerId]
    );

    return result.rows[0] || null;
  },

  async setStripeCustomerId(barbershopId, stripeCustomerId, client = null) {
    const result = await db(client).query(
      `UPDATE barbershops
       SET stripe_customer_id = $2,
           provider = COALESCE(provider, 'stripe'),
           provider_customer_id = COALESCE(provider_customer_id, $2),
           subscription_updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING stripe_customer_id, provider, provider_customer_id`,
      [barbershopId, stripeCustomerId]
    );

    return result.rows[0] || null;
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
       WHERE provider = $1
         AND provider_customer_id = $2
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
       WHERE provider = $1
         AND provider_subscription_id = $2
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
       WHERE provider = $1
         AND provider_payment_id = $2
         AND active = true`,
      [provider, providerPaymentId]
    );

    return result.rows[0] || null;
  },

  async updateSubscriptionState(barbershopId, payload, client = null) {
    const result = await db(client).query(
      `UPDATE barbershops
       SET plan = COALESCE($2, plan),
           stripe_subscription_id = CASE
             WHEN $11 THEN NULL
             ELSE COALESCE($3, stripe_subscription_id)
           END,
           stripe_price_id = COALESCE($4, stripe_price_id),
           subscription_status = COALESCE($5, subscription_status),
           subscription_current_period_start = COALESCE($6, subscription_current_period_start),
           subscription_current_period_end = COALESCE($7, subscription_current_period_end),
           subscription_cancel_at_period_end = COALESCE($8, subscription_cancel_at_period_end),
           stripe_payment_mode = COALESCE($9, stripe_payment_mode),
           payment_method = COALESCE($10, payment_method),
           provider = COALESCE(
             $12,
             provider,
             CASE
               WHEN $3 IS NOT NULL OR $9 IS NOT NULL OR $13 IS NOT NULL THEN 'stripe'
               ELSE provider
             END
           ),
           provider_customer_id = COALESCE($13, provider_customer_id),
           provider_subscription_id = CASE
             WHEN $11 THEN NULL
             ELSE COALESCE($14, provider_subscription_id, $3)
           END,
           provider_payment_id = COALESCE($15, provider_payment_id),
           current_period_start = COALESCE($16, current_period_start, $6),
           current_period_end = COALESCE($17, current_period_end, $7),
           next_due_date = COALESCE($18, next_due_date, $7),
           last_payment_date = COALESCE($19, last_payment_date),
           canceled_at = COALESCE($20, canceled_at),
           metadata = COALESCE($21, metadata),
           subscription_updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
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
        payload.plan || null,
        payload.stripeSubscriptionId || null,
        payload.stripePriceId || null,
        payload.subscriptionStatus || null,
        payload.currentPeriodStart || null,
        payload.currentPeriodEnd || null,
        payload.cancelAtPeriodEnd,
        payload.stripePaymentMode || null,
        payload.paymentMethod || null,
        Boolean(payload.clearStripeSubscriptionId),
        payload.provider || null,
        payload.providerCustomerId || null,
        payload.providerSubscriptionId || null,
        payload.providerPaymentId || null,
        payload.currentPeriodStartGeneric || payload.currentPeriodStart || null,
        payload.currentPeriodEndGeneric || payload.currentPeriodEnd || null,
        payload.nextDueDate || null,
        payload.lastPaymentDate || null,
        payload.canceledAt || null,
        payload.metadata || null,
      ]
    );

    return result.rows[0] || null;
  },

  async storeSubscriptionEvent(event, client) {
    const result = await db(client).query(
      `INSERT INTO subscription_events (stripe_event_id, event_type, barbershop_id, payload)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (stripe_event_id) DO NOTHING
       RETURNING id`,
      [event.eventId, event.eventType, event.barbershopId || null, event.payload || null]
    );

    return result.rows[0] || null;
  },

  async hasProcessedEvent(eventId, client = null) {
    const result = await db(client).query(
      'SELECT 1 FROM subscription_events WHERE stripe_event_id = $1 LIMIT 1',
      [eventId]
    );

    return Boolean(result.rows[0]);
  },

  async getSubscriptionStatus(barbershopId, client = null) {
    const result = await db(client).query(
      `SELECT plan,
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
       WHERE id = $1 AND active = true`,
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
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6)
       ON CONFLICT (provider, event_id) DO NOTHING
       RETURNING id, provider, event_id, event_type, status, processed_at`,
      [
        event.provider,
        event.eventId,
        event.eventType,
        event.barbershopId || null,
        event.payload || null,
        event.status || 'processed',
      ]
    );

    return result.rows[0] || null;
  },

  async hasProcessedBillingWebhookEvent(provider, eventId, client = null) {
    const result = await db(client).query(
      `SELECT 1
       FROM billing_webhook_events
       WHERE provider = $1
         AND event_id = $2
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
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
        payment.providerSubscriptionId || null,
        payment.paymentMethod || null,
        payment.externalStatus || null,
        payment.internalStatus || null,
        payment.amount || null,
        payment.dueDate || null,
        payment.paidAt || null,
        payment.pixCopyPaste || null,
        payment.qrCode || null,
        payment.metadata || null,
      ]
    );

    return result.rows[0] || null;
  },

  async findBillingPaymentByProviderPaymentId(provider, providerPaymentId, client = null) {
    const result = await db(client).query(
      `SELECT *
       FROM billing_payments
       WHERE provider = $1
         AND provider_payment_id = $2
       LIMIT 1`,
      [provider, providerPaymentId]
    );

    return result.rows[0] || null;
  },

  async getClient() {
    return pool.connect();
  },
};
