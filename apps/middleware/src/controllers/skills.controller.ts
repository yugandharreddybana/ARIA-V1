import type { Response, NextFunction } from 'express';
import type { AriaRequest } from '../middleware/auth.middleware';
import { AppError } from '../middleware/error.middleware';
import * as svc from '../services/skills.service';

export async function listSkills(req: AriaRequest, res: Response, next: NextFunction) {
  try { res.json({ skills: await svc.listSkills(req.params.projectId, req.user!.workspaceId) }); } catch (e) { next(e); }
}
export async function createSkill(_req: AriaRequest, _res: Response, next: NextFunction) {
  next(new AppError('Company generation is the only way to create agents', 410, 'LEGACY_SKILL_PATH'));
}
export async function listTeams(req: AriaRequest, res: Response, next: NextFunction) {
  try { res.json({ teams: await svc.listTeams(req.params.projectId, req.user!.workspaceId) }); } catch (e) { next(e); }
}
export async function createTeam(req: AriaRequest, res: Response, next: NextFunction) {
  try { res.status(201).json({ team: await svc.createTeam(req.user!.workspaceId, { ...req.body, projectId: req.params.projectId }) }); } catch (e) { next(e); }
}
