/**
 * Barrel — re-exporta todos os schemas por domínio.
 * Mantém backward-compat com `import { ... } from '../validators/schemas/index.js'`
 */

export {
	registerSchema,
	loginSchema,
	verifyEmailSchema,
	verifyEmailSessionSchema,
	resendVerificationSchema,
} from './authSchemas.js';
export { createAppointmentSchema, updateAppointmentSchema, updateStatusSchema } from './appointmentSchemas.js';
export { createClientSchema, updateClientSchema } from './clientSchemas.js';
export { addExpenseSchema, updateExpenseSchema } from './financeSchemas.js';
export { createServiceSchema, updateServiceSchema } from './serviceSchemas.js';
export { createBarberSchema, updateBarberSchema } from './barberSchemas.js';
export {
	updateBarbershopSettingsSchema,
	updateBarbershopProfileSchema,
} from './barbershopSettingsSchemas.js';
export { createCheckoutSessionSchema } from './subscriptionSchemas.js';
export {
	createBillingCheckoutSessionSchema,
	billingActionBodySchema,
	billingPixPaymentParamsSchema,
} from './billingSchemas.js';
export {
	adminMetricsQuerySchema,
	adminTenantListQuerySchema,
	adminSubscriptionListQuerySchema,
	adminAuditLogQuerySchema,
	adminActionParamsSchema,
	adminActionBodySchema,
} from './adminSchemas.js';
