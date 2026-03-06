/**
 * Barrel — re-exporta todos os schemas por domínio.
 * Mantém backward-compat com `import { ... } from '../validators/schemas/index.js'`
 */

export { registerSchema, loginSchema } from './authSchemas.js';
export { createAppointmentSchema, updateAppointmentSchema, updateStatusSchema } from './appointmentSchemas.js';
export { createClientSchema, updateClientSchema } from './clientSchemas.js';
export { addExpenseSchema, updateExpenseSchema } from './financeSchemas.js';
export { createServiceSchema, updateServiceSchema } from './serviceSchemas.js';
export { createBarberSchema, updateBarberSchema } from './barberSchemas.js';
