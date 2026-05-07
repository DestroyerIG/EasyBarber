import { prisma } from '../config/prisma.js';
import { Prisma } from '@prisma/client';

const buildPaginationMeta = ({ total, page, limit }: { total: number; page: number; limit: number }) => ({
  total,
  page,
  limit,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

export const auditRepository = {
  async logAction(
    _client: unknown,
    data: {
      actionType: string;
      actorUserId?: string | null;
      actorBarbershopId?: string | null;
      targetUserId?: string | null;
      targetBarbershopId?: string | null;
      resourceType?: string | null;
      resourceId?: string | null;
      details?: unknown;
      ipAddress?: string | null;
      userAgent?: string | null;
      status?: string;
      errorMessage?: string | null;
    }
  ) {
    return prisma.auditLog.create({
      data: {
        actionType: data.actionType,
        actorUserId: data.actorUserId ?? null,
        actorBarbershopId: data.actorBarbershopId ?? null,
        targetUserId: data.targetUserId ?? null,
        targetBarbershopId: data.targetBarbershopId ?? null,
        resourceType: data.resourceType ?? null,
        resourceId: data.resourceId ?? null,
        details: data.details ? (data.details as Prisma.InputJsonValue) : undefined,
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
        status: data.status ?? 'success',
        errorMessage: data.errorMessage ?? null,
      },
      select: { id: true, createdAt: true },
    });
  },

  async listLogs(filters: {
    action?: string;
    status?: string;
    actor?: string;
    target?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const { action, status, actor, target, from, to, page = 1, limit = 20 } = filters;

    const conditions: Prisma.AuditLogWhereInput = {
      ...(action && { actionType: action }),
      ...(status && { status }),
      ...(from && { createdAt: { gte: new Date(from) } }),
      ...(to && {
        createdAt: {
          ...(from ? { gte: new Date(from) } : {}),
          lte: new Date(to),
        },
      }),
    };

    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: conditions,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
      }),
      prisma.auditLog.count({ where: conditions }),
    ]);

    // actor/target text filtering (post-query — Prisma join equivalent)
    const filteredData = data.filter((log) => {
      if (actor && !log.actorUserId?.toLowerCase().includes(actor.toLowerCase())) return false;
      if (target && !log.targetUserId?.toLowerCase().includes(target.toLowerCase())) return false;
      return true;
    });

    return { data: filteredData, meta: buildPaginationMeta({ total, page, limit }) };
  },
};
