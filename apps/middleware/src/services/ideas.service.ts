import { db } from '@aria/db';
import { ideaCards, projects } from '@aria/db';
import { eq, and } from 'drizzle-orm';
import { AppError } from '../middleware/error.middleware';
import type { CreateIdeaRequest } from '@aria/shared';

export async function listIdeas(projectId: string, workspaceId: string) {
  const p = await db.query.projects.findFirst({ where: and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)) });
  if (!p) throw new AppError('Project not found', 404);
  return db.query.ideaCards.findMany({
    where: eq(ideaCards.projectId, projectId),
    orderBy: (i, { desc }) => [desc(i.createdAt)],
  });
}

export async function createIdea(workspaceId: string, data: CreateIdeaRequest) {
  const p = await db.query.projects.findFirst({ where: and(eq(projects.id, data.projectId), eq(projects.workspaceId, workspaceId)) });
  if (!p) throw new AppError('Project not found', 404);
  const [idea] = await db.insert(ideaCards).values({
    projectId: data.projectId,
    title: data.title,
    summary: data.summary,
    potentialUserImpact: data.potentialUserImpact,
    potentialBusinessImpact: data.potentialBusinessImpact,
    affectedDomains: data.affectedDomains ?? [],
    roughEffortEstimate: data.roughEffortEstimate ?? null,
    suggestedRiskClass: data.suggestedRiskClass ?? 'B',
  }).returning();
  return idea;
}

export async function approveIdea(ideaId: string, workspaceId: string, approved: boolean) {
  const existing = await db.query.ideaCards.findFirst({ where: eq(ideaCards.id, ideaId) });
  if (!existing) throw new AppError('Idea not found', 404);
  const p = await db.query.projects.findFirst({ where: and(eq(projects.id, existing.projectId), eq(projects.workspaceId, workspaceId)) });
  if (!p) throw new AppError('Forbidden', 403);
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
