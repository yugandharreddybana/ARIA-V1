import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.middleware';
import { distillHandler, preflightHandler } from '../controllers/distill.controller';

const router = Router();

const distillLimit = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });

router.post('/',           requireAuth, distillLimit, distillHandler);
router.post('/preflight',  requireAuth, distillLimit, preflightHandler);

export default router;
