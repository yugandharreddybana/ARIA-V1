import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { fetchConceptGraph, deleteConceptGraph } from '../controllers/graph.controller';

const router = Router();
router.use(requireAuth);
router.get('/:projectId', fetchConceptGraph);
router.delete('/:projectId', deleteConceptGraph);
export default router;
