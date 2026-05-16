import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { chat, getModels } from '../controllers/ai.controller';

const router = Router();
router.use(requireAuth);
router.post('/chat', chat);
router.get('/models', getModels);
export default router;
