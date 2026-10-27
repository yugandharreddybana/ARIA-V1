import { z } from 'zod';
import { db } from '@aria/db';
import { tickets, projects } from '@aria/db';
import { eq, and } from 'drizzle-orm';
import { AppError } from '../middleware/error.middleware';
import type { CreateTicketRequest, IssueType, UpdateTicketRequest } from '@aria/shared';
import { hasAcceptanceCriteria } from '@aria/shared';
import { ceilFib, estimatePoints, splitSuggested } from './tickets/schedule';
import { appendTicketEvent } from './tickets/ticketEvents';
import { applyTransition, approveTicket, assertHumanStatus, workCalendar } from './tickets/ticketActions';
import { dueAt } from './tickets/schedule';
import { loadWorkspaceLlm } from './guardedLlm.service';
import { cancelForTicket, enqueue, releaseHeldRuns, type HeldRun } from './runs/runQueue';
import { getPgPool } from './db.client';
import { codeWorkerFor } from './models/codeWorker';
import { workspaceCursorKey } from './models/cursorKey';
import { handoverDoc, recordHandoff, resolveTicketOwner } from './ownership/pathOwners';

function sanitise(s: string, max: number): string {
  return s.trim().slice(0, max);
}

function asPaths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function resolvePoints(data: { storyPoints?: number; estimatedDays?: number; title: string; description: string }) {
  if (data.storyPoints != null) return { points: data.storyPoints, source: 'owner' as const };
  if (data.estimatedDays != null) return { points: ceilFib(data.estimatedDays), source: 'ceilFib' as const };
  return { points: estimatePoints(data.title, data.description), source: 'heuristic' as const };
}

async function assertHierarchy(input: {
  projectId: string;
  issueType: IssueType;
  parentId: string | null;
  epicId: string | null;
}) {
  if (input.issueType === 'epic' && (input.parentId || input.epicId)) {
    throw new AppError('Epics cannot have a parent or epic', 422, 'HIERARCHY');
  }
  if (input.issueType === 'sub_task' && !input.parentId) {
    throw new AppError('sub_task requires parentId', 422, 'HIERARCHY');
  }
  if (input.parentId) {
    const parent = await getPgPool().query<{ issue_type: string; epic_id: string | null; project_id: string }>(
      `SELECT issue_type, epic_id, project_id FROM tickets WHERE id = $1::uuid`,
      [input.parentId],
    );
    const row = parent.rows[0];
    if (!row || row.project_id !== input.projectId) throw new AppError('Parent ticket not found', 404, 'NOT_FOUND');
    if (input.issueType === 'sub_task' && row.issue_type !== 'story') {
      throw new AppError('sub_task parent must be a story', 422, 'HIERARCHY');
    }
    if (input.issueType === 'story' && row.issue_type !== 'epic') {
      throw new AppError('story parent must be an epic', 422, 'HIERARCHY');
    }
  }
  if (input.epicId) {
    const epic = await getPgPool().query<{ issue_type: string; project_id: string }>(
      `SELECT issue_type, project_id FROM tickets WHERE id = $1::uuid`,
      [input.epicId],
    );
    const row = epic.rows[0];
    if (!row || row.project_id !== input.projectId) throw new AppError('Epic not found', 404, 'NOT_FOUND');
    if (row.issue_type !== 'epic') throw new AppError('epicId must reference an epic', 422, 'HIERARCHY');
  }
}

async function decorateTicket<T extends {
  id: string;
  projectId: string;
  assigneeAgentId?: string | null;
  assignedSkillId?: string | null;
  flowId?: string | null;
  layer?: string | null;
  predictedPaths?: unknown;
  issueType?: string | null;
}>(ticket: T, workspaceId: string) {
  const predictedPaths = asPaths(ticket.predictedPaths);
  // Display only — do not write handoffs while reading a ticket.
  const resolved = await resolveTicketOwner({
    workspaceId,
    projectId: ticket.projectId,
    ticketId: null,
    assigneeAgentId: ticket.assigneeAgentId ?? ticket.assignedSkillId ?? null,
    flowId: ticket.flowId ?? null,
    layer: ticket.layer ?? null,
    predictedPaths,
    allowBackupOnWip: true,
  });
  const agentIds = [resolved.agentId, resolved.backupAgentId].filter(Boolean) as string[];
  const names = agentIds.length
    ? await getPgPool().query<{ id: string; real_name: string }>(
      `SELECT id, real_name FROM skills WHERE id = ANY($1::uuid[])`,
      [agentIds],
    )
    : { rows: [] as Array<{ id: string; real_name: string }> };
  const nameOf = (id: string | null) => names.rows.find((row) => row.id === id)?.real_name ?? null;
  let subTasks: unknown[] = [];
  if (ticket.issueType === 'story' || ticket.issueType === 'epic') {
    const kids = await db.query.tickets.findMany({
      where: ticket.issueType === 'epic'
        ? eq(tickets.epicId, ticket.id)
        : eq(tickets.parentId, ticket.id),
      orderBy: (t, { asc }) => [asc(t.createdAt)],
    });
    subTasks = kids;
  }
  return {
    ...ticket,
    ownerAgentId: resolved.agentId,
    ownerName: nameOf(resolved.agentId),
    backupAgentId: resolved.backupAgentId,
    backupName: nameOf(resolved.backupAgentId),
    ownershipSource: resolved.ownershipSource,
    subTasks,
  };
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
  return decorateTicket(existing, workspaceId);
}

export async function listTickets(projectId: string, workspaceId: string, opts?: {
  sprintId?: string | null;
  backlog?: boolean;
  issueType?: string;
}) {
  if (!projectId) throw new AppError('projectId is required', 400, 'VALIDATION_ERROR');
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)),
  });
  if (!project) throw new AppError('Project not found or access denied', 404, 'NOT_FOUND');

  const params: unknown[] = [projectId];
  let where = 'project_id = $1::uuid';
  if (opts?.sprintId) {
    params.push(opts.sprintId);
    where += ` AND sprint_id = $${params.length}::uuid`;
  } else if (opts?.backlog) {
    where += ' AND sprint_id IS NULL AND issue_type <> \'epic\'';
  }
  if (opts?.issueType) {
    params.push(opts.issueType);
    where += ` AND issue_type = $${params.length}`;
  }
  const rows = await getPgPool().query(
    `SELECT * FROM tickets WHERE ${where} ORDER BY created_at DESC`,
    params,
  );
  // Map snake_case from raw SQL to camelCase like drizzle
  return rows.rows.map(mapTicketRow);
}

function mapTicketRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    projectId: row.project_id,
    sessionId: row.session_id,
    type: row.ticket_type ?? row.type,
    status: row.status,
    title: row.title,
    description: row.description,
    assignedSkillId: row.assigned_skill_id,
    humanApproved: row.human_approved,
    statusReason: row.status_reason,
    flowId: row.flow_id,
    layer: row.layer,
    storyPoints: row.story_points,
    dueAt: row.due_at,
    workStartedAt: row.work_started_at,
    scheduleState: row.schedule_state,
    ticketKey: row.ticket_key,
    splitSuggested: row.split_suggested,
    issueType: row.issue_type,
    parentId: row.parent_id,
    epicId: row.epic_id,
    acceptanceCriteria: row.acceptance_criteria,
    behaviourNotes: row.behaviour_notes,
    uiAffected: row.ui_affected,
    uiMockStatus: row.ui_mock_status,
    apiContract: row.api_contract,
    dorChecklist: row.dor_checklist,
    dodChecklist: row.dod_checklist,
    readinessStatus: row.readiness_status,
    rollbackPlan: row.rollback_plan,
    sprintId: row.sprint_id,
    assigneeAgentId: row.assignee_agent_id,
    predictedPaths: row.predicted_paths,
    ideaCardId: row.idea_card_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    riskClass: row.risk_class,
    affectedDomains: row.affected_domains,
  };
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

  const issueType: IssueType = data.issueType ?? (data.parentId ? 'sub_task' : 'story');
  let parentId = data.parentId ?? null;
  let epicId = data.epicId ?? null;
  if (issueType === 'sub_task' && parentId) {
    const parent = await getPgPool().query<{ epic_id: string | null }>(
      `SELECT epic_id FROM tickets WHERE id = $1::uuid`,
      [parentId],
    );
    if (!epicId) epicId = parent.rows[0]?.epic_id ?? null;
  }
  if (issueType === 'story' && parentId && !epicId) epicId = parentId;
  await assertHierarchy({ projectId: data.projectId, issueType, parentId, epicId });

  if (data.flowId) await assertFlowInProject(data.projectId, data.flowId);
  if (data.sprintId) await assertSprintInProject(data.projectId, data.sprintId);

  const { points, source } = resolvePoints({
    storyPoints: data.storyPoints,
    estimatedDays: data.estimatedDays,
    title: data.title,
    description: data.description,
  });

  const assigneeAgentId = data.assigneeAgentId ?? null;
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
      issueType,
      parentId,
      epicId,
      acceptanceCriteria: data.acceptanceCriteria ?? [],
      behaviourNotes: data.behaviourNotes ?? null,
      uiAffected: data.uiAffected ?? false,
      sprintId: data.sprintId ?? null,
      assigneeAgentId,
      assignedSkillId: assigneeAgentId,
      predictedPaths: data.predictedPaths ?? [],
      ideaCardId: data.ideaCardId ?? null,
    })
    .returning();
  if (ticket) {
    await appendTicketEvent({
      workspaceId,
      projectId: data.projectId,
      ticketId: ticket.id,
      eventType: source === 'owner' || source === 'ceilFib' ? 'owner_decision' : 'agent_action',
      actorKind: source === 'heuristic' ? 'system' : 'owner',
      summary: source === 'ceilFib'
        ? `CeilFib set ${points} story points from ${data.estimatedDays} days`
        : source === 'owner'
          ? `Owner set ${points} story points`
          : `Estimated ${points} story points`,
      detail: { storyPoints: points, splitSuggested: splitSuggested(points), source, estimatedDays: data.estimatedDays ?? null },
    });
    if (issueType === 'sub_task') {
      await appendTicketEvent({
        workspaceId,
        projectId: data.projectId,
        ticketId: ticket.id,
        eventType: 'agent_action',
        actorKind: 'system',
        summary: 'Sub-task created',
        detail: { parentId, epicId, issueType },
      });
    }
    if (!data.storyPoints && data.estimatedDays == null) {
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
  return ticket ? decorateTicket(ticket, workspaceId) : ticket;
}

async function assertFlowInProject(projectId: string, flowId: string): Promise<void> {
  const flow = await getPgPool().query(`SELECT id FROM business_flows WHERE id = $1::uuid AND project_id = $2::uuid`, [flowId, projectId]);
  if (!flow.rows[0]) throw new AppError('Flow is not on this project', 422, 'FLOW_NOT_IN_PROJECT');
}

async function assertSprintInProject(projectId: string, sprintId: string): Promise<void> {
  const sprint = await getPgPool().query(`SELECT id FROM sprints WHERE id = $1::uuid AND project_id = $2::uuid`, [sprintId, projectId]);
  if (!sprint.rows[0]) throw new AppError('Sprint is not on this project', 422, 'SPRINT_NOT_IN_PROJECT');
}

function assertReadyAcceptance(issueType: string | null | undefined, criteria: unknown, nextStatus?: string) {
  if (nextStatus !== 'ready_for_dev') return;
  if (issueType === 'epic') return;
  if (!hasAcceptanceCriteria(criteria)) {
    throw new AppError('Story/sub-task needs Given/When/Then acceptance criteria before ready', 422, 'ACCEPTANCE_CRITERIA');
  }
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

  const project = await db.query.projects.findFirst({
    where: and(
      eq(projects.id, existing.projectId),
      eq(projects.workspaceId, workspaceId),
    ),
  });
  if (!project) throw new AppError('Forbidden', 403, 'FORBIDDEN');

  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if (data.action === 'approve') {
    assertReadyAcceptance(existing.issueType, data.acceptanceCriteria ?? existing.acceptanceCriteria, 'ready_for_dev');
    await approveTicket(ticketId, workspaceId);
    return decorateTicket((await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) }))!, workspaceId);
  }
  if (data.action === 'unblock') {
    await applyTransition(ticketId, 'unblock', { actorKind: 'owner' });
    return decorateTicket((await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) }))!, workspaceId);
  }
  if (data.action === 'reject') {
    await applyTransition(ticketId, 'reject', { actorKind: 'owner' });
    return decorateTicket((await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) }))!, workspaceId);
  }
  if (data.status !== undefined) {
    assertHumanStatus(data.status);
    assertReadyAcceptance(existing.issueType, data.acceptanceCriteria ?? existing.acceptanceCriteria, data.status);
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
  if (data.assignedSkillId !== undefined) {
    patch.assignedSkillId = data.assignedSkillId;
    patch.assigneeAgentId = data.assignedSkillId;
  }
  if (data.assigneeAgentId !== undefined) {
    const previous = existing.assigneeAgentId ?? existing.assignedSkillId;
    patch.assigneeAgentId = data.assigneeAgentId;
    patch.assignedSkillId = data.assigneeAgentId;
    if (data.assigneeAgentId && data.assigneeAgentId !== previous) {
      await recordHandoff({
        workspaceId,
        projectId: existing.projectId,
        ticketId,
        fromAgentId: previous,
        toAgentId: data.assigneeAgentId,
        reason: 'user_reassign',
        handoverMd: handoverDoc({
          from: previous,
          to: data.assigneeAgentId,
          reason: 'user_reassign',
          paths: asPaths(existing.predictedPaths),
          pathGlob: null,
        }),
      });
    }
  }
  if (data.humanApproved !== undefined) patch.humanApproved = data.humanApproved;
  if (data.title !== undefined) patch.title = sanitise(data.title, 500);
  if (data.description !== undefined) patch.description = sanitise(data.description, 5000);

  let nextPoints = data.storyPoints;
  if (nextPoints == null && data.estimatedDays != null) nextPoints = ceilFib(data.estimatedDays);
  if (nextPoints !== undefined) {
    patch.storyPoints = nextPoints;
    patch.splitSuggested = splitSuggested(nextPoints);
    if (existing.workStartedAt) patch.dueAt = dueAt(new Date(existing.workStartedAt), nextPoints, workCalendar());
  }
  if (data.flowId !== undefined) {
    if (data.flowId) await assertFlowInProject(existing.projectId, data.flowId);
    patch.flowId = data.flowId;
  }
  if (data.layer !== undefined) patch.layer = data.layer;
  if (data.acceptanceCriteria !== undefined) {
    patch.acceptanceCriteria = data.acceptanceCriteria;
    await appendTicketEvent({
      workspaceId,
      projectId: existing.projectId,
      ticketId,
      eventType: 'readiness',
      actorKind: 'owner',
      summary: 'Acceptance criteria updated',
      detail: { count: data.acceptanceCriteria.length },
    });
  }
  if (data.behaviourNotes !== undefined) patch.behaviourNotes = data.behaviourNotes;
  if (data.uiAffected !== undefined) patch.uiAffected = data.uiAffected;
  if (data.uiMockStatus !== undefined) patch.uiMockStatus = data.uiMockStatus;
  if (data.readinessStatus !== undefined) {
    patch.readinessStatus = data.readinessStatus;
    await appendTicketEvent({
      workspaceId,
      projectId: existing.projectId,
      ticketId,
      eventType: 'readiness',
      actorKind: 'owner',
      summary: `Readiness ${data.readinessStatus}`,
      detail: { readinessStatus: data.readinessStatus },
    });
  }
  if (data.sprintId !== undefined) {
    if (data.sprintId) await assertSprintInProject(existing.projectId, data.sprintId);
    patch.sprintId = data.sprintId;
  }
  if (data.predictedPaths !== undefined) patch.predictedPaths = data.predictedPaths;
  if (data.parentId !== undefined || data.epicId !== undefined || data.issueType !== undefined) {
    const issueType = (data.issueType ?? existing.issueType ?? 'story') as IssueType;
    const parentId = data.parentId !== undefined ? data.parentId : existing.parentId;
    const epicId = data.epicId !== undefined ? data.epicId : existing.epicId;
    await assertHierarchy({ projectId: existing.projectId, issueType, parentId, epicId });
    if (data.issueType !== undefined) patch.issueType = data.issueType;
    if (data.parentId !== undefined) patch.parentId = data.parentId;
    if (data.epicId !== undefined) patch.epicId = data.epicId;
  }

  const [updated] = await db
    .update(tickets)
    .set(patch)
    .where(eq(tickets.id, ticketId))
    .returning();
  if (nextPoints !== undefined && updated) {
    await appendTicketEvent({
      workspaceId,
      projectId: existing.projectId,
      ticketId,
      eventType: 'owner_decision',
      actorKind: 'owner',
      summary: data.estimatedDays != null && data.storyPoints == null
        ? `CeilFib set story points to ${nextPoints}`
        : `Owner set story points to ${nextPoints}`,
      detail: {
        storyPoints: nextPoints,
        splitSuggested: splitSuggested(nextPoints),
        source: data.estimatedDays != null && data.storyPoints == null ? 'ceilFib' : 'owner',
        estimatedDays: data.estimatedDays ?? null,
      },
    });
  }
  return updated ? decorateTicket(updated, workspaceId) : updated;
}
