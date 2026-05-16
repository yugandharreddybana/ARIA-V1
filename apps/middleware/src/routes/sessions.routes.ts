import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { listSessions, createSession, updateSession } from '../controllers/sessions.controller';

const router = Router();
router.use(requireAuth);
router.get('/', listSessions);
router.post('/', createSession);
router.patch('/:id', updateSession);
export default router;
