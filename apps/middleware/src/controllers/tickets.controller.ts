import type { Response, NextFunction } from 'express';
import type { AriaRequest } from '../middleware/auth.middleware';
import * as svc from '../services/tickets.service';

export async function listTickets(req: AriaRequest, res: Response, next: NextFunction) {
  try {
    const projectId = req.query.projectId as string;
    if (!projectId) { res.status(400).json({ success: false, error: 'projectId query param required', code: 'VALIDATION_ERROR' }); return; }
    res.json({ tickets: await svc.listTickets(projectId, req.user!.workspaceId) });
  } catch (e) { next(e); }
}

export async function createTicket(req: AriaRequest, res: Response, next: NextFunction) {
  try { res.status(201).json({ ticket: await svc.createTicket(req.user!.workspaceId, req.body) }); } catch (e) { next(e); }
}

export async function updateTicket(req: AriaRequest, res: Response, next: NextFunction) {
  try { res.json({ ticket: await svc.updateTicket(req.params.id, req.user!.workspaceId, req.body) }); } catch (e) { next(e); }
}
