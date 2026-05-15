import type { Request, Response, NextFunction } from 'express';
import * as svc from '../services/projects.service';
import type { AriaRequest } from '../middleware/auth.middleware';

export async function listProjects(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { workspaceId } = (req as AriaRequest).user!;
    const data = await svc.listProjects(workspaceId);
    res.json({ data });
  } catch (e) { next(e); }
}

export async function createProject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { workspaceId } = (req as AriaRequest).user!;
    const project = await svc.createProject(workspaceId, req.body as svc.CreateProjectDto);
    res.status(201).json({ data: project });
  } catch (e) { next(e); }
}

export async function getProject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { workspaceId } = (req as AriaRequest).user!;
    const project = await svc.getProject(workspaceId, req.params.id!);
    res.json({ data: project });
  } catch (e) { next(e); }
}

export async function deleteProject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { workspaceId } = (req as AriaRequest).user!;
    await svc.deleteProject(workspaceId, req.params.id!);
    res.status(204).send();
  } catch (e) { next(e); }
}

export async function connectRepo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { workspaceId } = (req as AriaRequest).user!;
    const repo = await svc.connectRepo(workspaceId, req.params.id!, req.body as svc.ConnectRepoDto);
    res.status(201).json({ data: repo });
  } catch (e) { next(e); }
}

export async function listRepos(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { workspaceId } = (req as AriaRequest).user!;
    const data = await svc.listRepos(workspaceId, req.params.id!);
    res.json({ data });
  } catch (e) { next(e); }
}
