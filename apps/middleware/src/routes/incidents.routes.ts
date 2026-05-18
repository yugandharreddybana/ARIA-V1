import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.middleware';
import { declare, list, get, transition } from '../controllers/incidents.controller';

const router = Router();

const writeLimit = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });

router.post('/',                  requireAuth, writeLimit, declare);
router.get('/',                   requireAuth, list);
router.get('/:id',                requireAuth, get);
router.post('/:id/transition',    requireAuth, writeLimit, transition);

export default router;
