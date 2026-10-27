import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import type { AriaRequest } from '../middleware/auth.middleware';
import { AppError } from '../middleware/error.middleware';
import { getPgPool } from '../services/db.client';
import { cancel, enqueue, getRun } from '../services/runs/runQueue';
import { list as listLogs } from '../services/runs/runLogs';
import { codeWorkerForWorkspace } from '../services/providers/resolveWorker';
import { assertOwnerInvariant, setOwners, type FlowLayer, type FlowRole } from '../services/flows/flowOwners';
import { appendTicketEvent, eventsToMarkdown, listTicketEvents, verifyChain } from '../services/tickets/ticketEvents';
import { evidenceAllowsMerge, latestReports, readReport } from '../services/evidence/reports';
import { scopedMonthUsage } from '../services/runs/budget';
import { validateEnv } from '../config/env';
import { getBranch, githubFullName, readGithubToken } from '../services/githubClient.service';
import { db, projects } from '@aria/db';
import { and, eq } from 'drizzle-orm';

const uuidSchema = z.string().uuid();

function requireUuid(value: string | undefined, name: string): string {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) throw new AppError(`${name} must be a uuid`, 400, 'VALIDATION_ERROR');
  return parsed.data;
}

async function ownedProject(projectId: string, workspaceId: string) {
  requireUuid(projectId, 'projectId');
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)),
  });
  if (!project) throw new AppError('Project not found', 404, 'NOT_FOUND');
  return project;
}

async function ticketInWorkspace(ticketId: string, workspaceId: string) {
  requireUuid(ticketId, 'id');
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
const uuidQuery = z.string().uuid();

function queryLimit(value: unknown, fallback: number, max = 100): number {
  const parsed = z.coerce.number().int().positive().max(max).safeParse(value ?? fallback);
  if (!parsed.success) throw new AppError('limit must be a positive integer', 400, 'VALIDATION_ERROR');
  return parsed.data;
}

runsRouter.get('/:projectId/runs', async (req: AriaRequest, res, next) => {
  try {
    await ownedProject(req.params.projectId, req.user!.workspaceId);
    const limit = queryLimit(req.query.limit, 50);
    const params: unknown[] = [req.params.projectId];
    let where = 'project_id = $1::uuid';
    for (const key of ['status', 'activity'] as const) {
      if (typeof req.query[key] === 'string') {
        params.push(req.query[key]);
        where += ` AND ${key} = $${params.length}`;
      }
    }
    if (typeof req.query.agentId === 'string') {
      const agentId = uuidQuery.safeParse(req.query.agentId);
      if (!agentId.success) throw new AppError('agentId must be a uuid', 400, 'VALIDATION_ERROR');
      params.push(agentId.data);
      where += ` AND agent_id = $${params.length}::uuid`;
    }
    if (typeof req.query.ticketId === 'string') {
      const ticketId = uuidQuery.safeParse(req.query.ticketId);
      if (!ticketId.success) throw new AppError('ticketId must be a uuid', 400, 'VALIDATION_ERROR');
      params.push(ticketId.data);
      where += ` AND ticket_id = $${params.length}::uuid`;
    }
    params.push(limit);
    const rows = await getPgPool().query(
      `SELECT id, status, activity, agent_id, ticket_id, parent_run_id, pr_url, pr_number, model_id,
              tokens_reserved::int AS tokens_reserved, tokens_total::int AS tokens_total,
              error_code, blocked_reason, external_url, started_at, finished_at, created_at
         FROM agent_runs WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    res.json({ runs: rows.rows });
  } catch (err) { next(err); }
});

runsRouter.get('/:projectId/budget', async (req: AriaRequest, res, next) => {
  try {
    const project = await ownedProject(req.params.projectId, req.user!.workspaceId);
    const env = validateEnv();
    const projectScoped = project.tokenBudgetMonthly != null;
    const usage = await scopedMonthUsage(req.user!.workspaceId, project.id, projectScoped);
    const limit = project.tokenBudgetMonthly ?? env.ARIA_MONTHLY_TOKEN_BUDGET;
    res.json({
      limit,
      projectLimit: project.tokenBudgetMonthly,
      used: usage.used,
      reserved: usage.reserved,
      warnAt: Math.floor(limit * env.TOKEN_BUDGET_WARN_RATIO),
    });
  } catch (err) { next(err); }
});

runsRouter.get('/:projectId/run-signals', async (req: AriaRequest, res, next) => {
  try {
    await ownedProject(req.params.projectId, req.user!.workspaceId);
    const rows = await getPgPool().query<{
      ticket_id: string;
      pr_url: string | null;
      pr_number: number | null;
      live: boolean;
      latest_status: string | null;
      latest_reason: string | null;
    }>(
      `SELECT ticket_id,
              (ARRAY_AGG(pr_url ORDER BY created_at DESC) FILTER (WHERE pr_url IS NOT NULL))[1] AS pr_url,
              (ARRAY_AGG(pr_number ORDER BY created_at DESC) FILTER (WHERE pr_url IS NOT NULL))[1] AS pr_number,
              BOOL_OR(status IN ('queued', 'running')) AS live,
              (ARRAY_AGG(status ORDER BY created_at DESC))[1] AS latest_status,
              (ARRAY_AGG(blocked_reason ORDER BY created_at DESC))[1] AS latest_reason
         FROM agent_runs
        WHERE project_id = $1::uuid AND ticket_id IS NOT NULL
        GROUP BY ticket_id`,
      [req.params.projectId],
    );
    res.json({
      signals: rows.rows.map((row) => ({
        ticketId: row.ticket_id,
        prUrl: row.pr_url,
        prNumber: row.pr_number,
        live: Boolean(row.live),
        blockedReason: row.latest_status === 'blocked' ? row.latest_reason : null,
      })),
    });
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
      const repo = await getPgPool().query<{ repo_name: string; repo_url: string }>(
        `SELECT repo_name, repo_url FROM project_repos WHERE project_id = $1::uuid LIMIT 1`,
        [project.id],
      );
      if (repo.rows[0]) branch = await getBranch(token, githubFullName(repo.rows[0].repo_name, repo.rows[0].repo_url));
    } catch {
      branch = { name: 'main', protected: false };
    }
    const push = await getPgPool().query<{ configured: boolean }>(
      `SELECT github_push_token_encrypted IS NOT NULL AS configured FROM workspaces WHERE id = $1::uuid`,
      [req.user!.workspaceId],
    );
    res.json({
      defaultBranch: branch.name,
      protected: branch.protected,
      acknowledgedAt: project.mergeGuardAckAt,
      pushTokenConfigured: Boolean(push.rows[0]?.configured),
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
    const budgetProvided = Object.prototype.hasOwnProperty.call(req.body, 'tokenBudgetMonthly');
    await getPgPool().query(
      `UPDATE projects
          SET code_runtime = COALESCE($2, code_runtime),
              token_budget_monthly = CASE WHEN $4::boolean THEN $3::bigint ELSE token_budget_monthly END,
              updated_at = NOW()
        WHERE id = $1::uuid`,
      [req.params.projectId, req.body.codeRuntime ?? null, req.body.tokenBudgetMonthly ?? null, budgetProvided],
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
    requireUuid(req.params.flowId, 'flowId');
    const flow = await getPgPool().query(`SELECT id FROM business_flows WHERE id = $1::uuid AND project_id = $2::uuid`, [req.params.flowId, req.params.projectId]);
    if (!flow.rows[0]) throw new AppError('Flow not found', 404, 'NOT_FOUND');
    const owners = req.body.owners as Array<{ agentId: string; layer: FlowLayer; role: FlowRole }>;
    assertOwnerInvariant(owners);
    await setOwners(req.params.flowId, owners, req.params.projectId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

const runRouter = Router();
runRouter.use(requireAuth);
runRouter.get('/:runId', async (req: AriaRequest, res, next) => {
  try {
    requireUuid(req.params.runId, 'runId');
    const run = await getRun(req.params.runId);
    if (!run || run.workspace_id !== req.user!.workspaceId) throw new AppError('Run not found', 404, 'NOT_FOUND');
    res.json({ run });
  } catch (err) { next(err); }
});
runRouter.get('/:runId/logs', async (req: AriaRequest, res, next) => {
  try {
    requireUuid(req.params.runId, 'runId');
    const run = await getRun(req.params.runId);
    if (!run || run.workspace_id !== req.user!.workspaceId) throw new AppError('Run not found', 404, 'NOT_FOUND');
    const after = z.coerce.number().int().nonnegative().safeParse(req.query.afterSeq ?? 0);
    if (!after.success) throw new AppError('afterSeq must be a non-negative integer', 400, 'VALIDATION_ERROR');
    let beforeSeq: number | undefined;
    if (req.query.beforeSeq != null) {
      const before = z.coerce.number().int().positive().safeParse(req.query.beforeSeq);
      if (!before.success) throw new AppError('beforeSeq must be a positive integer', 400, 'VALIDATION_ERROR');
      beforeSeq = before.data;
    }
    const tail = req.query.tail === '1' || req.query.tail === 'true';
    const lines = await listLogs(run.id, {
      afterSeq: after.data,
      beforeSeq,
      tail,
      limit: queryLimit(req.query.limit, tail || beforeSeq != null ? 500 : 200, 2000),
    });
    res.json({ lines });
  } catch (err) { next(err); }
});
runRouter.post('/:runId/cancel', async (req: AriaRequest, res, next) => {
  try {
    requireUuid(req.params.runId, 'runId');
    const run = await getRun(req.params.runId);
    if (!run || run.workspace_id !== req.user!.workspaceId) throw new AppError('Run not found', 404, 'NOT_FOUND');
    if (run.external_agent_id && run.external_run_id) {
      try {
        const { worker, apiKey } = await codeWorkerForWorkspace(run.workspace_id, run.project_id);
        await worker.cancel({ agentId: run.external_agent_id, runId: run.external_run_id }, apiKey);
      } catch { /* already stopped */ }
    }
    res.json({ run: await cancel(run.id) });
  } catch (err) { next(err); }
});
runRouter.post('/:runId/retry', async (req: AriaRequest, res, next) => {
  try {
    requireUuid(req.params.runId, 'runId');
    const run = await getRun(req.params.runId);
    if (!run || run.workspace_id !== req.user!.workspaceId) throw new AppError('Run not found', 404, 'NOT_FOUND');
    if (run.status !== 'failed' && run.status !== 'cancelled' && run.status !== 'blocked') {
      throw new AppError('Only a failed, blocked, or cancelled run can be retried', 422, 'NOT_RETRYABLE');
    }
    if (run.ticket_id) {
      const ticket = await getPgPool().query<{ status: string }>(`SELECT status FROM tickets WHERE id = $1::uuid`, [run.ticket_id]);
      const status = ticket.rows[0]?.status;
      if (status === 'done' || status === 'rejected') {
        throw new AppError('A terminal ticket cannot be retried', 422, 'NOT_RETRYABLE');
      }
      const allowed: Partial<Record<typeof run.activity, readonly string[]>> = {
        develop: ['ready_for_dev', 'in_progress', 'blocked'],
        fix: ['in_progress', 'blocked'],
        review: ['ready_for_review', 'blocked'],
        qa: ['in_qa', 'blocked'],
        story_points: ['backlog', 'ready_for_dev', 'in_progress', 'blocked'],
      };
      const states = allowed[run.activity];
      if (status && states && !states.includes(status)) {
        throw new AppError(`A ${run.activity} run cannot retry while the ticket is ${status}`, 422, 'NOT_RETRYABLE');
      }
    }
    const created = await enqueue({
      workspaceId: run.workspace_id,
      projectId: run.project_id,
      agentId: run.agent_id,
      ticketId: run.ticket_id,
      activity: run.activity,
      taskType: run.task_type,
      runtime: run.runtime,
      idempotencyKey: `retry:${run.id}:${run.attempt}`,
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
    const cursor = z.coerce.number().int().nonnegative().safeParse(req.query.cursor ?? 0);
    if (!cursor.success) throw new AppError('cursor must be a non-negative integer', 400, 'VALIDATION_ERROR');
    let agentId: string | undefined;
    if (typeof req.query.agentId === 'string' && req.query.agentId) {
      const parsedAgent = z.string().uuid().safeParse(req.query.agentId);
      if (!parsedAgent.success) throw new AppError('agentId must be a uuid', 400, 'VALIDATION_ERROR');
      agentId = parsedAgent.data;
    }
    let eventType: string | undefined;
    if (typeof req.query.type === 'string' && req.query.type) {
      const parsedType = z.enum(['status_change', 'agent_action', 'progress', 'communication', 'run_ref', 'owner_decision', 'schedule', 'evidence']).safeParse(req.query.type);
      if (!parsedType.success) throw new AppError('type is not a ticket event', 400, 'VALIDATION_ERROR');
      eventType = parsedType.data;
    }
    const events = await listTicketEvents(req.params.id, {
      eventType,
      agentId,
      afterSeq: cursor.data,
      limit: queryLimit(req.query.limit, 100, 500),
    });
    const chainRows = await listTicketEvents(req.params.id, { limit: 5000 });
    const checked = verifyChain(chainRows);
    res.json({ events, chain: { ...checked, truncated: chainRows.length >= 5000 } });
  } catch (err) { next(err); }
});
ticketExtra.get('/:id/events/export', async (req: AriaRequest, res, next) => {
  try {
    const ticket = await ticketInWorkspace(req.params.id, req.user!.workspaceId);
    const events = await listTicketEvents(req.params.id, { limit: 5000 });
    const truncated = events.length >= 5000;
    if (req.query.format === 'markdown') {
      res.type('text/markdown').send(eventsToMarkdown(ticket.ticket_key, events, truncated));
      return;
    }
    res.json({ ticketKey: ticket.ticket_key, events, truncated });
  } catch (err) { next(err); }
});

const eventSchema = z.object({
  eventType: z.enum(['progress', 'communication']),
  summary: z.string().min(1).max(500),
  detail: z.record(z.unknown()).optional(),
}).strict();
ticketExtra.post('/:id/events', validate(eventSchema), async (req: AriaRequest, res, next) => {
  try {
    const ticket = await ticketInWorkspace(req.params.id, req.user!.workspaceId);
    const event = await appendTicketEvent({
      workspaceId: req.user!.workspaceId,
      projectId: ticket.project_id,
      ticketId: ticket.id,
      eventType: req.body.eventType,
      actorKind: 'human',
      summary: req.body.summary,
      detail: { ...(req.body.detail ?? {}), userId: req.user!.userId },
    });
    res.status(201).json({ event });
  } catch (err) { next(err); }
});
ticketExtra.get('/:id/reports', async (req: AriaRequest, res, next) => {
  try {
    const ticket = await ticketInWorkspace(req.params.id, req.user!.workspaceId);
    const latest = await latestReports(ticket.id);
    const gate = await evidenceAllowsMerge(ticket.id);
    res.json({
      dev: latest.dev ? { valid: latest.dev.valid } : null,
      qa: latest.qa ? { valid: latest.qa.valid } : null,
      gate,
    });
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
