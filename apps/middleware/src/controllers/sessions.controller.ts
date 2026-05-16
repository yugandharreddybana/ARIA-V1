import type { Response, NextFunction } from 'express';
import type { AriaRequest } from '../middleware/auth.middleware';
import * as svc from '../services/sessions.service';

export async function listSessions(req: AriaRequest, res: Response, next: NextFunction) {
  try {
    const projectId = req.query.projectId as string;
    if (!projectId) { res.status(400).json({ success: false, error: 'projectId query param required', code: 'VALIDATION_ERROR' }); return; }
    res.json({ sessions: await svc.listSessions(projectId, req.user!.workspaceId) });
  } catch (e) { next(e); }
}

export async function createSession(req: AriaRequest, res: Response, next: NextFunction) {
  try { res.status(201).json({ session: await svc.createSession(req.user!.workspaceId, req.body) }); } catch (e) { next(e); }
}

export async function updateSession(req: AriaRequest, res: Response, next: NextFunction) {
  try {
    if (!req.body.state) { res.status(400).json({ success: false, error: 'state is required', code: 'VALIDATION_ERROR' }); return; }
    res.json({ session: await svc.updateSessionState(req.params.id, req.user!.workspaceId, req.body.state) });
  } catch (e) { next(e); }
}
