import { getPgPool } from '../db.client';
import { backoffMs } from './budget';
import { emitProject } from './hub';

export type RunStatus = 'queued' | 'running' | 'blocked' | 'succeeded' | 'failed' | 'cancelled';
export type RunRuntime = 'cursor_local' | 'cursor_cloud' | 'local_worktree' | 'chat';
export type RunActivity = 'knowledge_map' | 'company_generation' | 'develop' | 'review' | 'fix' | 'qa';

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
          WHERE id = $1::uuid
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

export async function heartbeat(id: string, workerId: string): Promise<void> {
  await getPgPool().query(
    `UPDATE agent_runs
        SET heartbeat_at = NOW(), lease_expires_at = NOW() + interval '90 seconds', updated_at = NOW()
      WHERE id = $1::uuid AND lease_owner = $2 AND status = 'running'`,
    [id, workerId],
  );
}

export async function succeed(id: string, patch: Partial<AgentRunRow> & { tokensTotal?: number }): Promise<void> {
  const result = await getPgPool().query<AgentRunRow>(
    `UPDATE agent_runs
        SET status = 'succeeded', finished_at = NOW(), updated_at = NOW(),
            lease_owner = NULL, lease_expires_at = NULL,
            result_text = COALESCE($2, result_text),
            result_json = COALESCE($3::jsonb, result_json),
            output_source = COALESCE($4, output_source),
            pr_url = COALESCE($5, pr_url),
            pr_number = COALESCE($6, pr_number),
            branch = COALESCE($7, branch),
            head_sha = COALESCE($8, head_sha),
            tokens_total = COALESCE($9, tokens_total),
            external_agent_id = COALESCE($10, external_agent_id),
            external_run_id = COALESCE($11, external_run_id)
      WHERE id = $1::uuid
      RETURNING ${COLUMNS}`,
    [
      id,
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
}

export async function block(id: string, reason: string, message: string): Promise<void> {
  const result = await getPgPool().query<AgentRunRow>(
    `UPDATE agent_runs
        SET status = 'blocked', blocked_reason = $2, error_code = $2, error_message = $3,
            finished_at = NOW(), updated_at = NOW(), lease_owner = NULL, lease_expires_at = NULL,
            tokens_reserved = 0
      WHERE id = $1::uuid
      RETURNING ${COLUMNS}`,
    [id, reason, message.slice(0, 500)],
  );
  const row = result.rows[0];
  if (row) emitProject(row.project_id, 'run:updated', summary(mapRow(row)));
}

export async function fail(id: string, code: string, message: string, retryable: boolean): Promise<void> {
  const current = await getRun(id);
  if (!current) return;
  const nextAttempt = current.attempt + 1;
  if (retryable && nextAttempt < current.max_attempts) {
    const delay = backoffMs(nextAttempt);
    await getPgPool().query(
      `UPDATE agent_runs
          SET status = 'queued', attempt = $2, not_before = NOW() + ($3::text || ' milliseconds')::interval,
              error_code = $4, error_message = $5, lease_owner = NULL, lease_expires_at = NULL, updated_at = NOW()
        WHERE id = $1::uuid`,
      [id, nextAttempt, String(delay), code, message.slice(0, 500)],
    );
    return;
  }
  const result = await getPgPool().query<AgentRunRow>(
    `UPDATE agent_runs
        SET status = 'failed', attempt = $2, error_code = $3, error_message = $4,
            finished_at = NOW(), updated_at = NOW(), lease_owner = NULL, lease_expires_at = NULL
      WHERE id = $1::uuid
      RETURNING ${COLUMNS}`,
    [id, nextAttempt, code, message.slice(0, 500)],
  );
  const row = result.rows[0];
  if (row) emitProject(row.project_id, 'run:updated', summary(mapRow(row)));
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
  const expired = await getPgPool().query<AgentRunRow>(
    `SELECT ${COLUMNS} FROM agent_runs WHERE status = 'running' AND lease_expires_at < NOW()`,
  );
  for (const row of expired.rows) {
    const run = mapRow(row);
    if (run.runtime === 'cursor_cloud' && run.external_run_id) {
      await getPgPool().query(
        `UPDATE agent_runs
            SET status = 'queued', not_before = NOW(), lease_owner = NULL, lease_expires_at = NULL, updated_at = NOW()
          WHERE id = $1::uuid`,
        [run.id],
      );
      continue;
    }
    const nextAttempt = run.attempt + 1;
    if (nextAttempt >= run.max_attempts) {
      await fail(run.id, 'TIMEOUT', 'Lease expired', false);
    } else {
      const delay = backoffMs(nextAttempt);
      await getPgPool().query(
        `UPDATE agent_runs
            SET status = 'queued', attempt = $2, not_before = NOW() + ($3::text || ' milliseconds')::interval,
                lease_owner = NULL, lease_expires_at = NULL, updated_at = NOW()
          WHERE id = $1::uuid`,
        [run.id, nextAttempt, String(delay)],
      );
    }
  }
  return expired.rows.length;
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

export async function cancelRunningForAgent(agentId: string): Promise<string[]> {
  const result = await getPgPool().query<{ id: string }>(
    `UPDATE agent_runs
        SET status = 'cancelled', error_code = 'CANCELLED', finished_at = NOW(), updated_at = NOW(),
            lease_owner = NULL, lease_expires_at = NULL
      WHERE agent_id = $1::uuid AND status = 'running'
      RETURNING id`,
    [agentId],
  );
  return result.rows.map((row) => row.id);
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
