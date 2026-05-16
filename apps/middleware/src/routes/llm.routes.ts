import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.middleware';
import { invoke, status } from '../controllers/llm.controller';

const router = Router();

const llmRateLimit = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });

router.post('/invoke',       requireAuth, llmRateLimit, invoke);
router.get('/queue/status',  requireAuth, status);

export default router;
