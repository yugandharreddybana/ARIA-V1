import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { createTicketSchema, updateTicketSchema } from '../schemas/tickets.schema';
import { listTickets, createTicket, updateTicket } from '../controllers/tickets.controller';

const router = Router();

router.use(requireAuth);

/** GET /api/tickets?projectId=<uuid>  — list all tickets for a project */
router.get('/', listTickets);

/** POST /api/tickets  — human creates a ticket via the UI */
router.post('/', validate(createTicketSchema), createTicket);

/** PATCH /api/tickets/:id  — human updates status / fields via the UI */
router.patch('/:id', validate(updateTicketSchema), updateTicket);

export default router;
