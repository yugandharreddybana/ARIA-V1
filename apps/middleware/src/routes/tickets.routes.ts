import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { listTickets, createTicket, updateTicket } from '../controllers/tickets.controller';

const router = Router();
router.use(requireAuth);
router.get('/', listTickets);
router.post('/', createTicket);
router.patch('/:id', updateTicket);
export default router;
