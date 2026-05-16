import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { start, pause, stop, status } from '../controllers/orchestrator.controller';

const router = Router();

router.post('/sessions/:id/start',  requireAuth, start);
router.post('/sessions/:id/pause',  requireAuth, pause);
router.post('/sessions/:id/stop',   requireAuth, stop);
router.get( '/sessions/:id/status', requireAuth, status);

export default router;
