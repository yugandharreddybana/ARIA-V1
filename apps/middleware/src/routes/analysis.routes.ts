import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { listAnalysisJobs, getAnalysisJob } from '../controllers/analysis.controller';

const router = Router();
router.use(requireAuth);
router.get('/', listAnalysisJobs);
router.get('/:jobId', getAnalysisJob);
export default router;
