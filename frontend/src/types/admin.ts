export interface AdminMetricsResponse {
  totals: {
    totalAccounts: number;
    activeAccounts: number;
    suspendedAccounts: number;
    totalUsers: number;
    blockedUsers: number;
  };
  subscriptions: {
    active: number;
    canceled: number;
    trial: number;
    breakdown: Array<{ subscription_status: string; total: number }>;
    plans: Array<{ plan: string; total: number }>;
  };
  revenue: {
    monthlyRevenueCollected: number;
    estimatedMrr: number;
  };
  usage: {
    periodDays: number;
    appointmentsInPeriod: number;
    activeTenants30d: number;
    newAccountsTrend: Array<{ day: string; total: number }>;
    appointmentsTrend: Array<{ day: string; appointments: number }>;
  };
}

export interface AdminTenant {
  id: string;
  name: string;
  owner_name: string;
  email: string;
  whatsapp: string;
  plan: string;
  subscription_status: string;
  subscription_current_period_end: string | null;
  subscription_updated_at: string | null;
  active: boolean;
  suspended_at: string | null;
  suspended_reason: string | null;
  created_at: string;
  updated_at: string;
  owner_user_id: string | null;
  owner_user_email: string | null;
  owner_user_role: string | null;
  owner_user_blocked: boolean | null;
  last_activity_at: string | null;
}

export interface AdminTenantDetails {
  id: string;
  name: string;
  owner_name: string;
  email: string;
  whatsapp: string;
  plan: string;
  subscription_status: string;
  subscription_current_period_start: string | null;
  subscription_current_period_end: string | null;
  subscription_cancel_at_period_end: boolean;
  subscription_updated_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  active: boolean;
  suspended_at: string | null;
  suspended_reason: string | null;
  created_at: string;
  updated_at: string;
  owner_user_id: string | null;
  owner_user_email: string | null;
  owner_user_role: string | null;
  owner_user_blocked: boolean | null;
  usage: {
    totalUsers: number;
    blockedUsers: number;
    totalClients: number;
    totalAppointmentsMonth: number;
    totalServices: number;
    totalBarbers: number;
    lastActivityAt: string | null;
  };
}

export interface AdminSubscription {
  tenant_id: string;
  name: string;
  email: string;
  plan: string;
  subscription_status: string;
  subscription_current_period_start: string | null;
  subscription_current_period_end: string | null;
  subscription_cancel_at_period_end: boolean;
  subscription_updated_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  owner_user_email: string | null;
  active: boolean;
}

export interface AdminAuditLog {
  id: string;
  action_type: string;
  actor_user_id: string | null;
  actor_user_email: string | null;
  actor_barbershop_id: string | null;
  actor_tenant_name: string | null;
  target_user_id: string | null;
  target_user_email: string | null;
  target_barbershop_id: string | null;
  target_tenant_name: string | null;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  status: 'success' | 'failed';
  error_message: string | null;
  created_at: string;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedAdminResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface AdminActionPayload {
  confirmation: 'CONFIRM';
  reason?: string;
}
