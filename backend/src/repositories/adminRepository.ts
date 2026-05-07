import { prisma } from '../config/prisma.js';
import { Prisma } from '@prisma/client';

const toInt = (value: unknown): number => parseInt((value as string) || '0', 10);
const toFloat = (value: unknown): number => parseFloat((value as string) || '0');

const getOrderBy = (
  sortBy: string,
  sortOrder: string,
  allowed: Record<string, string>
): string => {
  const normalizedField = allowed[sortBy] || allowed['created_at'];
  const normalizedOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';
  return `${normalizedField} ${normalizedOrder}`;
};

const buildPaginationMeta = ({
  total,
  page,
  limit,
}: {
  total: number;
  page: number;
  limit: number;
}): { total: number; page: number; limit: number; totalPages: number } => ({
  total,
  page,
  limit,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

export const adminRepository = {
  async getPlatformMetrics(periodDays: number = 30): Promise<unknown> {
    const [
      summaryResult,
      monthlyRevenueResult,
      mrrEstimateResult,
      newAccountsTrendResult,
      usageTrendResult,
      subscriptionBreakdownResult,
      planBreakdownResult,
    ] = await Promise.all([
      prisma.$queryRaw<Array<Record<string, unknown>>>(
        Prisma.sql`SELECT
          (SELECT COUNT(*) FROM barbershops) AS total_accounts,
          (SELECT COUNT(*) FROM barbershops WHERE active = true) AS active_accounts,
          (SELECT COUNT(*) FROM barbershops WHERE active = false) AS suspended_accounts,
          (SELECT COUNT(*) FROM barbershops WHERE subscription_status IN ('active', 'trialing') AND active = true) AS active_subscriptions,
          (SELECT COUNT(*) FROM barbershops WHERE subscription_status = 'canceled') AS canceled_subscriptions,
          (SELECT COUNT(*) FROM barbershops WHERE subscription_status = 'trialing') AS trial_users,
          (SELECT COUNT(*) FROM users) AS total_users,
          (SELECT COUNT(*) FROM users WHERE blocked = true) AS blocked_users,
          (SELECT COUNT(*) FROM appointments WHERE created_at >= NOW() - (${periodDays}::text || ' days')::interval) AS appointments_in_period,
          (SELECT COUNT(DISTINCT barbershop_id) FROM appointments WHERE created_at >= NOW() - INTERVAL '30 days') AS active_tenants_30d`
      ),
      prisma.$queryRaw<Array<Record<string, unknown>>>(
        Prisma.sql`SELECT COALESCE(SUM(
          CASE
            WHEN (payload->>'amount_paid') ~ '^[0-9]+$' THEN (payload->>'amount_paid')::numeric / 100
            ELSE 0
          END
        ), 0) AS monthly_revenue
        FROM subscription_events
        WHERE event_type = 'invoice.paid'
          AND created_at >= date_trunc('month', NOW())`
      ),
      prisma.$queryRaw<Array<Record<string, unknown>>>(
        Prisma.sql`SELECT COALESCE(SUM(
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
      prisma.$queryRaw<Array<Record<string, unknown>>>(
        Prisma.sql`SELECT DATE(created_at) AS day, COUNT(*)::int AS total
         FROM barbershops
         WHERE created_at >= NOW() - (${periodDays}::text || ' days')::interval
         GROUP BY DATE(created_at)
         ORDER BY DATE(created_at)`
      ),
      prisma.$queryRaw<Array<Record<string, unknown>>>(
        Prisma.sql`SELECT DATE(created_at) AS day, COUNT(*)::int AS appointments
         FROM appointments
         WHERE created_at >= NOW() - (${periodDays}::text || ' days')::interval
         GROUP BY DATE(created_at)
         ORDER BY DATE(created_at)`
      ),
      prisma.$queryRaw<Array<Record<string, unknown>>>(
        Prisma.sql`SELECT subscription_status, COUNT(*)::int AS total
         FROM barbershops
         GROUP BY subscription_status
         ORDER BY total DESC`
      ),
      prisma.$queryRaw<Array<Record<string, unknown>>>(
        Prisma.sql`SELECT plan, COUNT(*)::int AS total
         FROM barbershops
         GROUP BY plan
         ORDER BY total DESC`
      ),
    ]);

    const summary = summaryResult[0] || {};

    return {
      totals: {
        totalAccounts: toInt(summary['total_accounts']),
        activeAccounts: toInt(summary['active_accounts']),
        suspendedAccounts: toInt(summary['suspended_accounts']),
        totalUsers: toInt(summary['total_users']),
        blockedUsers: toInt(summary['blocked_users']),
      },
      subscriptions: {
        active: toInt(summary['active_subscriptions']),
        canceled: toInt(summary['canceled_subscriptions']),
        trial: toInt(summary['trial_users']),
        breakdown: subscriptionBreakdownResult,
        plans: planBreakdownResult,
      },
      revenue: {
        monthlyRevenueCollected: toFloat((monthlyRevenueResult[0] as Record<string, unknown>)?.['monthly_revenue']),
        estimatedMrr: toFloat((mrrEstimateResult[0] as Record<string, unknown>)?.['estimated_mrr']),
      },
      usage: {
        periodDays,
        appointmentsInPeriod: toInt(summary['appointments_in_period']),
        activeTenants30d: toInt(summary['active_tenants_30d']),
        newAccountsTrend: newAccountsTrendResult,
        appointmentsTrend: usageTrendResult,
      },
    };
  },

  async listTenants(filters: Record<string, unknown> = {}): Promise<unknown> {
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
    } = filters as {
      search?: string;
      status?: string;
      plan?: string;
      subscriptionStatus?: string;
      activity?: string;
      from?: string;
      to?: string;
      sortBy?: string;
      sortOrder?: string;
      page?: number;
      limit?: number;
    };

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

    const whereClauses: string[] = [];
    const params: unknown[] = [];

    if (search) {
      params.push(`%${(search as string).toLowerCase()}%`);
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

    const orderBy = getOrderBy(sortBy as string, sortOrder as string, {
      created_at: 't.created_at',
      name: 't.name',
      last_activity_at: 'COALESCE(t.last_activity_at, t.updated_at)',
    });

    const pageNum = page as number;
    const limitNum = limit as number;
    const offset = (pageNum - 1) * limitNum;

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
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(dataQuery, ...params, limitNum, offset),
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(countQuery, ...params),
    ]);

    const total = (countResult[0] as Record<string, unknown>)?.['total'] as number || 0;

    return {
      data: dataResult,
      meta: buildPaginationMeta({ total, page: pageNum, limit: limitNum }),
    };
  },

  async getTenantDetails(tenantId: string): Promise<unknown> {
    const tenantResult = await prisma.$queryRaw<Array<Record<string, unknown>>>(
      Prisma.sql`SELECT
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
      WHERE b.id = ${tenantId}`
    );

    const tenant = tenantResult[0];
    if (!tenant) {
      return null;
    }

    const [
      usersResult,
      clientsResult,
      appointmentsMonthResult,
      servicesResult,
      barbersResult,
      lastActivityResult,
    ] = await Promise.all([
      prisma.$queryRaw<Array<Record<string, unknown>>>(
        Prisma.sql`SELECT COUNT(*)::int AS total_users,
                COUNT(*) FILTER (WHERE blocked = true)::int AS blocked_users
         FROM users
         WHERE barbershop_id = ${tenantId}`
      ),
      prisma.$queryRaw<Array<Record<string, unknown>>>(
        Prisma.sql`SELECT COUNT(*)::int AS total_clients FROM clients WHERE barbershop_id = ${tenantId}`
      ),
      prisma.$queryRaw<Array<Record<string, unknown>>>(
        Prisma.sql`SELECT COUNT(*)::int AS total_appointments_month
         FROM appointments
         WHERE barbershop_id = ${tenantId}
           AND created_at >= date_trunc('month', NOW())`
      ),
      prisma.$queryRaw<Array<Record<string, unknown>>>(
        Prisma.sql`SELECT COUNT(*)::int AS total_services
         FROM services
         WHERE barbershop_id = ${tenantId} AND active = true`
      ),
      prisma.$queryRaw<Array<Record<string, unknown>>>(
        Prisma.sql`SELECT COUNT(*)::int AS total_barbers
         FROM barbers
         WHERE barbershop_id = ${tenantId} AND active = true`
      ),
      prisma.$queryRaw<Array<Record<string, unknown>>>(
        Prisma.sql`SELECT MAX(created_at) AS last_activity_at
         FROM appointments
         WHERE barbershop_id = ${tenantId}`
      ),
    ]);

    return {
      ...tenant,
      usage: {
        totalUsers: (usersResult[0] as Record<string, unknown>)?.['total_users'] || 0,
        blockedUsers: (usersResult[0] as Record<string, unknown>)?.['blocked_users'] || 0,
        totalClients: (clientsResult[0] as Record<string, unknown>)?.['total_clients'] || 0,
        totalAppointmentsMonth: (appointmentsMonthResult[0] as Record<string, unknown>)?.['total_appointments_month'] || 0,
        totalServices: (servicesResult[0] as Record<string, unknown>)?.['total_services'] || 0,
        totalBarbers: (barbersResult[0] as Record<string, unknown>)?.['total_barbers'] || 0,
        lastActivityAt: (lastActivityResult[0] as Record<string, unknown>)?.['last_activity_at'] || null,
      },
    };
  },

  async updateTenantAccessStatus(
    _client: unknown = null,
    tenantId: string,
    { active, reason }: { active: boolean; reason?: string }
  ): Promise<unknown> {
    const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(
      Prisma.sql`UPDATE barbershops
       SET active = ${active},
           suspended_at = CASE WHEN ${active} = false THEN NOW() ELSE NULL END,
           suspended_reason = CASE WHEN ${active} = false THEN COALESCE(${reason || null}, suspended_reason) ELSE NULL END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ${tenantId}
       RETURNING id, name, active, suspended_at, suspended_reason, updated_at`
    );

    return result[0] || null;
  },

  async softDeleteTenant(
    _client: unknown = null,
    tenantId: string,
    reason?: string
  ): Promise<unknown> {
    const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(
      Prisma.sql`UPDATE barbershops
       SET active = false,
           suspended_at = NOW(),
           suspended_reason = COALESCE(${reason || null}, 'soft_deleted'),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ${tenantId}
       RETURNING id, name, active, suspended_at, suspended_reason, updated_at`
    );

    return result[0] || null;
  },

  async getUserContext(userId: string): Promise<unknown> {
    const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(
      Prisma.sql`SELECT
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
       WHERE u.id = ${userId}`
    );

    return result[0] || null;
  },

  async setUserBlockedStatus(
    _client: unknown = null,
    userId: string,
    { blocked, reason }: { blocked: boolean; reason?: string }
  ): Promise<unknown> {
    const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(
      Prisma.sql`UPDATE users
       SET blocked = ${blocked},
           blocked_at = CASE WHEN ${blocked} = true THEN NOW() ELSE NULL END,
           blocked_reason = CASE WHEN ${blocked} = true THEN ${reason || null} ELSE NULL END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ${userId}
       RETURNING id, email, role, barbershop_id, blocked, blocked_at, blocked_reason`
    );

    return result[0] || null;
  },

  async revokeUserRefreshTokens(_client: unknown = null, userId: string): Promise<void> {
    await prisma.$queryRaw(
      Prisma.sql`UPDATE refresh_tokens
       SET revoked_at = NOW()
       WHERE user_id = ${userId} AND revoked_at IS NULL`
    );
  },

  async revokeTenantRefreshTokens(_client: unknown = null, tenantId: string): Promise<void> {
    await prisma.$queryRaw(
      Prisma.sql`UPDATE refresh_tokens
       SET revoked_at = NOW()
       WHERE user_id IN (
         SELECT id FROM users WHERE barbershop_id = ${tenantId}
       )
       AND revoked_at IS NULL`
    );
  },

  async listSubscriptions(filters: Record<string, unknown> = {}): Promise<unknown> {
    const {
      search,
      status,
      plan,
      overdueOnly,
      sortBy = 'updated_at',
      sortOrder = 'desc',
      page = 1,
      limit = 20,
    } = filters as {
      search?: string;
      status?: string;
      plan?: string;
      overdueOnly?: boolean;
      sortBy?: string;
      sortOrder?: string;
      page?: number;
      limit?: number;
    };

    const whereClauses: string[] = [];
    const params: unknown[] = [];

    if (search) {
      params.push(`%${(search as string).toLowerCase()}%`);
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
      whereClauses.push(`b.subscription_status IN ('past_due', 'unpaid', 'incomplete')`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const orderBy = getOrderBy(sortBy as string, sortOrder as string, {
      updated_at: 'b.subscription_updated_at',
      subscription_current_period_end: 'b.subscription_current_period_end',
      name: 'b.name',
    });

    const pageNum = page as number;
    const limitNum = limit as number;
    const offset = (pageNum - 1) * limitNum;

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
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(dataQuery, ...params, limitNum, offset),
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(countQuery, ...params),
    ]);

    const total = (countResult[0] as Record<string, unknown>)?.['total'] as number || 0;

    return {
      data: dataResult,
      meta: buildPaginationMeta({ total, page: pageNum, limit: limitNum }),
    };
  },

  async getClient(): Promise<unknown> {
    return null;
  },
};
