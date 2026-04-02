import pool from '../config/database.js';

const db = (client) => client || pool;

const buildPaginationMeta = ({ total, page, limit }) => ({
  total,
  page,
  limit,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

export const auditRepository = {
  async logAction(client, {
    actionType,
    actorUserId,
    actorBarbershopId,
    targetUserId,
    targetBarbershopId,
    resourceType,
    resourceId,
    details,
    ipAddress,
    userAgent,
    status = 'success',
    errorMessage,
  }) {
    const result = await db(client).query(
      `INSERT INTO audit_logs (
        action_type,
        actor_user_id,
        actor_barbershop_id,
        target_user_id,
        target_barbershop_id,
        resource_type,
        resource_id,
        details,
        ip_address,
        user_agent,
        status,
        error_message
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING id, created_at`,
      [
        actionType,
        actorUserId || null,
        actorBarbershopId || null,
        targetUserId || null,
        targetBarbershopId || null,
        resourceType || null,
        resourceId || null,
        details ? JSON.stringify(details) : null,
        ipAddress || null,
        userAgent || null,
        status,
        errorMessage || null,
      ]
    );

    return result.rows[0] || null;
  },

  async listLogs(filters = {}) {
    const {
      action,
      status,
      actor,
      target,
      from,
      to,
      page = 1,
      limit = 20,
    } = filters;

    const whereClauses = [];
    const params = [];

    if (action) {
      params.push(action);
      whereClauses.push(`al.action_type = $${params.length}`);
    }

    if (status) {
      params.push(status);
      whereClauses.push(`al.status = $${params.length}`);
    }

    if (actor) {
      params.push(`%${actor.toLowerCase()}%`);
      whereClauses.push(`(LOWER(COALESCE(actor.email, '')) LIKE $${params.length} OR CAST(al.actor_user_id AS TEXT) ILIKE $${params.length})`);
    }

    if (target) {
      params.push(`%${target.toLowerCase()}%`);
      whereClauses.push(`(LOWER(COALESCE(target_user.email, '')) LIKE $${params.length} OR CAST(al.target_user_id AS TEXT) ILIKE $${params.length})`);
    }

    if (from) {
      params.push(from);
      whereClauses.push(`al.created_at >= $${params.length}::timestamp`);
    }

    if (to) {
      params.push(to);
      whereClauses.push(`al.created_at <= $${params.length}::timestamp`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const offset = (page - 1) * limit;

    const dataQuery = `
      SELECT
        al.id,
        al.action_type,
        al.actor_user_id,
        actor.email AS actor_user_email,
        al.actor_barbershop_id,
        actor_tenant.name AS actor_tenant_name,
        al.target_user_id,
        target_user.email AS target_user_email,
        al.target_barbershop_id,
        target_tenant.name AS target_tenant_name,
        al.resource_type,
        al.resource_id,
        al.details,
        al.ip_address,
        al.user_agent,
        al.status,
        al.error_message,
        al.created_at
      FROM audit_logs al
      LEFT JOIN users actor ON actor.id = al.actor_user_id
      LEFT JOIN users target_user ON target_user.id = al.target_user_id
      LEFT JOIN barbershops actor_tenant ON actor_tenant.id = al.actor_barbershop_id
      LEFT JOIN barbershops target_tenant ON target_tenant.id = al.target_barbershop_id
      ${whereSql}
      ORDER BY al.created_at DESC
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `;

    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM audit_logs al
      LEFT JOIN users actor ON actor.id = al.actor_user_id
      LEFT JOIN users target_user ON target_user.id = al.target_user_id
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
};
