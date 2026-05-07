import type { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../utils/response.js';
import { adminService } from '../services/adminService.js';
import {
  adminMetricsQuerySchema,
  adminTenantListQuerySchema,
  adminSubscriptionListQuerySchema,
  adminAuditLogQuerySchema,
  adminActionParamsSchema,
  adminActionBodySchema,
} from '../validators/schemas/index.js';

export {
  adminMetricsQuerySchema,
  adminTenantListQuerySchema,
  adminSubscriptionListQuerySchema,
  adminAuditLogQuerySchema,
  adminActionParamsSchema,
  adminActionBodySchema,
};

export const getAdminMetrics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await adminService.getMetrics(req.query);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const getAdminTenants = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await adminService.listTenants(req.query) as { data: unknown[]; meta: import('../utils/response.js').PaginationMeta };
    sendSuccess(res, result.data, 200, result.meta);
  } catch (error) {
    next(error);
  }
};

export const getAdminTenantDetails = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await adminService.getTenantDetails(req.params['id'] as string);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const blockTenant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await adminService.blockTenant(req.user, req.params['id'] as string, req.body, req);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const unblockTenant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await adminService.unblockTenant(req.user, req.params['id'] as string, req.body, req);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const softDeleteTenant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await adminService.softDeleteTenant(req.user, req.params['id'] as string, req.body, req);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const blockUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await adminService.blockUser(req.user, req.params['id'] as string, req.body, req);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const unblockUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await adminService.unblockUser(req.user, req.params['id'] as string, req.body, req);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const getAdminSubscriptions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await adminService.listSubscriptions(req.query) as { data: unknown[]; meta: import('../utils/response.js').PaginationMeta };
    sendSuccess(res, result.data, 200, result.meta);
  } catch (error) {
    next(error);
  }
};

export const resyncSubscription = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await adminService.resyncSubscription(req.user, req.params['id'] as string, req.body, req);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const getAdminAuditLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await adminService.listAuditLogs(req.query) as { data: unknown[]; meta: import('../utils/response.js').PaginationMeta };
    sendSuccess(res, result.data, 200, result.meta);
  } catch (error) {
    next(error);
  }
};
