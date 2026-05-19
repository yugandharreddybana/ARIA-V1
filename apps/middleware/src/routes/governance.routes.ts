import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.middleware';
import { scan, list, decide, redact, exportAudit, explain } from '../controllers/governance.controller';

const router = Router();
const writeLimit = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });

router.post('/compliance/scan',           requireAuth, writeLimit, scan);
router.get('/compliance',                 requireAuth, list);
router.post('/compliance/:id/decide',     requireAuth, writeLimit, decide);
router.post('/gdpr/redact',               requireAuth, writeLimit, redact);
router.post('/audit/export',              requireAuth, writeLimit, exportAudit);
router.post('/explain/:sessionId',        requireAuth, writeLimit, explain);

export default router;
