import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import type { AriaRequest } from '../middleware/auth.middleware';
import { AppError } from '../middleware/error.middleware';
import { getPgPool } from '../services/db.client';
import { cancel, enqueue, getRun } from '../services/runs/runQueue';
import { list as listLogs } from '../services/runs/runLogs';
import { codeWorkerFor } from '../services/models/codeWorker';
import { assertOwnerInvariant, setOwners, type FlowLayer, type FlowRole } from '../services/flows/flowOwners';
import { agentMayAppend, appendTicketEvent, eventsToMarkdown, listTicketEvents } from '../services/tickets/ticketEvents';
import { readReport } from '../services/evidence/reports';
import { getBranch, readGithubToken } from '../services/githubClient.service';
import { db, projects } from '@aria/db';
import { and, eq } from 'drizzle-orm';

async function ownedProject(projectId: string, workspaceId: string) {
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)),
  });
  if (!project) throw new AppError('Project not found', 404, 'NOT_FOUND');
  return project;
}

async function ticketInWorkspace(ticketId: string, workspaceId: string) {
  const result = await getPgPool().query<{ id: string; project_id: string; ticket_key: string }>(
    `SELECT t.id, t.project_id, t.ticket_key
       FROM tickets t JOIN projects p ON p.id = t.project_id
      WHERE t.id = $1::uuid AND p.workspace_id = $2::uuid`,
    [ticketId, workspaceId],
  );
  if (!result.rows[0]) throw new AppError('Ticket not found', 404, 'NOT_FOUND');
  return result.rows[0];
}

const runsRouter = Router();
runsRouter.use(requireAuth);
runsRouter.get('/:projectId/runs', async (req: AriaRequest, res, next) => {
  try {
    await ownedProject(req.params.projectId, req.user!.workspaceId);
    const limit = Math.min(Number(req.query.limit ?? 50), 100);
    const params: unknown[] = [req.params.projectId];
    let where = 'project_id = $1::uuid';
    for (const key of ['status', 'activity'] as const) {
      if (typeof req.query[key] === 'string') {
        params.push(req.query[key]);
        where += ` AND ${key} = $${params.length}`;
      }
    }
    if (typeof req.query.agentId === 'string') {
      params.push(req.query.agentId);
      where += ` AND agent_id = $${params.length}::uuid`;
    }
    if (typeof req.query.ticketId === 'string') {
      params.push(req.query.ticketId);
      where += ` AND ticket_id = $${params.length}::uuid`;
    }
    params.push(limit);
    const rows = await getPgPool().query(
      `SELECT id, status, activity, agent_id, ticket_id, pr_url, error_code, created_at
         FROM agent_runs WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    res.json({ runs: rows.rows });
  } catch (err) { next(err); }
});

runsRouter.get('/:projectId/schedule', async (req: AriaRequest, res, next) => {
  try {
    await ownedProject(req.params.projectId, req.user!.workspaceId);
    const rows = await getPgPool().query(
      `SELECT id, ticket_key, title, story_points, status, schedule_state, due_at, work_started_at, split_suggested
         FROM tickets WHERE project_id = $1::uuid AND schedule_state IN ('at_risk', 'overdue')
         ORDER BY due_at`,
      [req.params.projectId],
    );
    res.json({ alerts: rows.rows });
  } catch (err) { next(err); }
});

runsRouter.get('/:projectId/github-guard', async (req: AriaRequest, res, next) => {
  try {
    const project = await ownedProject(req.params.projectId, req.user!.workspaceId);
    let branch = { name: 'main', protected: true };
    try {
      const token = await readGithubToken(req.user!.workspaceId);
      const repo = await getPgPool().query<{ repo_name: string }>(
        `SELECT repo_name FROM project_repos WHERE project_id = $1::uuid LIMIT 1`,
        [project.id],
      );
      if (repo.rows[0]) branch = await getBranch(token, repo.rows[0].repo_name);
    } catch {
      branch = { name: 'main', protected: false };
    }
    res.json({
      defaultBranch: branch.name,
      protected: branch.protected,
      acknowledgedAt: project.mergeGuardAckAt,
      pushTokenConfigured: false,
      codeRuntime: project.codeRuntime,
    });
  } catch (err) { next(err); }
});

runsRouter.post('/:projectId/github-guard/ack', async (req: AriaRequest, res, next) => {
  try {
    await ownedProject(req.params.projectId, req.user!.workspaceId);
    await getPgPool().query(`UPDATE projects SET merge_guard_ack_at = NOW(), updated_at = NOW() WHERE id = $1::uuid`, [req.params.projectId]);
    res.json({ acknowledged: true });
  } catch (err) { next(err); }
});

const settingsSchema = z.object({
  codeRuntime: z.enum(['cursor_cloud', 'local_worktree']).optional(),
  tokenBudgetMonthly: z.number().int().positive().nullable().optional(),
});

runsRouter.patch('/:projectId/settings', validate(settingsSchema), async (req: AriaRequest, res, next) => {
  try {
    await ownedProject(req.params.projectId, req.user!.workspaceId);
    await getPgPool().query(
      `UPDATE projects
          SET code_runtime = COALESCE($2, code_runtime),
              token_budget_monthly = CASE WHEN $3::bigint IS NULL THEN token_budget_monthly ELSE $3::bigint END,
              updated_at = NOW()
        WHERE id = $1::uuid`,
      [req.params.projectId, req.body.codeRuntime ?? null, req.body.tokenBudgetMonthly ?? null],
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

const ownersSchema = z.object({
  owners: z.array(z.object({
    agentId: z.string().uuid(),
    layer: z.enum(['frontend', 'backend', 'fullstack']),
    role: z.enum(['owner', 'backup']),
  })).min(1),
});

runsRouter.put('/:projectId/flows/:flowId/owners', validate(ownersSchema), async (req: AriaRequest, res, next) => {
  try {
    await ownedProject(req.params.projectId, req.user!.workspaceId);
    const flow = await getPgPool().query(`SELECT id FROM business_flows WHERE id = $1::uuid AND project_id = $2::uuid`, [req.params.flowId, req.params.projectId]);
    if (!flow.rows[0]) throw new AppError('Flow not found', 404, 'NOT_FOUND');
    const owners = req.body.owners as Array<{ agentId: string; layer: FlowLayer; role: FlowRole }>;
    assertOwnerInvariant(owners);
    await setOwners(req.params.flowId, owners);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

const runRouter = Router();
runRouter.use(requireAuth);
runRouter.get('/:runId', async (req: AriaRequest, res, next) => {
  try {
    const run = await getRun(req.params.runId);
    if (!run || run.workspace_id !== req.user!.workspaceId) throw new AppError('Run not found', 404, 'NOT_FOUND');
    res.json({ run });
  } catch (err) { next(err); }
});
runRouter.get('/:runId/logs', async (req: AriaRequest, res, next) => {
  try {
    const run = await getRun(req.params.runId);
    if (!run || run.workspace_id !== req.user!.workspaceId) throw new AppError('Run not found', 404, 'NOT_FOUND');
    const lines = await listLogs(run.id, Number(req.query.afterSeq ?? 0), Number(req.query.limit ?? 200));
    res.json({ lines });
  } catch (err) { next(err); }
});
runRouter.post('/:runId/cancel', async (req: AriaRequest, res, next) => {
  try {
    const run = await getRun(req.params.runId);
    if (!run || run.workspace_id !== req.user!.workspaceId) throw new AppError('Run not found', 404, 'NOT_FOUND');
    if (run.external_agent_id && run.external_run_id) {
      try { await codeWorkerFor().cancel({ agentId: run.external_agent_id, runId: run.external_run_id }); } catch { /* already stopped */ }
    }
    res.json({ run: await cancel(run.id) });
  } catch (err) { next(err); }
});
runRouter.post('/:runId/retry', async (req: AriaRequest, res, next) => {
  try {
    const run = await getRun(req.params.runId);
    if (!run || run.workspace_id !== req.user!.workspaceId) throw new AppError('Run not found', 404, 'NOT_FOUND');
    if (run.status !== 'failed' && run.status !== 'cancelled') throw new AppError('Only a failed or cancelled run can be retried', 422, 'NOT_RETRYABLE');
    const created = await enqueue({
      workspaceId: run.workspace_id,
      projectId: run.project_id,
      agentId: run.agent_id,
      ticketId: run.ticket_id,
      activity: run.activity,
      taskType: run.task_type,
      runtime: run.runtime,
      idempotencyKey: `${run.idempotency_key}:retry:${Date.now()}`,
      input: run.input,
    });
    res.status(202).json(created);
  } catch (err) { next(err); }
});

const ticketExtra = Router();
ticketExtra.use(requireAuth);
ticketExtra.get('/:id/events', async (req: AriaRequest, res, next) => {
  try {
    await ticketInWorkspace(req.params.id, req.user!.workspaceId);
    const events = await listTicketEvents(req.params.id, {
      eventType: typeof req.query.type === 'string' ? req.query.type : undefined,
      agentId: typeof req.query.agentId === 'string' ? req.query.agentId : undefined,
      afterSeq: Number(req.query.cursor ?? 0),
      limit: Number(req.query.limit ?? 100),
    });
    res.json({ events });
  } catch (err) { next(err); }
});
ticketExtra.get('/:id/events/export', async (req: AriaRequest, res, next) => {
  try {
    const ticket = await ticketInWorkspace(req.params.id, req.user!.workspaceId);
    const events = await listTicketEvents(req.params.id, { limit: 500 });
    if (req.query.format === 'markdown') {
      res.type('text/markdown').send(eventsToMarkdown(ticket.ticket_key, events));
      return;
    }
    res.json({ ticketKey: ticket.ticket_key, events });
  } catch (err) { next(err); }
});

const eventSchema = z.object({
  eventType: z.enum(['progress', 'communication']),
  agentId: z.string().uuid(),
  summary: z.string().min(1).max(500),
  detail: z.record(z.unknown()).optional(),
});
ticketExtra.post('/:id/events', validate(eventSchema), async (req: AriaRequest, res, next) => {
  try {
    const ticket = await ticketInWorkspace(req.params.id, req.user!.workspaceId);
    const allowed = await agentMayAppend(ticket.id, req.body.agentId);
    if (!allowed) throw new AppError('Agent is not working this ticket', 403, 'FORBIDDEN');
    const event = await appendTicketEvent({
      workspaceId: req.user!.workspaceId,
      projectId: ticket.project_id,
      ticketId: ticket.id,
      eventType: req.body.eventType,
      actorKind: 'agent',
      agentId: req.body.agentId,
      summary: req.body.summary,
      detail: req.body.detail ?? {},
    });
    res.status(201).json({ event });
  } catch (err) { next(err); }
});
ticketExtra.get('/:id/reports/:file', async (req: AriaRequest, res, next) => {
  try {
    const ticket = await ticketInWorkspace(req.params.id, req.user!.workspaceId);
    const match = /^(dev|qa)\.(md|pdf)$/.exec(req.params.file);
    if (!match) throw new AppError('Unknown report', 404, 'NOT_FOUND');
    const report = await readReport(ticket.id, match[1] as 'dev' | 'qa', match[2] as 'md' | 'pdf');
    if (!report) throw new AppError('Report not found', 404, 'NOT_FOUND');
    res.setHeader('Content-Type', report.contentType);
    res.send(report.body);
  } catch (err) { next(err); }
});

export const projectM2Router = runsRouter;
export const runM2Router = runRouter;
export const ticketM2Router = ticketExtra;
