import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { AppError } from '../middleware/error.middleware';
import { createProjectSchema, updateProjectSchema, connectRepoSchema } from '../schemas/project.schemas';
import * as ctrl from '../controllers/projects.controller';
import { triggerAnalysisJob } from '../controllers/analysis.controller';

const router = Router();
router.use(requireAuth);

function rejectBadUuid(name: string) {
  return (_req: Request, _res: Response, next: NextFunction, value: string) => {
    if (!z.string().uuid().safeParse(value).success) {
      next(new AppError(`${name} must be a uuid`, 400, 'VALIDATION_ERROR'));
      return;
    }
    next();
  };
}

router.param('id', rejectBadUuid('id'));
router.param('repoId', rejectBadUuid('repoId'));

router.get('/', ctrl.listProjects);
router.get('/:id', ctrl.getProject);
router.post('/', validate(createProjectSchema), ctrl.createProject);
router.patch('/:id', validate(updateProjectSchema), ctrl.updateProject);
router.delete('/:id', ctrl.archiveProject);
router.post('/:id/repos', validate(connectRepoSchema), ctrl.connectRepo);
router.post('/:id/repos/:repoId/analyze', triggerAnalysisJob);

export default router;
