import express from 'express';
import { register, login, registerSchema, loginSchema } from '../controllers/authController.js';
import { validate } from '../middleware/validate.js';

const router = express.Router();

router.post('/register', validate({ body: registerSchema }), register);
router.post('/login', validate({ body: loginSchema }), login);

export default router;
