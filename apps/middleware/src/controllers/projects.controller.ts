import type { Response, NextFunction } from 'express';
import type { AriaRequest } from '../middleware/auth.middleware';
import * as svc from '../services/projects.service';

export async function listProjects(req: AriaRequest, res: Response, next: NextFunction) {
  try { res.json({ projects: await svc.listProjects(req.user!.workspaceId) }); } catch (e) { next(e); }
}
export async function getProject(req: AriaRequest, res: Response, next: NextFunction) {
  try { res.json({ project: await svc.getProject(req.params.id, req.user!.workspaceId) }); } catch (e) { next(e); }
}
export async function createProject(req: AriaRequest, res: Response, next: NextFunction) {
  try { res.status(201).json({ project: await svc.createProject(req.user!.workspaceId, req.body.name, req.body.description) }); } catch (e) { next(e); }
}
export async function archiveProject(req: AriaRequest, res: Response, next: NextFunction) {
  try { await svc.archiveProject(req.params.id, req.user!.workspaceId); res.status(204).send(); } catch (e) { next(e); }
}
export async function connectRepo(req: AriaRequest, res: Response, next: NextFunction) {
  try { res.status(201).json({ repo: await svc.connectRepo(req.params.id, req.user!.workspaceId, req.body.repoUrl, req.body.branch) }); } catch (e) { next(e); }
}
