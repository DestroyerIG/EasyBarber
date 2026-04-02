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

export const getAdminMetrics = async (req, res, next) => {
  try {
    const data = await adminService.getMetrics(req.query);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const getAdminTenants = async (req, res, next) => {
  try {
    const result = await adminService.listTenants(req.query);
    sendSuccess(res, result.data, 200, result.meta);
  } catch (error) {
    next(error);
  }
};

export const getAdminTenantDetails = async (req, res, next) => {
  try {
    const data = await adminService.getTenantDetails(req.params.id);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const blockTenant = async (req, res, next) => {
  try {
    const data = await adminService.blockTenant(req.user, req.params.id, req.body, req);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const unblockTenant = async (req, res, next) => {
  try {
    const data = await adminService.unblockTenant(req.user, req.params.id, req.body, req);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const softDeleteTenant = async (req, res, next) => {
  try {
    const data = await adminService.softDeleteTenant(req.user, req.params.id, req.body, req);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const blockUser = async (req, res, next) => {
  try {
    const data = await adminService.blockUser(req.user, req.params.id, req.body, req);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const unblockUser = async (req, res, next) => {
  try {
    const data = await adminService.unblockUser(req.user, req.params.id, req.body, req);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const getAdminSubscriptions = async (req, res, next) => {
  try {
    const result = await adminService.listSubscriptions(req.query);
    sendSuccess(res, result.data, 200, result.meta);
  } catch (error) {
    next(error);
  }
};

export const resyncSubscription = async (req, res, next) => {
  try {
    const data = await adminService.resyncSubscription(req.user, req.params.id, req.body, req);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

export const getAdminAuditLogs = async (req, res, next) => {
  try {
    const result = await adminService.listAuditLogs(req.query);
    sendSuccess(res, result.data, 200, result.meta);
  } catch (error) {
    next(error);
  }
};
