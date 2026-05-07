import express from 'express';
// @ts-ignore
import { authMiddleware } from '../middleware/auth.js';
// @ts-ignore
import { requireRole, requireTenantRoles } from '../middleware/rbac.js';
// @ts-ignore
import { requireFeature } from '../middleware/subscriptionGuard.js';
// @ts-ignore
import { validate } from '../middleware/validate.js';
// @ts-ignore
import { getServices, createService, updateService, deleteService } from '../controllers/serviceController.js';
// @ts-ignore
import { getBarbers, createBarber, updateBarber, deleteBarber } from '../controllers/barberController.js';
// @ts-ignore
import {
	createServiceSchema,
	updateServiceSchema,
	createBarberSchema,
	updateBarberSchema,
	updateBarbershopSettingsSchema,
	updateBarbershopProfileSchema,
	updateAccountProfileSchema,
	updateAccountPasswordSchema,
} from '../validators/schemas/index.js';
// @ts-ignore
import {
	getBarbershopSettings,
	getBarbershopProfile,
	updateBarbershopProfile,
	updateBarbershopSettings,
	getAccountProfile,
	updateAccountProfile,
	updateAccountPassword,
} from '../controllers/barbershopSettingsController.js';

const router = express.Router();

router.get('/services', authMiddleware, requireTenantRoles, requireFeature('services'), getServices);
router.post('/services', authMiddleware, requireTenantRoles, requireFeature('services'), validate({ body: createServiceSchema }), createService);
router.put('/services/:id', authMiddleware, requireTenantRoles, requireFeature('services'), validate({ body: updateServiceSchema }), updateService);
router.delete('/services/:id', authMiddleware, requireTenantRoles, requireFeature('services'), deleteService);

router.get('/barbers', authMiddleware, requireTenantRoles, requireFeature('services'), getBarbers);
router.post('/barbers', authMiddleware, requireTenantRoles, requireFeature('services'), validate({ body: createBarberSchema }), createBarber);
router.put('/barbers/:id', authMiddleware, requireTenantRoles, requireFeature('services'), validate({ body: updateBarberSchema }), updateBarber);
router.delete('/barbers/:id', authMiddleware, requireTenantRoles, requireFeature('services'), deleteBarber);

router.get('/settings', authMiddleware, requireTenantRoles, requireFeature('advanced_admin'), getBarbershopSettings);
router.put('/settings', authMiddleware, requireTenantRoles, requireFeature('advanced_admin'), validate({ body: updateBarbershopSettingsSchema }), updateBarbershopSettings);

router.get('/profile', authMiddleware, requireTenantRoles, requireFeature('billing'), getBarbershopProfile);
router.put('/profile', authMiddleware, requireTenantRoles, requireFeature('billing'), validate({ body: updateBarbershopProfileSchema }), updateBarbershopProfile);
router.get('/account-profile', authMiddleware, requireRole(['tenant_admin']), getAccountProfile);
router.put('/account-profile', authMiddleware, requireRole(['tenant_admin']), validate({ body: updateAccountProfileSchema }), updateAccountProfile);
router.put('/account-password', authMiddleware, requireRole(['tenant_admin']), requireFeature('advanced_admin'), validate({ body: updateAccountPasswordSchema }), updateAccountPassword);

export default router;
