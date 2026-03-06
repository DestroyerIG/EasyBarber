import express from 'express';
import { register, login, refreshAccessToken, logout, me, registerSchema, loginSchema } from '../controllers/authController.js';
import { validate } from '../middleware/validate.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.post('/register', validate({ body: registerSchema }), register);
router.post('/login', validate({ body: loginSchema }), login);
router.post('/refresh', refreshAccessToken);
router.post('/logout', logout);
router.get('/me', authMiddleware, me);

export default router;
