import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { createProjectSchema, connectRepoSchema } from '../schemas/project.schemas';
import * as ctrl from '../controllers/projects.controller';
import { triggerAnalysisJob } from '../controllers/analysis.controller';

const router = Router();
router.use(requireAuth);

router.get('/', ctrl.listProjects);
router.get('/:id', ctrl.getProject);
router.post('/', validate(createProjectSchema), ctrl.createProject);
router.delete('/:id', ctrl.archiveProject);
router.post('/:id/repos', validate(connectRepoSchema), ctrl.connectRepo);
router.post('/:id/repos/:repoId/analyze', triggerAnalysisJob);

export default router;
