import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.middleware';
import { acquireLock, releaseLock, refreshLock, inspectLock, hover, diffDecision, dispatchTask } from '../controllers/lsp.controller';

const router = Router();

// LSP traffic is bursty (every keystroke can fire hover/diagnostics). Keep these caps lenient.
const lspLimit  = rateLimit({ windowMs: 60_000, max: 600, standardHeaders: true, legacyHeaders: false });
const lockLimit = rateLimit({ windowMs: 60_000, max: 240, standardHeaders: true, legacyHeaders: false });

router.post('/locks',           requireAuth, lockLimit, acquireLock);
router.post('/locks/release',   requireAuth, lockLimit, releaseLock);
router.post('/locks/refresh',   requireAuth, lockLimit, refreshLock);
router.get('/locks/inspect',    requireAuth, inspectLock);
router.post('/hover',           requireAuth, lspLimit,  hover);
router.post('/diff/decisions',  requireAuth, lspLimit,  diffDecision);
router.post('/tasks',           requireAuth, lspLimit,  dispatchTask);

export default router;
