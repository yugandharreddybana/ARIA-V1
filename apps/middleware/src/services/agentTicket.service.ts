import { db } from '@aria/db';
import { tickets, projects, skills } from '@aria/db';
import { eq, and } from 'drizzle-orm';
import { AppError } from '../middleware/error.middleware';
import type { TicketType, TicketStatus } from '@aria/shared';

function sanitise(s: string, max: number): string {
  return s.trim().slice(0, max);
}

export interface AgentCreateTicketParams {
  sessionId: string;
  skillId: string;
  workspaceId: string;
  projectId: string;
  title: string;
  description: string;
  type: TicketType;
  riskClass?: 'A' | 'B' | 'C';
  affectedDomains?: string[];
  promptBlock?: unknown;
}

/**
 * Creates a ticket on behalf of an agent skill, stamping both sessionId
 * and createdBySkillId so the Kanban board can display provenance.
 * Enforces workspace-level IDOR: both skill and project must belong to workspaceId.
 */
export async function agentCreateTicket(params: AgentCreateTicketParams) {
  const { sessionId, skillId, workspaceId, projectId } = params;

  // Verify skill belongs to this workspace
  const skill = await db.query.skills.findFirst({
    where: and(eq(skills.id, skillId), eq(skills.workspaceId, workspaceId)),
  });
  if (!skill) throw new AppError('Skill not found or access denied', 403, 'FORBIDDEN');

  // Verify project belongs to this workspace
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)),
  });
  if (!project) throw new AppError('Project not found or access denied', 404, 'NOT_FOUND');

  if (!params.title?.trim())       throw new AppError('title required', 400, 'VALIDATION_ERROR');
  if (!params.description?.trim()) throw new AppError('description required', 400, 'VALIDATION_ERROR');
  if (!params.type)                throw new AppError('type required', 400, 'VALIDATION_ERROR');

  const [ticket] = await db
    .insert(tickets)
    .values({
      projectId,
      sessionId,
      createdBySkillId: skillId,
      type: params.type,
      title: sanitise(params.title, 500),
      description: sanitise(params.description, 5000),
      riskClass: params.riskClass ?? 'B',
      affectedDomains: params.affectedDomains ?? [],
      promptBlock: params.promptBlock ?? null,
      humanApproved: false,
      status: 'backlog' as TicketStatus,
    })
    .returning();

  return ticket;
}

/**
 * Advances or changes a ticket's status on behalf of an agent.
 * Verifies workspace ownership via the ticket's parent project.
 */
export async function agentUpdateTicketStatus(
  ticketId: string,
  workspaceId: string,
  status: TicketStatus,
  _skillId: string,
) {
  if (!ticketId) throw new AppError('ticketId required', 400, 'VALIDATION_ERROR');

  const existing = await db.query.tickets.findFirst({
    where: eq(tickets.id, ticketId),
  });
  if (!existing) throw new AppError('Ticket not found', 404, 'NOT_FOUND');

  // IDOR: confirm the ticket's project is in the caller's workspace
  const project = await db.query.projects.findFirst({
    where: and(
      eq(projects.id, existing.projectId),
      eq(projects.workspaceId, workspaceId),
    ),
  });
  if (!project) throw new AppError('Forbidden', 403, 'FORBIDDEN');

  const [updated] = await db
    .update(tickets)
    .set({ status, updatedAt: new Date() })
    .where(eq(tickets.id, ticketId))
    .returning();

  return updated;
}
