import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requireTenantRoles } from '../middleware/rbac.js';
import { requireFeature } from '../middleware/subscriptionGuard.js';
import { validate } from '../middleware/validate.js';
import { getServices, createService, updateService, deleteService } from '../controllers/serviceController.js';
import { getBarbers, createBarber, updateBarber, deleteBarber } from '../controllers/barberController.js';
import {
	createServiceSchema,
	updateServiceSchema,
	createBarberSchema,
	updateBarberSchema,
	updateBarbershopSettingsSchema,
	updateBarbershopProfileSchema,
} from '../validators/schemas/index.js';
import {
	getBarbershopSettings,
	getBarbershopProfile,
	updateBarbershopProfile,
	updateBarbershopSettings,
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

export default router;
