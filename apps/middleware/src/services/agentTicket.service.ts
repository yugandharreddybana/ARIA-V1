import { db } from '@aria/db';
import { tickets, projects, skills } from '@aria/db';
import { eq, and } from 'drizzle-orm';
import { AppError } from '../middleware/error.middleware';
import type { AcceptanceCriterion, IssueType, TicketType, TicketStatus } from '@aria/shared';
import { daysToPoints, estimatePoints, splitSuggested } from './tickets/schedule';
import { appendTicketEvent } from './tickets/ticketEvents';
import { getPgPool } from './db.client';

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
  issueType?: IssueType;
  parentId?: string | null;
  epicId?: string | null;
  acceptanceCriteria?: AcceptanceCriterion[];
  predictedPaths?: string[];
  storyPoints?: number;
  estimatedDays?: number;
}

/**
 * Creates a ticket on behalf of an agent skill, stamping both sessionId
 * and createdBySkillId so the Kanban board can display provenance.
 * Enforces workspace-level IDOR: both skill and project must belong to workspaceId.
 */
export async function agentCreateTicket(params: AgentCreateTicketParams) {
  const { sessionId, skillId, workspaceId, projectId } = params;

  const skill = await db.query.skills.findFirst({
    where: eq(skills.id, skillId),
  });
  if (!skill || skill.projectId !== projectId) {
    throw new AppError('Skill not found or access denied', 403, 'FORBIDDEN');
  }

  // Verify project belongs to this workspace
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)),
  });
  if (!project) throw new AppError('Project not found or access denied', 404, 'NOT_FOUND');

  if (!params.title?.trim())       throw new AppError('title required', 400, 'VALIDATION_ERROR');
  if (!params.description?.trim()) throw new AppError('description required', 400, 'VALIDATION_ERROR');
  if (!params.type)                throw new AppError('type required', 400, 'VALIDATION_ERROR');

  const issueType: IssueType = params.issueType ?? (params.parentId ? 'sub_task' : 'story');
  let parentId = params.parentId ?? null;
  let epicId = params.epicId ?? null;
  if (issueType === 'sub_task') {
    if (!parentId) throw new AppError('sub_task requires parentId', 422, 'HIERARCHY');
    const parent = await getPgPool().query<{ issue_type: string; epic_id: string | null; project_id: string }>(
      `SELECT issue_type, epic_id, project_id FROM tickets WHERE id = $1::uuid`,
      [parentId],
    );
    const row = parent.rows[0];
    if (!row || row.project_id !== projectId) throw new AppError('Parent ticket not found', 404, 'NOT_FOUND');
    if (row.issue_type !== 'story') throw new AppError('sub_task parent must be a story', 422, 'HIERARCHY');
    if (!epicId) epicId = row.epic_id;
  }

  const points = params.storyPoints
    ?? (params.estimatedDays != null ? daysToPoints(params.estimatedDays) : estimatePoints(params.title, params.description));

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
      issueType,
      parentId,
      epicId,
      acceptanceCriteria: params.acceptanceCriteria ?? [],
      predictedPaths: params.predictedPaths ?? [],
      storyPoints: points,
      splitSuggested: splitSuggested(points),
    })
    .returning();

  if (ticket) {
    await appendTicketEvent({
      workspaceId,
      projectId,
      ticketId: ticket.id,
      eventType: 'agent_action',
      actorKind: 'agent',
      agentId: skillId,
      summary: issueType === 'sub_task' ? 'Agent created sub-task' : 'Agent created ticket',
      detail: { issueType, parentId, epicId, storyPoints: points },
    });
  }

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
