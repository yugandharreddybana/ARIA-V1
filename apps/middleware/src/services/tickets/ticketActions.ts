import { validateEnv } from '../../config/env';
import { getPgPool } from '../db.client';
import { AppError } from '../../middleware/error.middleware';
import { evidenceAllowsMerge } from '../evidence/reports';
import { enqueue, type RunActivity, type RunRuntime } from '../runs/runQueue';
import { emitProject } from '../runs/hub';
import { appendTicketEvent } from './ticketEvents';
import { dueAt, parseMinutes, parseWorkdays, scheduleState, type WorkCalendar } from './schedule';
import { humanMaySetStatus, transition, type PipelineEvent, type PipelineStatus } from './ticketPipeline';

interface TicketRow {
  id: string;
  project_id: string;
  workspace_id: string;
  status: PipelineStatus;
  story_points: number;
  work_started_at: Date | null;
  due_at: Date | null;
  schedule_state: string;
  ticket_key: string;
  assigned_skill_id: string | null;
  flow_id: string | null;
  layer: string | null;
  human_approved: boolean;
  title: string;
  description: string;
  pr_url: string | null;
}

export function workCalendar(): WorkCalendar {
  const env = validateEnv();
  return {
    workdays: parseWorkdays(env.ARIA_WORKDAYS),
    timeZone: env.ARIA_TIMEZONE,
    startMinutes: parseMinutes(env.ARIA_WORKDAY_START),
    endMinutes: parseMinutes(env.ARIA_WORKDAY_END),
  };
}

async function loadTicket(ticketId: string): Promise<TicketRow> {
  const result = await getPgPool().query<TicketRow>(
    `SELECT t.id, t.project_id, p.workspace_id, t.status, t.story_points, t.work_started_at, t.due_at,
            t.schedule_state, t.ticket_key, t.assigned_skill_id, t.flow_id, t.layer, t.human_approved,
            t.title, t.description,
            (SELECT pr_url FROM agent_runs r WHERE r.ticket_id = t.id AND r.pr_url IS NOT NULL ORDER BY r.created_at DESC LIMIT 1) AS pr_url
       FROM tickets t JOIN projects p ON p.id = t.project_id
      WHERE t.id = $1::uuid`,
    [ticketId],
  );
  const row = result.rows[0];
  if (!row) throw new AppError('Ticket not found', 404, 'NOT_FOUND');
  return row;
}

async function rounds(ticketId: string, returnTo: 'review' | 'qa'): Promise<number> {
  const result = await getPgPool().query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM agent_runs
      WHERE ticket_id = $1::uuid AND activity = 'fix' AND status = 'succeeded' AND input->>'returnTo' = $2`,
    [ticketId, returnTo],
  );
  return Number(result.rows[0]?.n ?? 0);
}

function runtimeFor(activity: RunActivity, codeRuntime: string): RunRuntime {
  if (activity === 'develop' || activity === 'fix' || activity === 'qa') {
    return codeRuntime === 'local_worktree' ? 'local_worktree' : 'cursor_cloud';
  }
  return 'cursor_local';
}

export async function applyTransition(ticketId: string, event: PipelineEvent, extra: {
  reason?: string;
  returnTo?: 'review' | 'qa';
  actorKind?: 'agent' | 'owner' | 'system';
  agentId?: string | null;
  runId?: string | null;
  prUrl?: string | null;
} = {}): Promise<{ status: PipelineStatus }> {
  if (event === 'qa_passed') {
    const gate = await evidenceAllowsMerge(ticketId);
    if (!gate.ok) {
      return applyTransition(ticketId, 'qa_failed', { ...extra, reason: gate.reason, returnTo: 'qa' });
    }
  }
  const ticket = await loadTicket(ticketId);
  const env = validateEnv();
  const next = transition(ticket.status, event, {
    reviewRounds: await rounds(ticketId, 'review'),
    qaRounds: await rounds(ticketId, 'qa'),
    maxReviewRounds: env.ARIA_MAX_REVIEW_FIX_ROUNDS,
    maxQaRounds: env.ARIA_MAX_QA_FIX_ROUNDS,
    returnTo: extra.returnTo,
  });
  if (next.status === ticket.status && next.effects.length === 0) {
    throw new AppError(next.reason || 'Illegal ticket transition', 422, 'ILLEGAL_TRANSITION');
  }
  let started = ticket.work_started_at ? new Date(ticket.work_started_at) : null;
  let due = ticket.due_at ? new Date(ticket.due_at) : null;
  let schedule = ticket.schedule_state;
  if (next.status === 'in_progress' && !started) {
    started = new Date();
    due = dueAt(started, Number(ticket.story_points), workCalendar());
    schedule = 'on_track';
  }
  if (next.status === 'done' || next.status === 'rejected') schedule = 'done';
  await getPgPool().query(
    `UPDATE tickets
        SET status = $2, status_reason = $3, work_started_at = $4, due_at = $5, schedule_state = $6,
            human_approved = CASE WHEN $7 THEN true ELSE human_approved END, updated_at = NOW()
      WHERE id = $1::uuid`,
    [ticketId, next.status, extra.reason ?? next.reason ?? null, started, due, schedule, event === 'approve'],
  );
  await appendTicketEvent({
    workspaceId: ticket.workspace_id,
    projectId: ticket.project_id,
    ticketId,
    eventType: 'status_change',
    actorKind: extra.actorKind ?? 'system',
    agentId: extra.agentId,
    runId: extra.runId,
    summary: `${ticket.status} -> ${next.status} (${event})`,
    prUrl: extra.prUrl ?? ticket.pr_url,
    detail: { from: ticket.status, to: next.status, event, reason: extra.reason ?? next.reason ?? null },
  });
  emitProject(ticket.project_id, 'ticket:updated', { id: ticketId, status: next.status });
  const project = await getPgPool().query<{ code_runtime: string }>(`SELECT code_runtime FROM projects WHERE id = $1::uuid`, [ticket.project_id]);
  const codeRuntime = project.rows[0]?.code_runtime ?? 'cursor_cloud';
  for (const effect of next.effects) {
    if (effect.type === 'cancelRuns') {
      await getPgPool().query(
        `UPDATE agent_runs SET status = 'cancelled', error_code = 'CANCELLED', finished_at = NOW(), updated_at = NOW()
          WHERE ticket_id = $1::uuid AND status IN ('queued', 'running')`,
        [ticketId],
      );
    }
    if (effect.type === 'enqueue') {
      const n = await getPgPool().query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM agent_runs WHERE ticket_id = $1::uuid AND activity = $2`,
        [ticketId, effect.activity],
      );
      const agentId = effect.activity === 'develop' || effect.activity === 'fix' ? ticket.assigned_skill_id : await pickAgent(ticket, effect.activity);
      await enqueue({
        workspaceId: ticket.workspace_id,
        projectId: ticket.project_id,
        agentId,
        ticketId,
        activity: effect.activity,
        taskType: taskType(effect.activity),
        runtime: runtimeFor(effect.activity, codeRuntime),
        idempotencyKey: `ticket:${ticketId}:${effect.activity}:${Number(n.rows[0]?.n ?? 0) + 1}`,
        input: { returnTo: effect.returnTo ?? null, prUrl: extra.prUrl ?? ticket.pr_url },
      });
      await appendTicketEvent({
        workspaceId: ticket.workspace_id,
        projectId: ticket.project_id,
        ticketId,
        eventType: 'agent_action',
        actorKind: 'system',
        agentId,
        summary: `Queued ${effect.activity}`,
        detail: { activity: effect.activity, returnTo: effect.returnTo ?? null },
      });
    }
  }
  return { status: next.status };
}

function taskType(activity: RunActivity): string {
  switch (activity) {
    case 'develop': return 'coding';
    case 'review': return 'code_review';
    case 'fix': return 'fixes';
    case 'qa': return 'tests';
    case 'knowledge_map': return 'knowledge_map';
    case 'company_generation': return 'company_generation';
    default: {
      const neverActivity: never = activity;
      throw new Error(`Unknown activity ${String(neverActivity)}`);
    }
  }
}

async function pickAgent(ticket: TicketRow, activity: RunActivity): Promise<string | null> {
  if (activity === 'review' && ticket.flow_id) {
    const backup = await getPgPool().query<{ agent_id: string }>(
      `SELECT agent_id FROM flow_owners WHERE flow_id = $1::uuid AND role = 'backup' LIMIT 1`,
      [ticket.flow_id],
    );
    if (backup.rows[0] && backup.rows[0].agent_id !== ticket.assigned_skill_id) return backup.rows[0].agent_id;
  }
  const role = activity === 'qa' ? 'qa' : 'cto';
  const found = await getPgPool().query<{ id: string }>(
    `SELECT id FROM skills WHERE project_id = $1::uuid AND enabled = true AND role_key = $2
        AND ($3::uuid IS NULL OR id <> $3::uuid)
      ORDER BY created_at LIMIT 1`,
    [ticket.project_id, role, ticket.assigned_skill_id],
  );
  return found.rows[0]?.id ?? ticket.assigned_skill_id;
}

export async function approveTicket(ticketId: string, workspaceId: string): Promise<void> {
  const ticket = await loadTicket(ticketId);
  if (ticket.workspace_id !== workspaceId) throw new AppError('Forbidden', 403, 'FORBIDDEN');
  if (!ticket.assigned_skill_id && ticket.flow_id) {
    const { routeTicket } = await import('../flows/flowOwners');
    const layer = ticket.layer === 'frontend' || ticket.layer === 'backend' || ticket.layer === 'fullstack' ? ticket.layer : null;
    const agentId = await routeTicket(ticket.flow_id, layer, ticket.project_id);
    if (!agentId) throw new AppError('No agent can take this ticket', 422, 'UNROUTABLE');
    await getPgPool().query(`UPDATE tickets SET assigned_skill_id = $2::uuid WHERE id = $1::uuid`, [ticketId, agentId]);
  }
  if (!ticket.assigned_skill_id && !ticket.flow_id) {
    const { routeTicket } = await import('../flows/flowOwners');
    const agentId = await routeTicket(null, null, ticket.project_id);
    if (agentId) await getPgPool().query(`UPDATE tickets SET assigned_skill_id = $2::uuid WHERE id = $1::uuid`, [ticketId, agentId]);
  }
  const again = await loadTicket(ticketId);
  if (!again.assigned_skill_id) throw new AppError('No agent can take this ticket', 422, 'UNROUTABLE');
  await applyTransition(ticketId, 'approve', { actorKind: 'owner' });
}

export function assertHumanStatus(to: string): void {
  if (!humanMaySetStatus(to as PipelineStatus)) {
    throw new AppError(`Status ${to} is owned by an agent`, 422, 'AGENT_STATUS');
  }
}

export async function scanSchedule(): Promise<void> {
  const env = validateEnv();
  const rows = await getPgPool().query<TicketRow>(
    `SELECT t.id, t.project_id, p.workspace_id, t.status, t.story_points, t.work_started_at, t.due_at,
            t.schedule_state, t.ticket_key, t.assigned_skill_id, t.flow_id, t.layer, t.human_approved,
            t.title, t.description, NULL::text AS pr_url
       FROM tickets t JOIN projects p ON p.id = t.project_id
      WHERE t.status IN ('in_progress', 'ready_for_review', 'in_qa', 'awaiting_merge')
        AND t.work_started_at IS NOT NULL AND t.due_at IS NOT NULL`,
  );
  const cal = workCalendar();
  const now = new Date();
  for (const ticket of rows.rows) {
    const state = scheduleState({
      startedAt: new Date(ticket.work_started_at!),
      dueAt: new Date(ticket.due_at!),
      points: Number(ticket.story_points),
      now,
      terminal: false,
      riskRatio: env.ARIA_SCHEDULE_RISK_RATIO,
      cal,
    });
    if (state === ticket.schedule_state) continue;
    if (state !== 'at_risk' && state !== 'overdue' && state !== 'on_track') continue;
    await getPgPool().query(`UPDATE tickets SET schedule_state = $2, updated_at = NOW() WHERE id = $1::uuid`, [ticket.id, state]);
    if (state === 'at_risk' || state === 'overdue') {
      const scrum = await getPgPool().query<{ id: string }>(
        `SELECT id FROM skills WHERE project_id = $1::uuid AND role_key = 'scrum_master' ORDER BY enabled DESC LIMIT 1`,
        [ticket.project_id],
      );
      await appendTicketEvent({
        workspaceId: ticket.workspace_id,
        projectId: ticket.project_id,
        ticketId: ticket.id,
        eventType: 'schedule',
        actorKind: 'system',
        summary: `${ticket.ticket_key} is ${state}`,
        detail: { state, dueAt: ticket.due_at, storyPoints: ticket.story_points },
      });
      await appendTicketEvent({
        workspaceId: ticket.workspace_id,
        projectId: ticket.project_id,
        ticketId: ticket.id,
        eventType: 'communication',
        actorKind: 'system',
        agentId: scrum.rows[0]?.id ?? null,
        summary: `Standup flag for scrum master: ${ticket.ticket_key} is ${state}`,
        detail: { toRole: 'scrum_master', state },
      });
      emitProject(ticket.project_id, 'schedule:alert', { ticketId: ticket.id, ticketKey: ticket.ticket_key, state });
    }
  }
}
