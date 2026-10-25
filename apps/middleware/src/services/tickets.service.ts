import { db } from '@aria/db';
import { tickets, projects } from '@aria/db';
import { eq, and } from 'drizzle-orm';
import { AppError } from '../middleware/error.middleware';
import type { CreateTicketRequest, UpdateTicketRequest } from '@aria/shared';
import { splitSuggested } from './tickets/schedule';
import { estimateStoryPoints } from './tickets/pointEstimate';
import { appendTicketEvent } from './tickets/ticketEvents';
import { applyTransition, approveTicket, assertHumanStatus, workCalendar } from './tickets/ticketActions';
import { dueAt } from './tickets/schedule';

function sanitise(s: string, max: number): string {
  return s.trim().slice(0, max);
}

export async function listTickets(projectId: string, workspaceId: string) {
  if (!projectId) throw new AppError('projectId is required', 400, 'VALIDATION_ERROR');
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)),
  });
  if (!project) throw new AppError('Project not found or access denied', 404, 'NOT_FOUND');
  return db.query.tickets.findMany({
    where: eq(tickets.projectId, projectId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
}

export async function createTicket(
  workspaceId: string,
  data: CreateTicketRequest,
) {
  if (!data.projectId) throw new AppError('projectId is required', 400, 'VALIDATION_ERROR');
  if (!data.title?.trim()) throw new AppError('title is required', 400, 'VALIDATION_ERROR');
  if (!data.description?.trim()) throw new AppError('description is required', 400, 'VALIDATION_ERROR');
  if (!data.type) throw new AppError('type is required', 400, 'VALIDATION_ERROR');

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, data.projectId), eq(projects.workspaceId, workspaceId)),
  });
  if (!project) throw new AppError('Project not found or access denied', 404, 'NOT_FOUND');

  const estimated = data.storyPoints == null
    ? await estimateStoryPoints(workspaceId, data.title, data.description)
    : null;
  const points = data.storyPoints ?? estimated?.points ?? 1;
  const pointSource = data.storyPoints ? 'owner' : estimated?.source ?? 'heuristic';
  const [ticket] = await db
    .insert(tickets)
    .values({
      projectId: data.projectId,
      type: data.type,
      title: sanitise(data.title, 500),
      description: sanitise(data.description, 5000),
      riskClass: data.riskClass ?? 'B',
      affectedDomains: data.affectedDomains ?? [],
      storyPoints: points,
      splitSuggested: splitSuggested(points),
      flowId: data.flowId ?? null,
      layer: data.layer ?? null,
    })
    .returning();
  if (ticket) {
    await appendTicketEvent({
      workspaceId,
      projectId: data.projectId,
      ticketId: ticket.id,
      eventType: data.storyPoints ? 'owner_decision' : 'agent_action',
      actorKind: data.storyPoints ? 'owner' : 'system',
      summary: data.storyPoints ? `Owner set ${points} story points` : `Estimated ${points} story points`,
      detail: { storyPoints: points, splitSuggested: splitSuggested(points), source: pointSource },
    });
  }
  return ticket;
}

export async function updateTicket(
  ticketId: string,
  workspaceId: string,
  data: UpdateTicketRequest,
) {
  if (!ticketId) throw new AppError('ticketId is required', 400, 'VALIDATION_ERROR');

  const existing = await db.query.tickets.findFirst({
    where: eq(tickets.id, ticketId),
  });
  if (!existing) throw new AppError('Ticket not found', 404, 'NOT_FOUND');

  // Verify workspace ownership before allowing mutation
  const project = await db.query.projects.findFirst({
    where: and(
      eq(projects.id, existing.projectId),
      eq(projects.workspaceId, workspaceId),
    ),
  });
  if (!project) throw new AppError('Forbidden', 403, 'FORBIDDEN');

  // Strict allowlist — only fields defined in UpdateTicketRequest
  // UpdateTicketRequest: status, assignedSkillId, humanApproved, title, description
  const patch: Partial<{
    status: typeof existing.status;
    assignedSkillId: string | null;
    humanApproved: boolean;
    title: string;
    description: string;
    storyPoints: number;
    splitSuggested: boolean;
    flowId: string | null;
    layer: string | null;
    dueAt: Date;
    updatedAt: Date;
  }> = { updatedAt: new Date() };

  if (data.action === 'approve') {
    await approveTicket(ticketId, workspaceId);
    return db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) });
  }
  if (data.action === 'unblock') {
    await applyTransition(ticketId, 'unblock', { actorKind: 'owner' });
    return db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) });
  }
  if (data.action === 'reject') {
    await applyTransition(ticketId, 'reject', { actorKind: 'owner' });
    return db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) });
  }
  if (data.status !== undefined) {
    assertHumanStatus(data.status);
    patch.status = data.status;
  }
  if (data.assignedSkillId !== undefined) patch.assignedSkillId = data.assignedSkillId;
  if (data.humanApproved !== undefined) patch.humanApproved = data.humanApproved;
  if (data.title !== undefined) patch.title = sanitise(data.title, 500);
  if (data.description !== undefined) patch.description = sanitise(data.description, 5000);
  if (data.storyPoints !== undefined) {
    patch.storyPoints = data.storyPoints;
    patch.splitSuggested = splitSuggested(data.storyPoints);
    if (existing.workStartedAt) patch.dueAt = dueAt(new Date(existing.workStartedAt), data.storyPoints, workCalendar());
  }
  if (data.flowId !== undefined) patch.flowId = data.flowId;
  if (data.layer !== undefined) patch.layer = data.layer;

  const [updated] = await db
    .update(tickets)
    .set(patch)
    .where(eq(tickets.id, ticketId))
    .returning();
  if (data.storyPoints !== undefined && updated) {
    await appendTicketEvent({
      workspaceId,
      projectId: existing.projectId,
      ticketId,
      eventType: 'owner_decision',
      actorKind: 'owner',
      summary: `Owner set story points to ${data.storyPoints}`,
      detail: { storyPoints: data.storyPoints, splitSuggested: splitSuggested(data.storyPoints) },
    });
  }
  return updated;
}
