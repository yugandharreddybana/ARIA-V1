import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.middleware';
import { list, read, audit, append, appendStory, modelTransfer } from '../controllers/experience.controller';

const router = Router();

const writeLimit = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });

router.get('/',                  requireAuth, list);
router.get('/:slug',              requireAuth, read);
router.get('/:slug/audit',        requireAuth, audit);
router.post('/entries',           requireAuth, writeLimit, append);
router.post('/failure-stories',   requireAuth, writeLimit, appendStory);
router.post('/model-transfer',    requireAuth, writeLimit, modelTransfer);

export default router;
