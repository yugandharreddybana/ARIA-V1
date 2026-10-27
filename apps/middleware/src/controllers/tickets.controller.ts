import type { Response, NextFunction } from 'express';
import type { AriaRequest } from '../middleware/auth.middleware';
import * as svc from '../services/tickets.service';

export async function getTicket(req: AriaRequest, res: Response, next: NextFunction) {
  try { res.json({ ticket: await svc.getTicket(req.params.id, req.user!.workspaceId) }); } catch (e) { next(e); }
}

export async function listTickets(req: AriaRequest, res: Response, next: NextFunction) {
  try {
    const projectId = req.query.projectId as string;
    if (!projectId) { res.status(400).json({ success: false, error: 'projectId query param required', code: 'VALIDATION_ERROR' }); return; }
    const sprintId = typeof req.query.sprintId === 'string' ? req.query.sprintId : undefined;
    const backlog = req.query.backlog === '1' || req.query.backlog === 'true';
    const issueType = typeof req.query.issueType === 'string' ? req.query.issueType : undefined;
    res.json({
      tickets: await svc.listTickets(projectId, req.user!.workspaceId, {
        sprintId: sprintId ?? null,
        backlog: backlog || undefined,
        issueType,
      }),
    });
  } catch (e) { next(e); }
}

export async function createTicket(req: AriaRequest, res: Response, next: NextFunction) {
  try { res.status(201).json({ ticket: await svc.createTicket(req.user!.workspaceId, req.body) }); } catch (e) { next(e); }
}

export async function updateTicket(req: AriaRequest, res: Response, next: NextFunction) {
  try { res.json({ ticket: await svc.updateTicket(req.params.id, req.user!.workspaceId, req.body, req.user!.userId) }); } catch (e) { next(e); }
}
