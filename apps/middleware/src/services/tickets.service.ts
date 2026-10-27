import { z } from 'zod';
import { db } from '@aria/db';
import { tickets, projects } from '@aria/db';
import { eq, and } from 'drizzle-orm';
import { AppError } from '../middleware/error.middleware';
import type { CreateTicketRequest, UpdateTicketRequest } from '@aria/shared';
import { estimatePoints, splitSuggested } from './tickets/schedule';
import { appendTicketEvent } from './tickets/ticketEvents';
import { applyTransition, approveTicket, assertHumanStatus, workCalendar } from './tickets/ticketActions';
import { dueAt } from './tickets/schedule';
import { loadWorkspaceLlm } from './guardedLlm.service';
import { cancelForTicket, enqueue, releaseHeldRuns, type HeldRun } from './runs/runQueue';
import { getPgPool } from './db.client';
import { codeWorkerFor } from './models/codeWorker';
import { workspaceCursorKey } from './models/cursorKey';

function sanitise(s: string, max: number): string {
  return s.trim().slice(0, max);
}

export async function getTicket(ticketId: string, workspaceId: string) {
  if (!z.string().uuid().safeParse(ticketId).success) {
    throw new AppError('id must be a uuid', 400, 'VALIDATION_ERROR');
  }
  const existing = await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) });
  if (!existing) throw new AppError('Ticket not found', 404, 'NOT_FOUND');
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, existing.projectId), eq(projects.workspaceId, workspaceId)),
  });
  if (!project) throw new AppError('Ticket not found', 404, 'NOT_FOUND');
  return existing;
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

  if (data.flowId) await assertFlowInProject(data.projectId, data.flowId);
  const points = data.storyPoints ?? estimatePoints(data.title, data.description);
  const pointSource = data.storyPoints ? 'owner' : 'heuristic';
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
    if (!data.storyPoints) {
      const llm = await loadWorkspaceLlm(workspaceId);
      if (llm) {
        await enqueue({
          workspaceId,
          projectId: data.projectId,
          ticketId: ticket.id,
          activity: 'story_points',
          taskType: 'story_points',
          runtime: llm.provider === 'cursor' ? 'cursor_local' : 'chat',
          idempotencyKey: `ticket:${ticket.id}:story_points`,
        });
      }
    }
  }
  return ticket;
}

async function assertFlowInProject(projectId: string, flowId: string): Promise<void> {
  const flow = await getPgPool().query(`SELECT id FROM business_flows WHERE id = $1::uuid AND project_id = $2::uuid`, [flowId, projectId]);
  if (!flow.rows[0]) throw new AppError('Flow is not on this project', 422, 'FLOW_NOT_IN_PROJECT');
}

export async function updateTicket(
  ticketId: string,
  workspaceId: string,
  data: UpdateTicketRequest,
  actorUserId?: string,
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
    if (data.status === 'ready_for_dev' && existing.status !== 'backlog' && existing.status !== 'ready_for_dev') {
      throw new AppError('ready_for_dev only leaves backlog', 422, 'ILLEGAL_TRANSITION');
    }
    if (data.status !== existing.status) {
      patch.status = data.status;
      await appendTicketEvent({
        workspaceId,
        projectId: existing.projectId,
        ticketId,
        eventType: 'status_change',
        actorKind: 'human',
        summary: `${existing.status} -> ${data.status} (human)`,
        detail: { from: existing.status, to: data.status, event: 'human_status', userId: actorUserId ?? null },
      });
      const client = await getPgPool().connect();
      let held: HeldRun[] = [];
      try {
        await client.query('BEGIN');
        held = await cancelForTicket(client, ticketId);
        await client.query('COMMIT');
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch { /* already closed */ }
        throw err;
      } finally {
        client.release();
      }
      await releaseHeldRuns(held);
      const cloud = held.filter((run) => run.external_agent_id && run.external_run_id);
      if (cloud.length) {
        try {
          const apiKey = await workspaceCursorKey(workspaceId);
          const worker = codeWorkerFor();
          for (const run of cloud) {
            await worker.cancel({ agentId: run.external_agent_id!, runId: run.external_run_id! }, apiKey);
          }
        } catch {
          // The database row is already cancelled if the provider is unreachable.
        }
      }
    }
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
  if (data.flowId !== undefined) {
    if (data.flowId) await assertFlowInProject(existing.projectId, data.flowId);
    patch.flowId = data.flowId;
  }
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
