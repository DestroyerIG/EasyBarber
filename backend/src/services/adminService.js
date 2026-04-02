import logger from '../utils/logger.js';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../utils/errors.js';
import { adminRepository } from '../repositories/adminRepository.js';
import { auditRepository } from '../repositories/auditRepository.js';
import { auditLogService } from './auditLogService.js';
import { adminMetricsService } from './adminMetricsService.js';
import { subscriptionService } from './subscriptionService.js';

const ensureConfirmed = (confirmation) => {
  if (confirmation !== 'CONFIRM') {
    throw new ValidationError('Confirmação inválida', ['Use confirmation=CONFIRM para executar esta ação']);
  }
};

const actorPayload = (authUser) => ({
  actorUserId: authUser?.userId || null,
  actorBarbershopId: authUser?.barbershopId || null,
});

export const adminService = {
  async getMetrics(query = {}) {
    return adminMetricsService.getMetrics(query.periodDays);
  },

  async listTenants(query = {}) {
    return adminRepository.listTenants(query);
  },

  async getTenantDetails(tenantId) {
    const data = await adminRepository.getTenantDetails(tenantId);
    if (!data) {
      throw new NotFoundError('Conta');
    }
    return data;
  },

  async listSubscriptions(query = {}) {
    return adminRepository.listSubscriptions(query);
  },

  async listAuditLogs(query = {}) {
    return auditRepository.listLogs(query);
  },

  async blockTenant(authUser, tenantId, body, req) {
    ensureConfirmed(body.confirmation);

    const client = await adminRepository.getClient();

    try {
      await client.query('BEGIN');

      const tenant = await adminRepository.updateTenantAccessStatus(client, tenantId, {
        active: false,
        reason: body.reason || 'Conta bloqueada por administrador',
      });

      if (!tenant) {
        throw new NotFoundError('Conta');
      }

      await adminRepository.revokeTenantRefreshTokens(client, tenant.id);

      await auditLogService.logAdminAction({
        client,
        req,
        actionType: 'TENANT_BLOCKED',
        ...actorPayload(authUser),
        targetBarbershopId: tenant.id,
        resourceType: 'barbershop',
        resourceId: tenant.id,
        details: {
          reason: body.reason || null,
        },
      });

      await client.query('COMMIT');
      return tenant;
    } catch (error) {
      await client.query('ROLLBACK');

      await auditLogService.safeLogFailure({
        req,
        actionType: 'TENANT_BLOCKED',
        ...actorPayload(authUser),
        targetBarbershopId: tenantId,
        resourceType: 'barbershop',
        resourceId: tenantId,
        details: { reason: body.reason || null },
        errorMessage: error.message,
      });

      throw error;
    } finally {
      client.release();
    }
  },

  async unblockTenant(authUser, tenantId, body, req) {
    ensureConfirmed(body.confirmation);

    const client = await adminRepository.getClient();

    try {
      await client.query('BEGIN');

      const tenant = await adminRepository.updateTenantAccessStatus(client, tenantId, {
        active: true,
      });

      if (!tenant) {
        throw new NotFoundError('Conta');
      }

      await auditLogService.logAdminAction({
        client,
        req,
        actionType: 'TENANT_UNBLOCKED',
        ...actorPayload(authUser),
        targetBarbershopId: tenant.id,
        resourceType: 'barbershop',
        resourceId: tenant.id,
      });

      await client.query('COMMIT');
      return tenant;
    } catch (error) {
      await client.query('ROLLBACK');

      await auditLogService.safeLogFailure({
        req,
        actionType: 'TENANT_UNBLOCKED',
        ...actorPayload(authUser),
        targetBarbershopId: tenantId,
        resourceType: 'barbershop',
        resourceId: tenantId,
        errorMessage: error.message,
      });

      throw error;
    } finally {
      client.release();
    }
  },

  async softDeleteTenant(authUser, tenantId, body, req) {
    ensureConfirmed(body.confirmation);

    const client = await adminRepository.getClient();

    try {
      await client.query('BEGIN');

      const tenant = await adminRepository.softDeleteTenant(client, tenantId, body.reason);
      if (!tenant) {
        throw new NotFoundError('Conta');
      }

      await adminRepository.revokeTenantRefreshTokens(client, tenant.id);

      await auditLogService.logAdminAction({
        client,
        req,
        actionType: 'TENANT_SOFT_DELETED',
        ...actorPayload(authUser),
        targetBarbershopId: tenant.id,
        resourceType: 'barbershop',
        resourceId: tenant.id,
        details: {
          reason: body.reason || null,
        },
      });

      await client.query('COMMIT');
      return tenant;
    } catch (error) {
      await client.query('ROLLBACK');

      await auditLogService.safeLogFailure({
        req,
        actionType: 'TENANT_SOFT_DELETED',
        ...actorPayload(authUser),
        targetBarbershopId: tenantId,
        resourceType: 'barbershop',
        resourceId: tenantId,
        details: { reason: body.reason || null },
        errorMessage: error.message,
      });

      throw error;
    } finally {
      client.release();
    }
  },

  async blockUser(authUser, userId, body, req) {
    ensureConfirmed(body.confirmation);

    const targetUser = await adminRepository.getUserContext(userId);
    if (!targetUser) {
      throw new NotFoundError('Usuário');
    }

    if (targetUser.role === 'platform_admin') {
      throw new ForbiddenError('Não é permitido bloquear usuários platform_admin');
    }

    const client = await adminRepository.getClient();

    try {
      await client.query('BEGIN');

      const updatedUser = await adminRepository.setUserBlockedStatus(client, userId, {
        blocked: true,
        reason: body.reason || 'Usuário bloqueado por administrador',
      });

      if (!updatedUser) {
        throw new NotFoundError('Usuário');
      }

      await adminRepository.revokeUserRefreshTokens(client, userId);

      await auditLogService.logAdminAction({
        client,
        req,
        actionType: 'USER_BLOCKED',
        ...actorPayload(authUser),
        targetUserId: updatedUser.id,
        targetBarbershopId: updatedUser.barbershop_id,
        resourceType: 'user',
        resourceId: updatedUser.id,
        details: {
          reason: body.reason || null,
          email: updatedUser.email,
        },
      });

      await client.query('COMMIT');
      return updatedUser;
    } catch (error) {
      await client.query('ROLLBACK');

      await auditLogService.safeLogFailure({
        req,
        actionType: 'USER_BLOCKED',
        ...actorPayload(authUser),
        targetUserId: userId,
        targetBarbershopId: targetUser?.barbershop_id || null,
        resourceType: 'user',
        resourceId: userId,
        details: { reason: body.reason || null },
        errorMessage: error.message,
      });

      throw error;
    } finally {
      client.release();
    }
  },

  async unblockUser(authUser, userId, body, req) {
    ensureConfirmed(body.confirmation);

    const targetUser = await adminRepository.getUserContext(userId);
    if (!targetUser) {
      throw new NotFoundError('Usuário');
    }

    const client = await adminRepository.getClient();

    try {
      await client.query('BEGIN');

      const updatedUser = await adminRepository.setUserBlockedStatus(client, userId, {
        blocked: false,
      });

      if (!updatedUser) {
        throw new NotFoundError('Usuário');
      }

      await auditLogService.logAdminAction({
        client,
        req,
        actionType: 'USER_UNBLOCKED',
        ...actorPayload(authUser),
        targetUserId: updatedUser.id,
        targetBarbershopId: updatedUser.barbershop_id,
        resourceType: 'user',
        resourceId: updatedUser.id,
        details: {
          email: updatedUser.email,
        },
      });

      await client.query('COMMIT');
      return updatedUser;
    } catch (error) {
      await client.query('ROLLBACK');

      await auditLogService.safeLogFailure({
        req,
        actionType: 'USER_UNBLOCKED',
        ...actorPayload(authUser),
        targetUserId: userId,
        targetBarbershopId: targetUser?.barbershop_id || null,
        resourceType: 'user',
        resourceId: userId,
        errorMessage: error.message,
      });

      throw error;
    } finally {
      client.release();
    }
  },

  async resyncSubscription(authUser, tenantId, body, req) {
    ensureConfirmed(body.confirmation);

    try {
      const result = await subscriptionService.resyncBarbershopSubscription(tenantId);

      await auditLogService.logAdminAction({
        req,
        actionType: 'SUBSCRIPTION_RESYNC_TRIGGERED',
        ...actorPayload(authUser),
        targetBarbershopId: tenantId,
        resourceType: 'subscription',
        resourceId: tenantId,
        details: {
          subscriptionStatus: result.subscriptionStatus,
          plan: result.plan,
        },
      });

      return result;
    } catch (error) {
      logger.error({ err: error, tenantId }, 'Falha no re-sync manual de assinatura');

      await auditLogService.safeLogFailure({
        req,
        actionType: 'SUBSCRIPTION_RESYNC_TRIGGERED',
        ...actorPayload(authUser),
        targetBarbershopId: tenantId,
        resourceType: 'subscription',
        resourceId: tenantId,
        errorMessage: error.message,
      });

      throw error;
    }
  },
};
