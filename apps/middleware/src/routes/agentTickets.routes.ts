import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { agentCreateTicketSchema, agentUpdateStatusSchema } from '../schemas/tickets.schema';
import {
  agentCreateTicketHandler,
  agentUpdateTicketStatusHandler,
} from '../controllers/agentTickets.controller';

const router = Router();

router.use(requireAuth);

/**
 * POST /api/agent/tickets
 * Create a ticket on behalf of an agent skill. Requires sessionId + skillId in body.
 */
router.post('/', validate(agentCreateTicketSchema), agentCreateTicketHandler);

/**
 * PATCH /api/agent/tickets/:id/status
 * Advance or change the status of a ticket on behalf of an agent skill.
 */
router.patch('/:id/status', validate(agentUpdateStatusSchema), agentUpdateTicketStatusHandler);

export default router;
