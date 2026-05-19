import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.middleware';
import {
  registerAgent, publishEvent, listEvents, heartbeat,
  healScan, deadlockSweep, openShadow, listDebts, listBreakers,
} from '../controllers/fleet.controller';

const router = Router();

const writeLimit  = rateLimit({ windowMs: 60_000, max: 60,  standardHeaders: true, legacyHeaders: false });
const beatLimit   = rateLimit({ windowMs: 60_000, max: 600, standardHeaders: true, legacyHeaders: false });

router.post('/agents',          requireAuth, writeLimit, registerAgent);
router.post('/events',          requireAuth, writeLimit, publishEvent);
router.get('/events',           requireAuth, listEvents);
router.post('/heartbeats',      requireAuth, beatLimit,  heartbeat);
router.post('/heal/scan',       requireAuth, writeLimit, healScan);
router.post('/deadlock/sweep',  requireAuth, writeLimit, deadlockSweep);
router.post('/shadow',          requireAuth, writeLimit, openShadow);
router.get('/debts',            requireAuth, listDebts);
router.get('/breakers',         requireAuth, listBreakers);

export default router;
