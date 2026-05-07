import express from 'express';
// @ts-ignore
import {
	register,
	login,
	refreshAccessToken,
	logout,
	me,
	verifyEmail,
	verifyEmailSession,
	confirmSignup,
	resendVerification,
	registerSchema,
	loginSchema,
	verifyEmailSchema,
	verifyEmailSessionSchema,
	resendVerificationSchema,
} from '../controllers/authController.js';
// @ts-ignore
import { validate } from '../middleware/validate.js';
// @ts-ignore
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.post('/register', validate({ body: registerSchema }), register);
router.post('/login', validate({ body: loginSchema }), login);
router.get('/verify-email', validate({ query: verifyEmailSchema }), verifyEmail);
router.post('/verify-email-session', validate({ body: verifyEmailSessionSchema }), verifyEmailSession);
router.post('/confirm', validate({ body: verifyEmailSessionSchema }), confirmSignup);
router.post('/resend-verification', validate({ body: resendVerificationSchema }), resendVerification);
router.post('/refresh', refreshAccessToken);
router.post('/logout', logout);
router.get('/me', authMiddleware, me);

export default router;
