import logger from '../utils/logger.js';
import { auditRepository } from '../repositories/auditRepository.js';
import type { IncomingMessage } from 'http';

interface RequestLike {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}

const getRequestMeta = (req: RequestLike | null) => ({
  ipAddress: req?.ip ?? (req?.headers?.['x-forwarded-for'] as string | undefined) ?? null,
  userAgent: (req?.headers?.['user-agent'] as string | undefined) ?? null,
});

interface LogAdminActionParams {
  client?: unknown;
  req?: RequestLike | null;
  actionType: string;
  actorUserId: string | null;
  actorBarbershopId?: string | null;
  targetUserId?: string | null;
  targetBarbershopId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  details?: unknown;
  status?: string;
  errorMessage?: string | null;
}

export const auditLogService = {
  async logAdminAction({
    client = null,
    req = null,
    actionType,
    actorUserId,
    actorBarbershopId,
    targetUserId = null,
    targetBarbershopId = null,
    resourceType = null,
    resourceId = null,
    details = null,
    status = 'success',
    errorMessage = null,
  }: LogAdminActionParams) {
    const requestMeta = getRequestMeta(req);

    return auditRepository.logAction(client, {
      actionType,
      actorUserId,
      actorBarbershopId,
      targetUserId,
      targetBarbershopId,
      resourceType,
      resourceId,
      details,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
      status,
      errorMessage,
    });
  },

  async safeLogFailure(payload: Omit<LogAdminActionParams, 'status'>): Promise<void> {
    try {
      await this.logAdminAction({ ...payload, status: 'failed' });
    } catch (error) {
      logger.error({ err: error, actionType: payload?.actionType }, 'Falha ao registrar log de auditoria');
    }
  },
};
