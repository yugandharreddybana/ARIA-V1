import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { createProjectSchema, connectRepoSchema } from '../schemas/projects.schemas';
import { listProjects, createProject, getProject, deleteProject, connectRepo, listRepos } from '../controllers/projects.controller';

const router = Router();

router.use(authMiddleware);

router.get('/', listProjects);
router.post('/', validate(createProjectSchema), createProject);
router.get('/:id', getProject);
router.delete('/:id', deleteProject);
router.get('/:id/repos', listRepos);
router.post('/:id/repos', validate(connectRepoSchema), connectRepo);

export default router;
