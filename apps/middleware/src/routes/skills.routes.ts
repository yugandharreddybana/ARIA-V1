import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { listSkills, createSkill, listTeams, createTeam } from '../controllers/skills.controller';

const router = Router();
router.use(requireAuth);
router.get('/:projectId/skills', listSkills);
router.post('/:projectId/skills', createSkill);
router.get('/:projectId/teams', listTeams);
router.post('/:projectId/teams', createTeam);
export default router;
