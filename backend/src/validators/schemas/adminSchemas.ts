import { z } from 'zod';

const idSchema = z.object({
  id: z.string().uuid('ID inválido'),
});

const actionBodySchema = z.object({
  confirmation: z.literal('CONFIRM', { message: 'Envie confirmation=CONFIRM para confirmar esta ação' }),
  reason: z.string().trim().min(3, 'Informe o motivo da ação').max(255).optional(),
});

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const adminMetricsQuerySchema = z.object({
  periodDays: z.coerce.number().int().min(7).max(365).default(30),
});

export const adminTenantListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  plan: z.enum(['basico', 'profissional', 'premium']).optional(),
  subscriptionStatus: z.enum(['active', 'trialing', 'pending', 'past_due', 'unpaid', 'canceled', 'incomplete']).optional(),
  activity: z.enum(['active', 'inactive']).optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  sortBy: z.enum(['created_at', 'name', 'last_activity_at']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const adminSubscriptionListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  status: z.enum(['active', 'trialing', 'pending', 'past_due', 'unpaid', 'canceled', 'incomplete']).optional(),
  plan: z.enum(['basico', 'profissional', 'premium']).optional(),
  overdueOnly: z.coerce.boolean().optional(),
  sortBy: z.enum(['updated_at', 'subscription_current_period_end', 'name']).default('updated_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const adminAuditLogQuerySchema = paginationQuerySchema.extend({
  action: z.string().trim().max(80).optional(),
  status: z.enum(['success', 'failed']).optional(),
  actor: z.string().trim().max(120).optional(),
  target: z.string().trim().max(120).optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
});

export const adminActionParamsSchema = idSchema;
export const adminActionBodySchema = actionBodySchema;

export type AdminMetricsQuery = z.infer<typeof adminMetricsQuerySchema>;
export type AdminTenantListQuery = z.infer<typeof adminTenantListQuerySchema>;
export type AdminSubscriptionListQuery = z.infer<typeof adminSubscriptionListQuerySchema>;
export type AdminAuditLogQuery = z.infer<typeof adminAuditLogQuerySchema>;
export type AdminActionParams = z.infer<typeof adminActionParamsSchema>;
export type AdminActionBody = z.infer<typeof adminActionBodySchema>;
