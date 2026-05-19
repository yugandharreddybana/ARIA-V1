import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.middleware';
import {
  estimate, allocate, proposeProcurement, issueCard, freezeCard,
  proposeArbitrage, diplomatPlaybook,
} from '../controllers/finance.controller';

const router = Router();
const writeLimit = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });

router.post('/finops/estimate',         requireAuth, writeLimit, estimate);
router.post('/finops/allocate',         requireAuth, writeLimit, allocate);
router.post('/procurement/proposals',   requireAuth, writeLimit, proposeProcurement);
router.post('/treasury/cards',          requireAuth, writeLimit, issueCard);
router.post('/treasury/cards/freeze',   requireAuth, writeLimit, freezeCard);
router.post('/arbitrage/proposals',     requireAuth, writeLimit, proposeArbitrage);
router.post('/diplomat/playbook',       requireAuth, writeLimit, diplomatPlaybook);

export default router;
