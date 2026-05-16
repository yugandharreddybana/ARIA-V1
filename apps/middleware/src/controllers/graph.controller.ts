import type { Response, NextFunction } from 'express';
import type { AriaRequest } from '../middleware/auth.middleware';
import { db } from '@aria/db';
import { projects } from '@aria/db';
import { and, eq } from 'drizzle-orm';
import { AppError } from '../middleware/error.middleware';
import { getConceptGraph, clearConceptGraph } from '../services/backend.service';

/**
 * Verify that the requested projectId belongs to the authenticated user's workspace.
 * This prevents IDOR — an authenticated user from workspace A reading/deleting
 * the concept graph of a project in workspace B by guessing its UUID.
 */
async function assertProjectOwnership(
  projectId: string,
  workspaceId: string,
): Promise<void> {
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)),
  });
  if (!project) {
    throw new AppError('Project not found or access denied', 404, 'NOT_FOUND');
  }
}

export async function fetchConceptGraph(req: AriaRequest, res: Response, next: NextFunction) {
  try {
    await assertProjectOwnership(req.params.projectId, req.user!.workspaceId);
    const graph = await getConceptGraph(req.params.projectId);
    res.json(graph);
  } catch (e) { next(e); }
}

export async function deleteConceptGraph(req: AriaRequest, res: Response, next: NextFunction) {
  try {
    await assertProjectOwnership(req.params.projectId, req.user!.workspaceId);
    await clearConceptGraph(req.params.projectId);
    res.status(204).send();
  } catch (e) { next(e); }
}
