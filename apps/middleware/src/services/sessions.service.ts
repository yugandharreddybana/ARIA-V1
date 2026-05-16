import { db } from '@aria/db';
import { sessions, projects } from '@aria/db';
import { eq, and } from 'drizzle-orm';
import { AppError } from '../middleware/error.middleware';
import type { CreateSessionRequest } from '@aria/shared';

// Exhaustive list from sessionStateEnum in packages/db/src/schema/sessions.ts
const VALID_SESSION_STATES = [
  'new',
  'bootstrapping',
  'scrumming',
  'working',
  'paused',
  'completed',
  'failed',
] as const;

type SessionState = (typeof VALID_SESSION_STATES)[number];

function assertValidState(state: string): asserts state is SessionState {
  if (!(VALID_SESSION_STATES as readonly string[]).includes(state)) {
    throw new AppError(
      `Invalid session state '${state}'. Must be one of: ${VALID_SESSION_STATES.join(', ')}`,
      400,
      'VALIDATION_ERROR',
    );
  }
}

export async function listSessions(projectId: string, workspaceId: string) {
  if (!projectId) throw new AppError('projectId is required', 400, 'VALIDATION_ERROR');
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)),
  });
  if (!project) throw new AppError('Project not found or access denied', 404, 'NOT_FOUND');
  return db.query.sessions.findMany({
    where: eq(sessions.projectId, projectId),
    orderBy: (s, { desc }) => [desc(s.createdAt)],
  });
}

export async function createSession(
  workspaceId: string,
  data: CreateSessionRequest,
) {
  if (!data.projectId) throw new AppError('projectId is required', 400, 'VALIDATION_ERROR');
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, data.projectId), eq(projects.workspaceId, workspaceId)),
  });
  if (!project) throw new AppError('Project not found or access denied', 404, 'NOT_FOUND');
  const [session] = await db
    .insert(sessions)
    .values({
      projectId: data.projectId,
      workspaceId,
      mode: data.mode ?? 'precision',
      environment: data.environment ?? 'dev',
      missionType: data.missionType ?? 'feature',
      missionRiskAppetite: data.missionRiskAppetite ?? 'moderate',
      missionScope: data.missionScope ?? [],
      tokenBudget: data.tokenBudget ?? null,
      timeBudgetMinutes: data.timeBudgetMinutes ?? null,
    })
    .returning();
  return session;
}

export async function updateSessionState(
  sessionId: string,
  workspaceId: string,
  state: string,
) {
  if (!sessionId) throw new AppError('sessionId is required', 400, 'VALIDATION_ERROR');

  // Validate state against the DB enum BEFORE hitting the database
  assertValidState(state);

  const existing = await db.query.sessions.findFirst({
    where: eq(sessions.id, sessionId),
  });
  if (!existing) throw new AppError('Session not found', 404, 'NOT_FOUND');

  // Verify workspace ownership before allowing mutation
  const project = await db.query.projects.findFirst({
    where: and(
      eq(projects.id, existing.projectId),
      eq(projects.workspaceId, workspaceId),
    ),
  });
  if (!project) throw new AppError('Forbidden', 403, 'FORBIDDEN');

  const isTerminal = state === 'completed' || state === 'failed';
  const [updated] = await db
    .update(sessions)
    .set({
      state,
      ...(isTerminal ? { endedAt: new Date() } : {}),
    })
    .where(eq(sessions.id, sessionId))
    .returning();
  return updated;
}
