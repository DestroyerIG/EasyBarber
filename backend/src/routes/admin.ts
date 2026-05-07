import express from 'express';
// @ts-ignore
import { authMiddleware } from '../middleware/auth.js';
// @ts-ignore
import { requireAdmin } from '../middleware/rbac.js';
// @ts-ignore
import { validate } from '../middleware/validate.js';
// @ts-ignore
import {
  getAdminMetrics,
  getAdminTenants,
  getAdminTenantDetails,
  blockTenant,
  unblockTenant,
  softDeleteTenant,
  blockUser,
  unblockUser,
  getAdminSubscriptions,
  resyncSubscription,
  getAdminAuditLogs,
  adminMetricsQuerySchema,
  adminTenantListQuerySchema,
  adminSubscriptionListQuerySchema,
  adminAuditLogQuerySchema,
  adminActionParamsSchema,
  adminActionBodySchema,
} from '../controllers/adminController.js';
// @ts-ignore
import {
  listCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
} from '../controllers/couponController.js';

const router = express.Router();

router.use(authMiddleware, requireAdmin);

router.get('/metrics', validate({ query: adminMetricsQuerySchema }), getAdminMetrics);

router.get('/tenants', validate({ query: adminTenantListQuerySchema }), getAdminTenants);
router.get('/tenants/:id', validate({ params: adminActionParamsSchema }), getAdminTenantDetails);
router.patch('/tenants/:id/block', validate({ params: adminActionParamsSchema, body: adminActionBodySchema }), blockTenant);
router.patch('/tenants/:id/unblock', validate({ params: adminActionParamsSchema, body: adminActionBodySchema }), unblockTenant);
router.delete('/tenants/:id', validate({ params: adminActionParamsSchema, body: adminActionBodySchema }), softDeleteTenant);

router.patch('/users/:id/block', validate({ params: adminActionParamsSchema, body: adminActionBodySchema }), blockUser);
router.patch('/users/:id/unblock', validate({ params: adminActionParamsSchema, body: adminActionBodySchema }), unblockUser);

router.get('/subscriptions', validate({ query: adminSubscriptionListQuerySchema }), getAdminSubscriptions);
router.post('/subscriptions/:id/resync', validate({ params: adminActionParamsSchema, body: adminActionBodySchema }), resyncSubscription);

router.get('/logs', validate({ query: adminAuditLogQuerySchema }), getAdminAuditLogs);

router.get('/coupons', listCoupons);
router.post('/coupons', createCoupon);
router.patch('/coupons/:id', updateCoupon);
router.delete('/coupons/:id', deleteCoupon);

export default router;
