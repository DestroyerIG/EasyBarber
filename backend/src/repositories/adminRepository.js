import pool from '../config/database.js';

const db = (client) => client || pool;

const toInt = (value) => parseInt(value || '0', 10);
const toFloat = (value) => parseFloat(value || '0');

const getOrderBy = (sortBy, sortOrder, allowed) => {
  const normalizedField = allowed[sortBy] || allowed.created_at;
  const normalizedOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';
  return `${normalizedField} ${normalizedOrder}`;
};

const buildPaginationMeta = ({ total, page, limit }) => ({
  total,
  page,
  limit,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

export const adminRepository = {
  async getPlatformMetrics(periodDays = 30) {
    const [summaryResult, monthlyRevenueResult, mrrEstimateResult, newAccountsTrendResult, usageTrendResult, subscriptionBreakdownResult, planBreakdownResult] = await Promise.all([
      pool.query(
        `SELECT
          (SELECT COUNT(*) FROM barbershops) AS total_accounts,
          (SELECT COUNT(*) FROM barbershops WHERE active = true) AS active_accounts,
          (SELECT COUNT(*) FROM barbershops WHERE active = false) AS suspended_accounts,
          (SELECT COUNT(*) FROM barbershops WHERE subscription_status IN ('active', 'trialing') AND active = true) AS active_subscriptions,
          (SELECT COUNT(*) FROM barbershops WHERE subscription_status = 'canceled') AS canceled_subscriptions,
          (SELECT COUNT(*) FROM barbershops WHERE subscription_status = 'trialing') AS trial_users,
          (SELECT COUNT(*) FROM users) AS total_users,
          (SELECT COUNT(*) FROM users WHERE blocked = true) AS blocked_users,
          (SELECT COUNT(*) FROM appointments WHERE created_at >= NOW() - ($1::text || ' days')::interval) AS appointments_in_period,
          (SELECT COUNT(DISTINCT barbershop_id) FROM appointments WHERE created_at >= NOW() - INTERVAL '30 days') AS active_tenants_30d`,
        [periodDays]
      ),
      pool.query(
        `SELECT COALESCE(SUM(
          CASE
            WHEN (payload->>'amount_paid') ~ '^[0-9]+$' THEN (payload->>'amount_paid')::numeric / 100
            ELSE 0
          END
        ), 0) AS monthly_revenue
        FROM subscription_events
        WHERE event_type = 'invoice.paid'
          AND created_at >= date_trunc('month', NOW())`
      ),
      pool.query(
        `SELECT COALESCE(SUM(
          CASE plan
            WHEN 'basico' THEN 49
            WHEN 'profissional' THEN 99
            WHEN 'premium' THEN 199
            ELSE 0
          END
        ), 0) AS estimated_mrr
        FROM barbershops
        WHERE active = true
          AND subscription_status IN ('active', 'trialing')`
      ),
      pool.query(
        `SELECT DATE(created_at) AS day, COUNT(*)::int AS total
         FROM barbershops
         WHERE created_at >= NOW() - ($1::text || ' days')::interval
         GROUP BY DATE(created_at)
         ORDER BY DATE(created_at)`,
        [periodDays]
      ),
      pool.query(
        `SELECT DATE(created_at) AS day, COUNT(*)::int AS appointments
         FROM appointments
         WHERE created_at >= NOW() - ($1::text || ' days')::interval
         GROUP BY DATE(created_at)
         ORDER BY DATE(created_at)`,
        [periodDays]
      ),
      pool.query(
        `SELECT subscription_status, COUNT(*)::int AS total
         FROM barbershops
         GROUP BY subscription_status
         ORDER BY total DESC`
      ),
      pool.query(
        `SELECT plan, COUNT(*)::int AS total
         FROM barbershops
         GROUP BY plan
         ORDER BY total DESC`
      ),
    ]);

    const summary = summaryResult.rows[0] || {};

    return {
      totals: {
        totalAccounts: toInt(summary.total_accounts),
        activeAccounts: toInt(summary.active_accounts),
        suspendedAccounts: toInt(summary.suspended_accounts),
        totalUsers: toInt(summary.total_users),
        blockedUsers: toInt(summary.blocked_users),
      },
      subscriptions: {
        active: toInt(summary.active_subscriptions),
        canceled: toInt(summary.canceled_subscriptions),
        trial: toInt(summary.trial_users),
        breakdown: subscriptionBreakdownResult.rows,
        plans: planBreakdownResult.rows,
      },
      revenue: {
        monthlyRevenueCollected: toFloat(monthlyRevenueResult.rows[0]?.monthly_revenue),
        estimatedMrr: toFloat(mrrEstimateResult.rows[0]?.estimated_mrr),
      },
      usage: {
        periodDays,
        appointmentsInPeriod: toInt(summary.appointments_in_period),
        activeTenants30d: toInt(summary.active_tenants_30d),
        newAccountsTrend: newAccountsTrendResult.rows,
        appointmentsTrend: usageTrendResult.rows,
      },
    };
  },

  async listTenants(filters = {}) {
    const {
      search,
      status,
      plan,
      subscriptionStatus,
      activity,
      from,
      to,
      sortBy = 'created_at',
      sortOrder = 'desc',
      page = 1,
      limit = 20,
    } = filters;

    const baseCte = `
      WITH tenant_base AS (
        SELECT
          b.id,
          b.name,
          b.owner_name,
          b.email,
          b.whatsapp,
          b.plan,
          b.subscription_status,
          b.subscription_current_period_end,
          b.subscription_updated_at,
          b.active,
          b.suspended_at,
          b.suspended_reason,
          b.created_at,
          b.updated_at,
          owner_user.id AS owner_user_id,
          owner_user.email AS owner_user_email,
          owner_user.role AS owner_user_role,
          owner_user.blocked AS owner_user_blocked,
          (
            SELECT MAX(a.created_at)
            FROM appointments a
            WHERE a.barbershop_id = b.id
          ) AS last_activity_at
        FROM barbershops b
        LEFT JOIN LATERAL (
          SELECT u.id, u.email, u.role, u.blocked
          FROM users u
          WHERE u.barbershop_id = b.id
          ORDER BY
            CASE
              WHEN u.role = 'tenant_admin' THEN 0
              WHEN u.role = 'admin' THEN 1
              ELSE 2
            END,
            u.created_at ASC
          LIMIT 1
        ) owner_user ON true
      )
    `;

    const whereClauses = [];
    const params = [];

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      whereClauses.push(`(LOWER(t.name) LIKE $${params.length} OR LOWER(t.email) LIKE $${params.length} OR LOWER(t.owner_name) LIKE $${params.length})`);
    }

    if (status === 'active') {
      whereClauses.push('t.active = true');
    }

    if (status === 'suspended') {
      whereClauses.push('t.active = false');
    }

    if (plan) {
      params.push(plan);
      whereClauses.push(`t.plan = $${params.length}`);
    }

    if (subscriptionStatus) {
      params.push(subscriptionStatus);
      whereClauses.push(`t.subscription_status = $${params.length}`);
    }

    if (from) {
      params.push(from);
      whereClauses.push(`t.created_at >= $${params.length}::date`);
    }

    if (to) {
      params.push(to);
      whereClauses.push(`t.created_at < ($${params.length}::date + INTERVAL '1 day')`);
    }

    if (activity === 'active') {
      whereClauses.push(`COALESCE(t.last_activity_at, t.updated_at) >= NOW() - INTERVAL '30 days'`);
    }

    if (activity === 'inactive') {
      whereClauses.push(`COALESCE(t.last_activity_at, t.updated_at) < NOW() - INTERVAL '30 days'`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const orderBy = getOrderBy(sortBy, sortOrder, {
      created_at: 't.created_at',
      name: 't.name',
      last_activity_at: 'COALESCE(t.last_activity_at, t.updated_at)',
    });

    const offset = (page - 1) * limit;

    const dataQuery = `
      ${baseCte}
      SELECT t.*
      FROM tenant_base t
      ${whereSql}
      ORDER BY ${orderBy}
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `;

    const countQuery = `
      ${baseCte}
      SELECT COUNT(*)::int AS total
      FROM tenant_base t
      ${whereSql}
    `;

    const [dataResult, countResult] = await Promise.all([
      pool.query(dataQuery, [...params, limit, offset]),
      pool.query(countQuery, params),
    ]);

    const total = countResult.rows[0]?.total || 0;

    return {
      data: dataResult.rows,
      meta: buildPaginationMeta({ total, page, limit }),
    };
  },

  async getTenantDetails(tenantId) {
    const tenantResult = await pool.query(
      `SELECT
        b.id,
        b.name,
        b.owner_name,
        b.email,
        b.whatsapp,
        b.plan,
        b.subscription_status,
        b.subscription_current_period_start,
        b.subscription_current_period_end,
        b.subscription_cancel_at_period_end,
        b.subscription_updated_at,
        b.stripe_customer_id,
        b.stripe_subscription_id,
        b.active,
        b.suspended_at,
        b.suspended_reason,
        b.created_at,
        b.updated_at,
        owner_user.id AS owner_user_id,
        owner_user.email AS owner_user_email,
        owner_user.role AS owner_user_role,
        owner_user.blocked AS owner_user_blocked
      FROM barbershops b
      LEFT JOIN LATERAL (
        SELECT u.id, u.email, u.role, u.blocked
        FROM users u
        WHERE u.barbershop_id = b.id
        ORDER BY
          CASE
            WHEN u.role = 'tenant_admin' THEN 0
            WHEN u.role = 'admin' THEN 1
            ELSE 2
          END,
          u.created_at ASC
        LIMIT 1
      ) owner_user ON true
      WHERE b.id = $1`,
      [tenantId]
    );

    const tenant = tenantResult.rows[0];
    if (!tenant) {
      return null;
    }

    const [usersResult, clientsResult, appointmentsMonthResult, servicesResult, barbersResult, lastActivityResult] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total_users,
                COUNT(*) FILTER (WHERE blocked = true)::int AS blocked_users
         FROM users
         WHERE barbershop_id = $1`,
        [tenantId]
      ),
      pool.query(`SELECT COUNT(*)::int AS total_clients FROM clients WHERE barbershop_id = $1`, [tenantId]),
      pool.query(
        `SELECT COUNT(*)::int AS total_appointments_month
         FROM appointments
         WHERE barbershop_id = $1
           AND created_at >= date_trunc('month', NOW())`,
        [tenantId]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total_services
         FROM services
         WHERE barbershop_id = $1 AND active = true`,
        [tenantId]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total_barbers
         FROM barbers
         WHERE barbershop_id = $1 AND active = true`,
        [tenantId]
      ),
      pool.query(
        `SELECT MAX(created_at) AS last_activity_at
         FROM appointments
         WHERE barbershop_id = $1`,
        [tenantId]
      ),
    ]);

    return {
      ...tenant,
      usage: {
        totalUsers: usersResult.rows[0]?.total_users || 0,
        blockedUsers: usersResult.rows[0]?.blocked_users || 0,
        totalClients: clientsResult.rows[0]?.total_clients || 0,
        totalAppointmentsMonth: appointmentsMonthResult.rows[0]?.total_appointments_month || 0,
        totalServices: servicesResult.rows[0]?.total_services || 0,
        totalBarbers: barbersResult.rows[0]?.total_barbers || 0,
        lastActivityAt: lastActivityResult.rows[0]?.last_activity_at || null,
      },
    };
  },

  async updateTenantAccessStatus(client, tenantId, { active, reason }) {
    const result = await db(client).query(
      `UPDATE barbershops
       SET active = $2,
           suspended_at = CASE WHEN $2 = false THEN NOW() ELSE NULL END,
           suspended_reason = CASE WHEN $2 = false THEN COALESCE($3, suspended_reason) ELSE NULL END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, name, active, suspended_at, suspended_reason, updated_at`,
      [tenantId, active, reason || null]
    );

    return result.rows[0] || null;
  },

  async softDeleteTenant(client, tenantId, reason) {
    const result = await db(client).query(
      `UPDATE barbershops
       SET active = false,
           suspended_at = NOW(),
           suspended_reason = COALESCE($2, 'soft_deleted'),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, name, active, suspended_at, suspended_reason, updated_at`,
      [tenantId, reason || null]
    );

    return result.rows[0] || null;
  },

  async getUserContext(userId) {
    const result = await pool.query(
      `SELECT
        u.id,
        u.email,
        u.role,
        u.blocked,
        u.blocked_at,
        u.blocked_reason,
        u.barbershop_id,
        b.name AS barbershop_name,
        b.active AS barbershop_active
       FROM users u
       JOIN barbershops b ON b.id = u.barbershop_id
       WHERE u.id = $1`,
      [userId]
    );

    return result.rows[0] || null;
  },

  async setUserBlockedStatus(client, userId, { blocked, reason }) {
    const result = await db(client).query(
      `UPDATE users
       SET blocked = $2,
           blocked_at = CASE WHEN $2 = true THEN NOW() ELSE NULL END,
           blocked_reason = CASE WHEN $2 = true THEN $3 ELSE NULL END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, email, role, barbershop_id, blocked, blocked_at, blocked_reason`,
      [userId, blocked, reason || null]
    );

    return result.rows[0] || null;
  },

  async revokeUserRefreshTokens(client, userId) {
    await db(client).query(
      `UPDATE refresh_tokens
       SET revoked_at = NOW()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId]
    );
  },

  async revokeTenantRefreshTokens(client, tenantId) {
    await db(client).query(
      `UPDATE refresh_tokens
       SET revoked_at = NOW()
       WHERE user_id IN (
         SELECT id FROM users WHERE barbershop_id = $1
       )
       AND revoked_at IS NULL`,
      [tenantId]
    );
  },

  async listSubscriptions(filters = {}) {
    const {
      search,
      status,
      plan,
      overdueOnly,
      sortBy = 'updated_at',
      sortOrder = 'desc',
      page = 1,
      limit = 20,
    } = filters;

    const whereClauses = [];
    const params = [];

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      whereClauses.push(`(LOWER(b.name) LIKE $${params.length} OR LOWER(b.email) LIKE $${params.length})`);
    }

    if (status) {
      params.push(status);
      whereClauses.push(`b.subscription_status = $${params.length}`);
    }

    if (plan) {
      params.push(plan);
      whereClauses.push(`b.plan = $${params.length}`);
    }

    if (overdueOnly === true) {
      whereClauses.push(`b.subscription_status IN ('past_due', 'incomplete')`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const orderBy = getOrderBy(sortBy, sortOrder, {
      updated_at: 'b.subscription_updated_at',
      subscription_current_period_end: 'b.subscription_current_period_end',
      name: 'b.name',
    });

    const offset = (page - 1) * limit;

    const dataQuery = `
      SELECT
        b.id AS tenant_id,
        b.name,
        b.email,
        b.plan,
        b.subscription_status,
        b.subscription_current_period_start,
        b.subscription_current_period_end,
        b.subscription_cancel_at_period_end,
        b.subscription_updated_at,
        b.stripe_customer_id,
        b.stripe_subscription_id,
        b.active,
        owner_user.email AS owner_user_email
      FROM barbershops b
      LEFT JOIN LATERAL (
        SELECT u.email
        FROM users u
        WHERE u.barbershop_id = b.id
        ORDER BY
          CASE
            WHEN u.role = 'tenant_admin' THEN 0
            WHEN u.role = 'admin' THEN 1
            ELSE 2
          END,
          u.created_at ASC
        LIMIT 1
      ) owner_user ON true
      ${whereSql}
      ORDER BY ${orderBy}
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `;

    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM barbershops b
      ${whereSql}
    `;

    const [dataResult, countResult] = await Promise.all([
      pool.query(dataQuery, [...params, limit, offset]),
      pool.query(countQuery, params),
    ]);

    const total = countResult.rows[0]?.total || 0;

    return {
      data: dataResult.rows,
      meta: buildPaginationMeta({ total, page, limit }),
    };
  },

  async getClient() {
    return pool.connect();
  },
};
