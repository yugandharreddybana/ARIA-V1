import type { Response, NextFunction } from 'express';
import type { AriaRequest } from '../middleware/auth.middleware';
import * as svc from '../services/skills.service';

export async function listSkills(req: AriaRequest, res: Response, next: NextFunction) {
  try { res.json({ skills: await svc.listSkills(req.params.projectId, req.user!.workspaceId) }); } catch (e) { next(e); }
}
export async function createSkill(req: AriaRequest, res: Response, next: NextFunction) {
  try { res.status(201).json({ skill: await svc.createSkill(req.params.projectId, req.user!.workspaceId, req.body) }); } catch (e) { next(e); }
}
export async function listTeams(req: AriaRequest, res: Response, next: NextFunction) {
  try { res.json({ teams: await svc.listTeams(req.params.projectId, req.user!.workspaceId) }); } catch (e) { next(e); }
}
export async function createTeam(req: AriaRequest, res: Response, next: NextFunction) {
  try { res.status(201).json({ team: await svc.createTeam(req.user!.workspaceId, { ...req.body, projectId: req.params.projectId }) }); } catch (e) { next(e); }
}
