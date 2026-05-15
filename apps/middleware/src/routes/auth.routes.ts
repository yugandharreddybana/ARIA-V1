import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { authController } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { signupSchema, loginSchema } from '../schemas/auth.schemas';

export const authRouter = Router();

// Stricter rate limit for auth endpoints (20 req / 15 min)
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, error: 'Too many auth attempts, please try again later.', code: 'RATE_LIMITED' },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

authRouter.post('/signup', authRateLimit, validate(signupSchema), authController.signup.bind(authController));
authRouter.post('/login', authRateLimit, validate(loginSchema), authController.login.bind(authController));
authRouter.post('/refresh', authController.refresh.bind(authController));
authRouter.post('/logout', authController.logout.bind(authController));
authRouter.get('/me', requireAuth, authController.me.bind(authController));
