import { db } from '@aria/db';
import { ideaCards, projects } from '@aria/db';
import { eq, and } from 'drizzle-orm';
import { AppError } from '../middleware/error.middleware';
import type { CreateIdeaRequest } from '@aria/shared';

function sanitise(s: string, max: number): string {
  return s.trim().slice(0, max);
}

export async function listIdeas(projectId: string, workspaceId: string) {
  if (!projectId) throw new AppError('projectId is required', 400, 'VALIDATION_ERROR');
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)),
  });
  if (!project) throw new AppError('Project not found or access denied', 404, 'NOT_FOUND');
  return db.query.ideaCards.findMany({
    where: eq(ideaCards.projectId, projectId),
    orderBy: (i, { desc }) => [desc(i.createdAt)],
  });
}

export async function createIdea(
  workspaceId: string,
  data: CreateIdeaRequest,
) {
  // Required field validation
  if (!data.projectId) throw new AppError('projectId is required', 400, 'VALIDATION_ERROR');
  if (!data.title?.trim()) throw new AppError('title is required', 400, 'VALIDATION_ERROR');
  if (!data.summary?.trim()) throw new AppError('summary is required', 400, 'VALIDATION_ERROR');
  if (!data.potentialUserImpact?.trim())
    throw new AppError('potentialUserImpact is required', 400, 'VALIDATION_ERROR');
  if (!data.potentialBusinessImpact?.trim())
    throw new AppError('potentialBusinessImpact is required', 400, 'VALIDATION_ERROR');

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, data.projectId), eq(projects.workspaceId, workspaceId)),
  });
  if (!project) throw new AppError('Project not found or access denied', 404, 'NOT_FOUND');

  // Column names verified against packages/db/src/schema/ideas.ts
  const [idea] = await db
    .insert(ideaCards)
    .values({
      projectId: data.projectId,
      title: sanitise(data.title, 500),
      summary: sanitise(data.summary, 5000),
      potentialUserImpact: sanitise(data.potentialUserImpact, 2000),
      potentialBusinessImpact: sanitise(data.potentialBusinessImpact, 2000),
      affectedDomains: data.affectedDomains ?? [],
      roughEffortEstimate: data.roughEffortEstimate ?? null,
      suggestedRiskClass: data.suggestedRiskClass ?? 'B',
    })
    .returning();
  return idea;
}

export async function approveIdea(
  ideaId: string,
  workspaceId: string,
  approved: boolean,
) {
  if (!ideaId) throw new AppError('ideaId is required', 400, 'VALIDATION_ERROR');

  const existing = await db.query.ideaCards.findFirst({
    where: eq(ideaCards.id, ideaId),
  });
  if (!existing) throw new AppError('Idea not found', 404, 'NOT_FOUND');

  // Verify workspace ownership before allowing approval
  const project = await db.query.projects.findFirst({
    where: and(
      eq(projects.id, existing.projectId),
      eq(projects.workspaceId, workspaceId),
    ),
  });
  if (!project) throw new AppError('Forbidden', 403, 'FORBIDDEN');

  // Column names verified against packages/db/src/schema/ideas.ts:
  // humanApproved, humanApprovedAt, status, updatedAt
  const [updated] = await db
    .update(ideaCards)
    .set({
      humanApproved: approved,
      humanApprovedAt: new Date(),
      status: approved ? 'approved' : 'rejected',
      updatedAt: new Date(),
    })
    .where(eq(ideaCards.id, ideaId))
    .returning();
  return updated;
}
