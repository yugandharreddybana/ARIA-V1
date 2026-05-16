import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { listIdeas, createIdea, approveIdea } from '../controllers/ideas.controller';

const router = Router();
router.use(requireAuth);
router.get('/', listIdeas);
router.post('/', createIdea);
router.patch('/:id/approve', approveIdea);
export default router;
