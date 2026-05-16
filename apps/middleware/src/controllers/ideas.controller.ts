import type { Response, NextFunction } from 'express';
import type { AriaRequest } from '../middleware/auth.middleware';
import * as svc from '../services/ideas.service';

export async function listIdeas(req: AriaRequest, res: Response, next: NextFunction) {
  try {
    const projectId = req.query.projectId as string;
    if (!projectId) { res.status(400).json({ success: false, error: 'projectId query param required', code: 'VALIDATION_ERROR' }); return; }
    res.json({ ideas: await svc.listIdeas(projectId, req.user!.workspaceId) });
  } catch (e) { next(e); }
}
export async function createIdea(req: AriaRequest, res: Response, next: NextFunction) {
  try { res.status(201).json({ idea: await svc.createIdea(req.user!.workspaceId, req.body) }); } catch (e) { next(e); }
}
export async function approveIdea(req: AriaRequest, res: Response, next: NextFunction) {
  try {
    if (typeof req.body.approved !== 'boolean') { res.status(400).json({ success: false, error: 'approved (boolean) is required', code: 'VALIDATION_ERROR' }); return; }
    res.json({ idea: await svc.approveIdea(req.params.id, req.user!.workspaceId, req.body.approved) });
  } catch (e) { next(e); }
}
