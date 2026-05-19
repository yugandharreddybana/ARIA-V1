import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.middleware';
import { upsert, get } from '../controllers/uiDiscovery.controller';

const router = Router();

const writeLimit = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });

router.post('/',            requireAuth, writeLimit, upsert);
router.get('/:ticketId',    requireAuth, get);

export default router;
