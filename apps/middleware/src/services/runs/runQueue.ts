import type { PoolClient } from 'pg';
import { getPgPool } from '../db.client';
import { backoffMs, releaseRun } from './budget';
import { emitProject } from './hub';

export type RunStatus = 'queued' | 'running' | 'blocked' | 'succeeded' | 'failed' | 'cancelled';
export type RunRuntime = 'cursor_local' | 'cursor_cloud' | 'local_worktree' | 'chat';
export type RunActivity = 'knowledge_map' | 'company_generation' | 'develop' | 'review' | 'fix' | 'qa' | 'story_points';

export interface AgentRunRow {
  id: string;
  workspace_id: string;
  project_id: string;
  agent_id: string | null;
  ticket_id: string | null;
  parent_run_id: string | null;
  activity: RunActivity;
  task_type: string;
  runtime: RunRuntime;
  status: RunStatus;
  blocked_reason: string | null;
  priority: number;
  idempotency_key: string;
  attempt: number;
  max_attempts: number;
  model_id: string | null;
  model_params: unknown;
  external_agent_id: string | null;
  external_run_id: string | null;
  external_url: string | null;
  stream_cursor: string | null;
  repo_id: string | null;
  base_ref: string | null;
  head_sha: string | null;
  branch: string | null;
  pr_url: string | null;
  pr_number: number | null;
  input: Record<string, unknown>;
  prompt_text: string | null;
  result_text: string | null;
  result_json: unknown;
  output_source: string | null;
  error_code: string | null;
  error_message: string | null;
  tokens_reserved: number;
  tokens_total: number | null;
}

const COLUMNS = `id, workspace_id, project_id, agent_id, ticket_id, parent_run_id, activity, task_type, runtime,
  status, blocked_reason, priority, idempotency_key, attempt, max_attempts, model_id, model_params,
  external_agent_id, external_run_id, external_url, stream_cursor, repo_id, base_ref, head_sha, branch,
  pr_url, pr_number, input, prompt_text, result_text, result_json, output_source, error_code, error_message,
  tokens_reserved::int AS tokens_reserved, tokens_total::int AS tokens_total`;

function mapRow(row: AgentRunRow): AgentRunRow {
  return { ...row, input: (row.input ?? {}) as Record<string, unknown>, tokens_reserved: Number(row.tokens_reserved ?? 0) };
}

export async function enqueue(input: {
  workspaceId: string;
  projectId: string;
  agentId?: string | null;
  ticketId?: string | null;
  parentRunId?: string | null;
  activity: RunActivity;
  taskType: string;
  runtime: RunRuntime;
  idempotencyKey: string;
  priority?: number;
  input?: Record<string, unknown>;
  repoId?: string | null;
  baseRef?: string | null;
}): Promise<{ id: string; created: boolean }> {
  const inserted = await getPgPool().query<{ id: string }>(
    `INSERT INTO agent_runs (
       workspace_id, project_id, agent_id, ticket_id, parent_run_id, activity, task_type, runtime,
       idempotency_key, priority, input, repo_id, base_ref
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8, $9, $10, $11::jsonb, $12::uuid, $13
     )
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id`,
    [
      input.workspaceId,
      input.projectId,
      input.agentId ?? null,
      input.ticketId ?? null,
      input.parentRunId ?? null,
      input.activity,
      input.taskType,
      input.runtime,
      input.idempotencyKey,
      input.priority ?? 0,
      JSON.stringify(input.input ?? {}),
      input.repoId ?? null,
      input.baseRef ?? null,
    ],
  );
  if (inserted.rows[0]) return { id: inserted.rows[0].id, created: true };
  const existing = await getPgPool().query<{ id: string }>(
    `SELECT id FROM agent_runs WHERE idempotency_key = $1`,
    [input.idempotencyKey],
  );
  return { id: existing.rows[0].id, created: false };
}

export async function getRun(id: string): Promise<AgentRunRow | null> {
  const result = await getPgPool().query<AgentRunRow>(`SELECT ${COLUMNS} FROM agent_runs WHERE id = $1::uuid`, [id]);
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function claim(workerId: string, runtimes: RunRuntime[]): Promise<AgentRunRow | null> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const picked = await client.query<{ id: string }>(
      `SELECT id FROM agent_runs
        WHERE status = 'queued' AND not_before <= NOW() AND runtime = ANY($1::text[])
          AND (agent_id IS NULL OR NOT EXISTS (
            SELECT 1 FROM agent_runs other
             WHERE other.agent_id = agent_runs.agent_id AND other.status = 'running'
          ))
          AND (agent_id IS NULL OR EXISTS (
            SELECT 1 FROM skills s WHERE s.id = agent_runs.agent_id AND s.enabled = true
          ))
        ORDER BY priority DESC, created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1`,
      [runtimes],
    );
    if (!picked.rows[0]) {
      await client.query('COMMIT');
      return null;
    }
    try {
      const updated = await client.query<AgentRunRow>(
        `UPDATE agent_runs
            SET status = 'running', lease_owner = $2, lease_expires_at = NOW() + interval '90 seconds',
                heartbeat_at = NOW(), started_at = COALESCE(started_at, NOW()), updated_at = NOW()
          WHERE id = $1::uuid AND status = 'queued'
          RETURNING ${COLUMNS}`,
        [picked.rows[0].id, workerId],
      );
      await client.query('COMMIT');
      const row = updated.rows[0];
      if (row) emitProject(row.project_id, 'run:updated', summary(mapRow(row)));
      return row ? mapRow(row) : null;
    } catch (err) {
      await client.query('ROLLBACK');
      if (pgCode(err) === '23505') return null;
      throw err;
    }
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* already closed */ }
    throw err;
  } finally {
    client.release();
  }
}

export async function claimById(id: string, workerId: string): Promise<AgentRunRow | null> {
  const result = await getPgPool().query<AgentRunRow>(
    `UPDATE agent_runs
        SET status = 'running', lease_owner = $2, lease_expires_at = NOW() + interval '90 seconds',
            heartbeat_at = NOW(), started_at = COALESCE(started_at, NOW()), updated_at = NOW()
      WHERE id = $1::uuid AND status = 'queued'
      RETURNING ${COLUMNS}`,
    [id, workerId],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function heartbeat(id: string, workerId: string): Promise<boolean> {
  const result = await getPgPool().query(
    `UPDATE agent_runs
        SET heartbeat_at = NOW(), lease_expires_at = NOW() + interval '90 seconds', updated_at = NOW()
      WHERE id = $1::uuid AND lease_owner = $2 AND status = 'running'`,
    [id, workerId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function succeed(id: string, workerId: string, patch: Partial<AgentRunRow> & { tokensTotal?: number }): Promise<boolean> {
  const result = await getPgPool().query<AgentRunRow>(
    `UPDATE agent_runs
        SET status = 'succeeded', finished_at = NOW(), updated_at = NOW(),
            lease_owner = NULL, lease_expires_at = NULL, tokens_reserved = 0,
            result_text = COALESCE($3, result_text),
            result_json = COALESCE($4::jsonb, result_json),
            output_source = COALESCE($5, output_source),
            pr_url = COALESCE($6, pr_url),
            pr_number = COALESCE($7, pr_number),
            branch = COALESCE($8, branch),
            head_sha = COALESCE($9, head_sha),
            tokens_total = COALESCE($10, tokens_total),
            external_agent_id = COALESCE($11, external_agent_id),
            external_run_id = COALESCE($12, external_run_id)
      WHERE id = $1::uuid AND status = 'running' AND lease_owner = $2
      RETURNING ${COLUMNS}`,
    [
      id,
      workerId,
      patch.result_text ?? null,
      patch.result_json ? JSON.stringify(patch.result_json) : null,
      patch.output_source ?? null,
      patch.pr_url ?? null,
      patch.pr_number ?? null,
      patch.branch ?? null,
      patch.head_sha ?? null,
      patch.tokensTotal ?? patch.tokens_total ?? null,
      patch.external_agent_id ?? null,
      patch.external_run_id ?? null,
    ],
  );
  const row = result.rows[0];
  if (row) emitProject(row.project_id, 'run:updated', summary(mapRow(row)));
  return Boolean(row);
}

export async function block(id: string, workerId: string, reason: string, message: string): Promise<boolean> {
  const result = await getPgPool().query<AgentRunRow>(
    `UPDATE agent_runs
        SET status = 'blocked', blocked_reason = $3, error_code = $3, error_message = $4,
            finished_at = NOW(), updated_at = NOW(), lease_owner = NULL, lease_expires_at = NULL,
            tokens_reserved = 0
      WHERE id = $1::uuid AND status = 'running' AND lease_owner = $2
      RETURNING ${COLUMNS}`,
    [id, workerId, reason, message.slice(0, 500)],
  );
  const row = result.rows[0];
  if (row) emitProject(row.project_id, 'run:updated', summary(mapRow(row)));
  return Boolean(row);
}

export async function fail(id: string, workerId: string, code: string, message: string, retryable: boolean): Promise<boolean> {
  const client = await getPgPool().connect();
  try {
    await client.query('BEGIN');
    const current = await client.query<AgentRunRow>(
      `SELECT ${COLUMNS} FROM agent_runs WHERE id = $1::uuid AND status = 'running' AND lease_owner = $2 FOR UPDATE`,
      [id, workerId],
    );
    const run = current.rows[0] ? mapRow(current.rows[0]) : null;
    if (!run) {
      await client.query('ROLLBACK');
      return false;
    }
    const nextAttempt = run.attempt + 1;
    if (retryable && nextAttempt < run.max_attempts) {
      const delay = backoffMs(nextAttempt);
      await client.query(
        `UPDATE agent_runs
            SET status = 'queued', attempt = $2, not_before = NOW() + ($3::text || ' milliseconds')::interval,
                error_code = $4, error_message = $5, lease_owner = NULL, lease_expires_at = NULL,
                tokens_reserved = 0, updated_at = NOW()
          WHERE id = $1::uuid AND status = 'running' AND lease_owner = $6`,
        [id, nextAttempt, String(delay), code, message.slice(0, 500), workerId],
      );
      await client.query('COMMIT');
      return true;
    }
    const result = await client.query<AgentRunRow>(
      `UPDATE agent_runs
          SET status = 'failed', attempt = $2, error_code = $3, error_message = $4,
              finished_at = NOW(), updated_at = NOW(), lease_owner = NULL, lease_expires_at = NULL,
              tokens_reserved = 0
        WHERE id = $1::uuid AND status = 'running' AND lease_owner = $5
        RETURNING ${COLUMNS}`,
      [id, nextAttempt, code, message.slice(0, 500), workerId],
    );
    await client.query('COMMIT');
    const row = result.rows[0];
    if (row) emitProject(row.project_id, 'run:updated', summary(mapRow(row)));
    return Boolean(row);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* already closed */ }
    throw err;
  } finally {
    client.release();
  }
}

export async function cancel(id: string): Promise<AgentRunRow | null> {
  const result = await getPgPool().query<AgentRunRow>(
    `UPDATE agent_runs
        SET status = 'cancelled', finished_at = NOW(), updated_at = NOW(),
            lease_owner = NULL, lease_expires_at = NULL, error_code = 'CANCELLED'
      WHERE id = $1::uuid AND status IN ('queued', 'running', 'blocked')
      RETURNING ${COLUMNS}`,
    [id],
  );
  const row = result.rows[0] ? mapRow(result.rows[0]) : null;
  if (row) emitProject(row.project_id, 'run:updated', summary(row));
  return row;
}

export async function markTokensReserved(id: string, tokens: number): Promise<void> {
  await getPgPool().query(`UPDATE agent_runs SET tokens_reserved = $2, updated_at = NOW() WHERE id = $1::uuid`, [id, tokens]);
}

export async function reap(): Promise<number> {
  const client = await getPgPool().connect();
  try {
    await client.query('BEGIN');
    const expired = await client.query<AgentRunRow>(
      `SELECT ${COLUMNS} FROM agent_runs
        WHERE status = 'running' AND lease_expires_at < NOW()
        FOR UPDATE`,
    );
    let reaped = 0;
    const released: Array<{ workspaceId: string; activity: RunActivity; tokens: number; agentId: string | null; projectId: string; projectScoped: boolean }> = [];
    for (const row of expired.rows) {
      const run = mapRow(row);
      const cloudResume = run.runtime === 'cursor_cloud' && run.external_run_id;
      const nextAttempt = run.attempt + 1;
      const giveUp = !cloudResume && nextAttempt >= run.max_attempts;
      const delay = backoffMs(nextAttempt);
      const updated = await client.query(
        `UPDATE agent_runs
            SET status = $2,
                attempt = $3,
                not_before = CASE WHEN $2 = 'queued' THEN NOW() + ($4::text || ' milliseconds')::interval ELSE not_before END,
                error_code = CASE WHEN $2 = 'failed' THEN 'TIMEOUT' ELSE error_code END,
                error_message = CASE WHEN $2 = 'failed' THEN 'Lease expired' ELSE error_message END,
                finished_at = CASE WHEN $2 = 'failed' THEN NOW() ELSE finished_at END,
                lease_owner = NULL, lease_expires_at = NULL, tokens_reserved = 0, updated_at = NOW()
          WHERE id = $1::uuid AND status = 'running' AND lease_expires_at < NOW()`,
        [run.id, giveUp ? 'failed' : 'queued', cloudResume ? run.attempt : nextAttempt, String(cloudResume ? 0 : delay)],
      );
      if ((updated.rowCount ?? 0) > 0) {
        reaped += 1;
        if (run.tokens_reserved > 0) {
          const budget = await client.query<{ token_budget_monthly: string | null }>(
            `SELECT token_budget_monthly::text FROM projects WHERE id = $1::uuid`,
            [run.project_id],
          );
          released.push({
            workspaceId: run.workspace_id,
            activity: run.activity,
            tokens: run.tokens_reserved,
            agentId: run.agent_id,
            projectId: run.project_id,
            projectScoped: budget.rows[0]?.token_budget_monthly != null,
          });
        }
      }
    }
    await client.query('COMMIT');
    for (const item of released) {
      await releaseRun(item.workspaceId, item.activity, item.tokens, item.agentId, item.projectId, item.projectScoped);
    }
    return reaped;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* already closed */ }
    throw err;
  } finally {
    client.release();
  }
}

export async function releaseLeases(workerId: string): Promise<void> {
  await getPgPool().query(
    `UPDATE agent_runs SET lease_expires_at = NOW(), updated_at = NOW()
      WHERE lease_owner = $1 AND status = 'running'`,
    [workerId],
  );
}

export async function blockQueuedForAgent(agentId: string, reason: string): Promise<void> {
  await getPgPool().query(
    `UPDATE agent_runs SET status = 'blocked', blocked_reason = $2, updated_at = NOW()
      WHERE agent_id = $1::uuid AND status = 'queued'`,
    [agentId, reason],
  );
}

export async function cancelRunningForAgent(agentId: string): Promise<Array<{ id: string; external_agent_id: string | null; external_run_id: string | null; workspace_id: string }>> {
  const result = await getPgPool().query<{ id: string; external_agent_id: string | null; external_run_id: string | null; workspace_id: string }>(
    `UPDATE agent_runs
        SET status = 'cancelled', error_code = 'CANCELLED', finished_at = NOW(), updated_at = NOW(),
            lease_owner = NULL, lease_expires_at = NULL, tokens_reserved = 0
      WHERE agent_id = $1::uuid AND status = 'running'
      RETURNING id, external_agent_id, external_run_id, workspace_id`,
    [agentId],
  );
  return result.rows;
}

export async function unblockQueuedForAgent(agentId: string): Promise<number> {
  const result = await getPgPool().query(
    `UPDATE agent_runs
        SET status = 'queued', blocked_reason = NULL, not_before = NOW(), updated_at = NOW()
      WHERE agent_id = $1::uuid AND status = 'blocked' AND blocked_reason = 'agent_off'`,
    [agentId],
  );
  return result.rowCount ?? 0;
}

export async function enqueueOn(client: PoolClient, input: Parameters<typeof enqueue>[0]): Promise<{ id: string; created: boolean }> {
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO agent_runs (
       workspace_id, project_id, agent_id, ticket_id, parent_run_id, activity, task_type, runtime,
       idempotency_key, priority, input, repo_id, base_ref
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8, $9, $10, $11::jsonb, $12::uuid, $13
     )
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id`,
    [
      input.workspaceId, input.projectId, input.agentId ?? null, input.ticketId ?? null, input.parentRunId ?? null,
      input.activity, input.taskType, input.runtime, input.idempotencyKey, input.priority ?? 0,
      JSON.stringify(input.input ?? {}), input.repoId ?? null, input.baseRef ?? null,
    ],
  );
  if (inserted.rows[0]) return { id: inserted.rows[0].id, created: true };
  const existing = await client.query<{ id: string }>(`SELECT id FROM agent_runs WHERE idempotency_key = $1`, [input.idempotencyKey]);
  return { id: existing.rows[0].id, created: false };
}

export function summary(run: AgentRunRow) {
  return {
    id: run.id,
    status: run.status,
    activity: run.activity,
    agentId: run.agent_id,
    ticketId: run.ticket_id,
    prUrl: run.pr_url,
    tokens: run.tokens_total ?? run.tokens_reserved,
    error_code: run.error_code,
  };
}

function pgCode(err: unknown): string | undefined {
  return err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : undefined;
}
