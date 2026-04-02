import pool from '../config/database.js';

const db = (client) => client || pool;

export const subscriptionRepository = {
  async getBarbershopBillingContext(barbershopId, client = null) {
    const result = await db(client).query(
      `SELECT id, name, email, plan,
              stripe_customer_id,
              stripe_subscription_id,
              stripe_price_id,
              subscription_status,
              subscription_current_period_start,
              subscription_current_period_end,
              subscription_cancel_at_period_end
       FROM barbershops
       WHERE id = $1 AND active = true`,
      [barbershopId]
    );

    return result.rows[0] || null;
  },

  async findByStripeCustomerId(stripeCustomerId, client = null) {
    const result = await db(client).query(
      `SELECT id, name, email, plan,
              stripe_customer_id,
              stripe_subscription_id,
              stripe_price_id,
              subscription_status,
              subscription_current_period_start,
              subscription_current_period_end,
              subscription_cancel_at_period_end
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
           subscription_updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING stripe_customer_id`,
      [barbershopId, stripeCustomerId]
    );

    return result.rows[0] || null;
  },

  async updateSubscriptionState(barbershopId, payload, client = null) {
    const result = await db(client).query(
      `UPDATE barbershops
       SET plan = COALESCE($2, plan),
           stripe_subscription_id = COALESCE($3, stripe_subscription_id),
           stripe_price_id = COALESCE($4, stripe_price_id),
           subscription_status = COALESCE($5, subscription_status),
           subscription_current_period_start = COALESCE($6, subscription_current_period_start),
           subscription_current_period_end = COALESCE($7, subscription_current_period_end),
           subscription_cancel_at_period_end = COALESCE($8, subscription_cancel_at_period_end),
           subscription_updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, plan, subscription_status,
                 subscription_current_period_start,
                 subscription_current_period_end,
                 subscription_cancel_at_period_end`,
      [
        barbershopId,
        payload.plan || null,
        payload.stripeSubscriptionId || null,
        payload.stripePriceId || null,
        payload.subscriptionStatus || null,
        payload.currentPeriodStart || null,
        payload.currentPeriodEnd || null,
        payload.cancelAtPeriodEnd,
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
              subscription_status,
              subscription_current_period_start,
              subscription_current_period_end,
              subscription_cancel_at_period_end
       FROM barbershops
       WHERE id = $1 AND active = true`,
      [barbershopId]
    );

    return result.rows[0] || null;
  },

  async getClient() {
    return pool.connect();
  },
};
