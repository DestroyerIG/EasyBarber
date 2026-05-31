import api from '@/lib/api';
import type {
  AdminActionPayload,
  AdminAuditLog,
  AdminCoupon,
  AdminCouponPayload,
  AdminMetricsResponse,
  AdminSubscription,
  AdminTenant,
  AdminTenantDetails,
  PaginatedAdminResponse,
  PaginationMeta,
} from '@/types/admin';

type QueryParams = Record<string, string | number | boolean | undefined | null>;

type ApiResponseWithMeta<T> = {
  data: T;
  meta: PaginationMeta;
};

const extractWithMeta = <T>(response: unknown): ApiResponseWithMeta<T> => {
  const typed = response as { data: T; meta?: PaginationMeta };

  return {
    data: typed.data,
    meta: typed.meta || {
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 1,
    },
  };
};

const normalizeParams = (params: QueryParams) => {
  const next: Record<string, string | number | boolean> = {};

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      next[key] = value;
    }
  });

  return next;
};

const actionPayload = (reason?: string): AdminActionPayload => ({
  confirmation: 'CONFIRM',
  ...(reason ? { reason } : {}),
});

export const adminApi = {
  async getMetrics(periodDays = 30): Promise<AdminMetricsResponse> {
    const response = await api.get('/admin/metrics', {
      params: normalizeParams({ periodDays }),
    });

    return response.data as AdminMetricsResponse;
  },

  async getTenants(params: QueryParams = {}): Promise<PaginatedAdminResponse<AdminTenant>> {
    const response = await api.get('/admin/tenants', {
      params: normalizeParams(params),
    });

    const parsed = extractWithMeta<AdminTenant[]>(response as unknown as { data: AdminTenant[]; meta?: PaginationMeta });
    return { data: parsed.data, meta: parsed.meta };
  },

  async getTenantDetails(tenantId: string): Promise<AdminTenantDetails> {
    const response = await api.get(`/admin/tenants/${tenantId}`);
    return response.data as AdminTenantDetails;
  },

  async blockTenant(tenantId: string, reason?: string) {
    const response = await api.patch(`/admin/tenants/${tenantId}/block`, actionPayload(reason));
    return response.data;
  },

  async unblockTenant(tenantId: string, reason?: string) {
    const response = await api.patch(`/admin/tenants/${tenantId}/unblock`, actionPayload(reason));
    return response.data;
  },

  async softDeleteTenant(tenantId: string, reason?: string) {
    const response = await api.delete(`/admin/tenants/${tenantId}`, {
      data: actionPayload(reason),
    });

    return response.data;
  },

  async blockUser(userId: string, reason?: string) {
    const response = await api.patch(`/admin/users/${userId}/block`, actionPayload(reason));
    return response.data;
  },

  async unblockUser(userId: string, reason?: string) {
    const response = await api.patch(`/admin/users/${userId}/unblock`, actionPayload(reason));
    return response.data;
  },

  async getSubscriptions(params: QueryParams = {}): Promise<PaginatedAdminResponse<AdminSubscription>> {
    const response = await api.get('/admin/subscriptions', {
      params: normalizeParams(params),
    });

    const parsed = extractWithMeta<AdminSubscription[]>(response as unknown as { data: AdminSubscription[]; meta?: PaginationMeta });
    return { data: parsed.data, meta: parsed.meta };
  },

  async resyncSubscription(tenantId: string, reason?: string) {
    const response = await api.post(`/admin/subscriptions/${tenantId}/resync`, actionPayload(reason));
    return response.data;
  },

  async overrideSubscriptionPlan(tenantId: string, plan: string, reason?: string) {
    const response = await api.patch(`/admin/subscriptions/${tenantId}/plan`, {
      ...actionPayload(reason),
      plan,
    });
    return response.data;
  },

  async overrideSubscriptionStatus(tenantId: string, status: string, reason?: string) {
    const response = await api.patch(`/admin/subscriptions/${tenantId}/status`, {
      ...actionPayload(reason),
      status,
    });
    return response.data;
  },

  async cancelSubscriptionAdmin(tenantId: string, reason?: string) {
    const response = await api.post(`/admin/subscriptions/${tenantId}/cancel`, actionPayload(reason));
    return response.data;
  },

  async getAuditLogs(params: QueryParams = {}): Promise<PaginatedAdminResponse<AdminAuditLog>> {
    const response = await api.get('/admin/logs', {
      params: normalizeParams(params),
    });

    const parsed = extractWithMeta<AdminAuditLog[]>(response as unknown as { data: AdminAuditLog[]; meta?: PaginationMeta });
    return { data: parsed.data, meta: parsed.meta };
  },

  async getCoupons(): Promise<AdminCoupon[]> {
    const response = await api.get('/admin/coupons');
    const payload = response.data as { data?: AdminCoupon[] } | AdminCoupon[];
    return Array.isArray(payload) ? payload : payload.data || [];
  },

  async createCoupon(payload: AdminCouponPayload): Promise<AdminCoupon> {
    const response = await api.post('/admin/coupons', payload);
    return (response.data as { data: AdminCoupon }).data;
  },

  async updateCoupon(couponId: string, payload: AdminCouponPayload): Promise<AdminCoupon> {
    const response = await api.patch(`/admin/coupons/${couponId}`, payload);
    return (response.data as { data: AdminCoupon }).data;
  },

  async deleteCoupon(couponId: string) {
    const response = await api.delete(`/admin/coupons/${couponId}`);
    return response.data;
  },
};
