import { db } from '@aria/db';
import { ideaCards, projects } from '@aria/db';
import { eq, and } from 'drizzle-orm';
import { AppError } from '../middleware/error.middleware';
import type { CreateIdeaRequest } from '@aria/shared';

function sanitise(s: string, max = 1000): string {
  return s.trim().slice(0, max);
}

export async function listIdeas(projectId: string, workspaceId: string) {
  if (!projectId) throw new AppError('projectId is required', 400, 'VALIDATION_ERROR');
  const p = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)),
  });
  if (!p) throw new AppError('Project not found', 404, 'NOT_FOUND');
  return db.query.ideaCards.findMany({
    where: eq(ideaCards.projectId, projectId),
    orderBy: (i, { desc }) => [desc(i.createdAt)],
  });
}

export async function createIdea(workspaceId: string, data: CreateIdeaRequest) {
  if (!data.projectId) throw new AppError('projectId is required', 400, 'VALIDATION_ERROR');
  if (!data.title?.trim()) throw new AppError('title is required', 400, 'VALIDATION_ERROR');
  if (!data.summary?.trim()) throw new AppError('summary is required', 400, 'VALIDATION_ERROR');
  if (!data.potentialUserImpact?.trim()) throw new AppError('potentialUserImpact is required', 400, 'VALIDATION_ERROR');
  if (!data.potentialBusinessImpact?.trim()) throw new AppError('potentialBusinessImpact is required', 400, 'VALIDATION_ERROR');
  const p = await db.query.projects.findFirst({
    where: and(eq(projects.id, data.projectId), eq(projects.workspaceId, workspaceId)),
  });
  if (!p) throw new AppError('Project not found', 404, 'NOT_FOUND');
  const [idea] = await db.insert(ideaCards).values({
    projectId: data.projectId,
    title: sanitise(data.title, 200),
    summary: sanitise(data.summary, 1000),
    potentialUserImpact: sanitise(data.potentialUserImpact, 500),
    potentialBusinessImpact: sanitise(data.potentialBusinessImpact, 500),
    affectedDomains: data.affectedDomains ?? [],
    roughEffortEstimate: data.roughEffortEstimate ?? null,
    suggestedRiskClass: data.suggestedRiskClass ?? 'B',
  }).returning();
  return idea;
}

export async function approveIdea(ideaId: string, workspaceId: string, approved: boolean) {
  if (!ideaId) throw new AppError('ideaId is required', 400, 'VALIDATION_ERROR');
  const existing = await db.query.ideaCards.findFirst({ where: eq(ideaCards.id, ideaId) });
  if (!existing) throw new AppError('Idea not found', 404, 'NOT_FOUND');
  const p = await db.query.projects.findFirst({
    where: and(eq(projects.id, existing.projectId), eq(projects.workspaceId, workspaceId)),
  });
  if (!p) throw new AppError('Forbidden', 403, 'FORBIDDEN');
  const [updated] = await db.update(ideaCards)
    .set({
      humanApproved: approved,
      status: approved ? 'approved' : 'rejected',
      humanApprovedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(ideaCards.id, ideaId))
    .returning();
  return updated;
}
