import logger from '../utils/logger.js';
import { auditRepository } from '../repositories/auditRepository.js';

const getRequestMeta = (req) => ({
  ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || null,
  userAgent: req?.headers?.['user-agent'] || null,
});

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
  }) {
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

  async safeLogFailure(payload) {
    try {
      await this.logAdminAction({ ...payload, status: 'failed' });
    } catch (error) {
      logger.error({ err: error, actionType: payload?.actionType }, 'Falha ao registrar log de auditoria');
    }
  },
};
