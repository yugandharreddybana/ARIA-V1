import { createHash } from 'node:crypto';
import { v5 as uuidv5 } from 'uuid';
import { validateEnv } from '../../config/env';
import { getPgPool } from '../db.client';
import type { RunErrorCode } from './errors';
import { RunError } from './errors';
import { emitProject } from './hub';

const NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

export function monthlyBucketId(scopeId: string, now = new Date()): string {
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return uuidv5(`${scopeId}:${month}`, NAMESPACE);
}

export const DEFAULT_RESERVE: Record<string, { reserve: number; cap: number }> = {
  knowledge_map: { reserve: 300_000, cap: 1_500_000 },
  company_generation: { reserve: 60_000, cap: 200_000 },
  review: { reserve: 250_000, cap: 1_000_000 },
  develop: { reserve: 2_000_000, cap: 8_000_000 },
  fix: { reserve: 1_000_000, cap: 4_000_000 },
  qa: { reserve: 1_500_000, cap: 6_000_000 },
  story_points: { reserve: 20_000, cap: 80_000 },
};

export function backoffMs(attempt: number, rand = Math.random()): number {
  const base = 30_000 * 4 ** Math.max(0, attempt - 1);
  const jitter = 1 + (rand * 2 - 1) * 0.2;
  return Math.round(base * jitter);
}

export function p90(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(0.9 * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

export async function estimateFor(activity: string, workspaceId?: string): Promise<{ reserve: number; cap: number }> {
  const defaults = DEFAULT_RESERVE[activity] ?? { reserve: 100_000, cap: 400_000 };
  const rows = await getPgPool().query<{ tokens_total: string }>(
    `SELECT tokens_total::text
       FROM agent_runs
      WHERE activity = $1 AND status = 'succeeded' AND tokens_total IS NOT NULL
        AND ($2::uuid IS NULL OR workspace_id = $2::uuid)
      ORDER BY finished_at DESC NULLS LAST
      LIMIT 20`,
    [activity, workspaceId ?? null],
  );
  if (rows.rows.length < 20) return defaults;
  const reserve = Math.max(1, Math.round(p90(rows.rows.map((row) => Number(row.tokens_total)))));
  return { reserve, cap: reserve * 4 };
}

export interface BudgetDecision {
  ok: boolean;
  reserved: number;
  code?: RunErrorCode;
}

function scopeBackend(activity: string, projectId: string | null | undefined, projectScoped: boolean): string {
  if (projectScoped && projectId) return `project:${projectId}`;
  return runtimeBackend(activity);
}

async function projected(sessionId: string, backendId?: string): Promise<number> {
  const result = await getPgPool().query<{ projected: string }>(
    `SELECT COALESCE(SUM(tokens_used + tokens_reserved), 0)::text AS projected
       FROM token_ledger
      WHERE session_id = $1::uuid AND ($2::text IS NULL OR backend_id = $2)`,
    [sessionId, backendId ?? null],
  );
  return Number(result.rows[0]?.projected ?? 0);
}

export async function reserveRun(input: {
  workspaceId: string;
  agentId: string | null;
  activity: string;
  projectBudget: number | null;
  agentBudget: number | null;
  projectId?: string | null;
}): Promise<BudgetDecision> {
  const env = validateEnv();
  const estimate = await estimateFor(input.activity, input.workspaceId);
  const projectScoped = input.projectBudget != null;
  const limit = projectScoped ? input.projectBudget! : env.ARIA_MONTHLY_TOKEN_BUDGET;
  const hard = env.TOKEN_BUDGET_HARD_RATIO;
  const workspaceSession = monthlyBucketId(input.workspaceId);
  const backend = scopeBackend(input.activity, input.projectId, projectScoped);
  const client = await getPgPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1::text))`, [`budget:${input.workspaceId}`]);
    const workspaceUsed = await projected(workspaceSession, projectScoped ? backend : undefined);
    if (workspaceUsed + estimate.reserve > Math.floor(limit * hard)) {
      await client.query('ROLLBACK');
      return { ok: false, reserved: 0, code: 'BUDGET_EXCEEDED' };
    }
    if (input.agentId && input.agentBudget != null) {
      const agentUsed = await projected(monthlyBucketId(input.agentId));
      if (agentUsed + estimate.reserve > Math.floor(input.agentBudget * hard)) {
        await client.query('ROLLBACK');
        return { ok: false, reserved: 0, code: 'BUDGET_EXCEEDED' };
      }
    }
    await client.query(
      `INSERT INTO token_ledger (session_id, backend_id, tokens_used, tokens_reserved, last_updated_at)
       VALUES ($1::uuid, $2, 0, $3, NOW())
       ON CONFLICT (session_id, backend_id) DO UPDATE
         SET tokens_reserved = token_ledger.tokens_reserved + EXCLUDED.tokens_reserved,
             last_updated_at = NOW()`,
      [workspaceSession, backend, estimate.reserve],
    );
    if (input.agentId) {
      await client.query(
        `INSERT INTO token_ledger (session_id, backend_id, tokens_used, tokens_reserved, last_updated_at)
         VALUES ($1::uuid, $2, 0, $3, NOW())
         ON CONFLICT (session_id, backend_id) DO UPDATE
           SET tokens_reserved = token_ledger.tokens_reserved + EXCLUDED.tokens_reserved,
               last_updated_at = NOW()`,
        [monthlyBucketId(input.agentId), runtimeBackend(input.activity), estimate.reserve],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* already closed */ }
    throw err;
  } finally {
    client.release();
  }
  await noteBudget(input.workspaceId, input.projectId ?? null, limit);
  return { ok: true, reserved: estimate.reserve };
}

export async function checkMidRun(spent: number, cap: number, workspaceRemaining?: number): Promise<void> {
  if (!Number.isFinite(spent) || !Number.isFinite(cap) || cap <= 0) {
    throw new RunError('BUDGET_EXCEEDED', 'Per-run token cap is unavailable', false);
  }
  if (spent > cap) throw new RunError('BUDGET_EXCEEDED', 'Per-run token cap exceeded', false);
  if (workspaceRemaining != null && spent > workspaceRemaining) {
    throw new RunError('BUDGET_EXCEEDED', 'Monthly token budget would be exceeded', false);
  }
}

export async function noteBudget(workspaceId: string, projectId: string | null, limit: number): Promise<void> {
  if (!projectId || limit <= 0) return;
  const ratio = validateEnv().TOKEN_BUDGET_WARN_RATIO;
  const used = await usageOf(monthlyBucketId(workspaceId));
  if (used / limit >= ratio) emitProject(projectId, 'budget:warn', { projectId, used, limit });
}

export async function workspaceMonthUsage(workspaceId: string): Promise<{ used: number; reserved: number }> {
  const result = await getPgPool().query<{ used: string; reserved: string }>(
    `SELECT COALESCE(SUM(tokens_used), 0)::text AS used,
            COALESCE(SUM(tokens_reserved), 0)::text AS reserved
       FROM token_ledger WHERE session_id = $1::uuid`,
    [monthlyBucketId(workspaceId)],
  );
  return {
    used: Number(result.rows[0]?.used ?? 0),
    reserved: Number(result.rows[0]?.reserved ?? 0),
  };
}

async function usageOf(sessionId: string): Promise<number> {
  const result = await getPgPool().query<{ projected: string }>(
    `SELECT COALESCE(SUM(tokens_used + tokens_reserved), 0)::text AS projected
       FROM token_ledger WHERE session_id = $1::uuid`,
    [sessionId],
  );
  return Number(result.rows[0]?.projected ?? 0);
}

function runtimeBackend(activity: string): string {
  if (activity === 'develop' || activity === 'fix' || activity === 'qa') return 'cursor-cloud';
  if (activity === 'knowledge_map' || activity === 'company_generation' || activity === 'review' || activity === 'story_points') return 'cursor-local';
  return 'workspace-llm';
}

export async function settleRun(input: {
  workspaceId: string;
  activity: string;
  reserved: number;
  actual: number;
  projectId?: string | null;
  limit?: number | null;
  agentId?: string | null;
  projectScoped?: boolean;
}): Promise<void> {
  const scoped = input.projectScoped ?? false;
  await getPgPool().query(
    `UPDATE token_ledger
        SET tokens_used = tokens_used + $3,
            tokens_reserved = GREATEST(0, tokens_reserved - $4),
            last_updated_at = NOW()
      WHERE session_id = $1::uuid AND backend_id = $2`,
    [monthlyBucketId(input.workspaceId), scopeBackend(input.activity, input.projectId, scoped), input.actual, input.reserved],
  );
  if (input.agentId) {
    await getPgPool().query(
      `UPDATE token_ledger
          SET tokens_used = tokens_used + $3,
              tokens_reserved = GREATEST(0, tokens_reserved - $4),
              last_updated_at = NOW()
        WHERE session_id = $1::uuid AND backend_id = $2`,
      [monthlyBucketId(input.agentId), runtimeBackend(input.activity), input.actual, input.reserved],
    );
  }
  if (input.projectId && input.limit) await noteBudget(input.workspaceId, input.projectId, input.limit);
}

export async function releaseRun(workspaceId: string, activity: string, reserved: number, agentId?: string | null, projectId?: string | null, projectScoped = false): Promise<void> {
  await settleRun({ workspaceId, activity, reserved, actual: 0, agentId, projectId, projectScoped });
}

export function usageTotal(usage: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; total?: number } | null): number {
  if (!usage) return 0;
  if (usage.total != null) return usage.total;
  return (usage.input ?? 0) + (usage.output ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0);
}

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function assertNeverBudget(code: RunErrorCode | undefined): void {
  if (!code) return;
  if (code !== 'BUDGET_EXCEEDED') throw new RunError(code, code, false);
}
