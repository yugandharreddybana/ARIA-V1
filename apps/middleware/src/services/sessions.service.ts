import { db } from '@aria/db';
import { sessions, projects } from '@aria/db';
import { eq, and } from 'drizzle-orm';
import { AppError } from '../middleware/error.middleware';
import type { CreateSessionRequest } from '@aria/shared';

export async function listSessions(projectId: string, workspaceId: string) {
  const p = await db.query.projects.findFirst({ where: and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)) });
  if (!p) throw new AppError('Project not found', 404);
  return db.query.sessions.findMany({
    where: eq(sessions.projectId, projectId),
    orderBy: (s, { desc }) => [desc(s.createdAt)],
  });
}

export async function createSession(workspaceId: string, data: CreateSessionRequest) {
  const p = await db.query.projects.findFirst({ where: and(eq(projects.id, data.projectId), eq(projects.workspaceId, workspaceId)) });
  if (!p) throw new AppError('Project not found', 404);
  const [s] = await db.insert(sessions).values({
    projectId: data.projectId,
    workspaceId,
    mode: data.mode ?? 'precision',
    environment: data.environment ?? 'dev',
    missionType: data.missionType ?? 'feature',
    missionRiskAppetite: data.missionRiskAppetite ?? 'moderate',
    missionScope: data.missionScope ?? [],
    tokenBudget: data.tokenBudget ?? null,
    timeBudgetMinutes: data.timeBudgetMinutes ?? null,
  }).returning();
  return s;
}

export async function updateSessionState(sessionId: string, workspaceId: string, state: string) {
  const existing = await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
  if (!existing) throw new AppError('Session not found', 404);
  const p = await db.query.projects.findFirst({ where: and(eq(projects.id, existing.projectId), eq(projects.workspaceId, workspaceId)) });
  if (!p) throw new AppError('Forbidden', 403);
  const terminal = state === 'completed' || state === 'failed';
  const [updated] = await db.update(sessions)
    .set({ state: state as typeof existing.state, ...(terminal ? { endedAt: new Date() } : {}) })
    .where(eq(sessions.id, sessionId))
    .returning();
  return updated;
}
