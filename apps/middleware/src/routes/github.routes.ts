import { Router } from 'express';
import { githubStart, githubCallback } from '../controllers/github.controller';

const router = Router();

router.get('/start', githubStart);
router.get('/callback', githubCallback);

export default router;
