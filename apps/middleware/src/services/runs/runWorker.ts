import { validateEnv } from '../../config/env';
import { getPgPool } from '../db.client';
import { executeCompany } from '../activities/company';
import { executeFix, executeDevelop, executeQa, executeReview, prepareDevelop } from '../activities/delivery';
import { executeKnowledge } from '../activities/knowledgeMap';
import { releaseRun, reserveRun, settleRun, usageTotal } from './budget';
import { resolveForRun } from '../models/resolveForRun';
import { maybeWatchPulls } from '../tickets/prWatcher';
import { RunError, asRunError } from './errors';
import { append, flush } from './runLogs';
import { block, claim, claimById, fail, getRun, heartbeat, markTokensReserved, reap, releaseLeases, succeed, type RunRuntime } from './runQueue';

const BLOCKING = new Set(['BUDGET_EXCEEDED', 'MERGE_GUARD', 'REPO_ACCESS', 'KEY_INVALID', 'USAGE_LIMIT', 'MODEL_UNAVAILABLE', 'NO_CHANGES']);

let timer: NodeJS.Timeout | null = null;
let stopped = false;
const workerId = `mw-${process.pid}`;

export async function processRunById(id: string): Promise<void> {
  const claimed = await claimById(id, workerId);
  const run = claimed ?? await getRun(id);
  if (!run || (claimed == null && run.status !== 'running')) return;
  await executeClaimed(claimed ?? run);
}

async function executeClaimed(run: NonNullable<Awaited<ReturnType<typeof getRun>>>): Promise<void> {
  const beat = setInterval(() => { void heartbeat(run.id, workerId); }, 30_000);
  beat.unref?.();
  let reserved = 0;
  try {
    run.model_id = await resolveForRun(run);
    await getPgPool().query(
      `UPDATE agent_runs SET model_id = $2, updated_at = NOW() WHERE id = $1::uuid`,
      [run.id, run.model_id],
    );
    if (run.activity === 'develop') await prepareDevelop(run);
    const project = await import('../db.client').then(async ({ getPgPool }) => {
      const result = await getPgPool().query<{ token_budget_monthly: string | null; agent_budget: string | null }>(
        `SELECT p.token_budget_monthly::text, s.token_budget_monthly::text AS agent_budget
           FROM projects p LEFT JOIN skills s ON s.id = $2::uuid WHERE p.id = $1::uuid`,
        [run.project_id, run.agent_id],
      );
      return result.rows[0];
    });
    const projectBudget = project?.token_budget_monthly ? Number(project.token_budget_monthly) : null;
    const decision = await reserveRun({
      workspaceId: run.workspace_id,
      agentId: run.agent_id,
      activity: run.activity,
      projectBudget,
      agentBudget: project?.agent_budget ? Number(project.agent_budget) : null,
      projectId: run.project_id,
    });
    if (!decision.ok) {
      await block(run.id, decision.code || 'BUDGET_EXCEEDED', 'Monthly token budget would be exceeded');
      return;
    }
    reserved = decision.reserved;
    await markTokensReserved(run.id, reserved);
    const result = await dispatch(run);
    await settleRun({
      workspaceId: run.workspace_id,
      activity: run.activity,
      reserved,
      actual: usageTotal({ total: result.tokensTotal }) || 1,
      projectId: run.project_id,
      limit: projectBudget ?? validateEnv().ARIA_MONTHLY_TOKEN_BUDGET,
    });
    await succeed(run.id, result);
  } catch (err) {
    const runError = asRunError(err);
    if (reserved) await releaseRun(run.workspace_id, run.activity, reserved);
    await append(run.id, 'error', runError.message);
    if (BLOCKING.has(runError.code) || !runError.retryable) await block(run.id, runError.code, runError.message);
    else await fail(run.id, runError.code, runError.message, runError.retryable);
    if (run.ticket_id && run.activity === 'develop' && runError.code !== 'MERGE_GUARD') {
      try {
        const { applyTransition } = await import('../tickets/ticketActions');
        await applyTransition(run.ticket_id, 'dev_failed', { reason: runError.message, runId: run.id });
      } catch {
        // The ticket may already have moved.
      }
    }
  } finally {
    clearInterval(beat);
    await flush(run.id);
  }
}

async function dispatch(run: NonNullable<Awaited<ReturnType<typeof getRun>>>): Promise<{ outputSource?: string; text?: string; prUrl?: string; prNumber?: number; branch?: string; headSha?: string; tokensTotal?: number; result_text?: string; result_json?: unknown }> {
  switch (run.activity) {
    case 'company_generation': {
      const result = await executeCompany(run);
      return { outputSource: result.outputSource, text: result.text, result_text: result.text };
    }
    case 'knowledge_map': {
      const result = await executeKnowledge(run);
      return { outputSource: result.outputSource, text: result.text, result_text: result.text };
    }
    case 'develop': {
      const result = await executeDevelop(run);
      return { ...result, result_text: result.text };
    }
    case 'review': {
      const result = await executeReview(run);
      return { outputSource: result.outputSource, text: result.text, result_text: result.text };
    }
    case 'qa': {
      const result = await executeQa(run);
      return { ...result, result_text: result.text };
    }
    case 'fix': {
      const result = await executeFix(run);
      return { ...result, result_text: result.text };
    }
    default: {
      const neverActivity: never = run.activity;
      throw new RunError('RUN_ERROR', `Unknown activity ${String(neverActivity)}`, false);
    }
  }
}

const RUNTIMES: RunRuntime[] = ['cursor_local', 'cursor_cloud', 'local_worktree', 'chat'];

export function startRunWorker(): void {
  if (!validateEnv().RUN_WORKER_ENABLED || timer) return;
  stopped = false;
  void reap();
  timer = setInterval(() => { void tick(); }, 2000);
  timer.unref?.();
}

export function stopRunWorker(): void {
  stopped = true;
  if (timer) clearInterval(timer);
  timer = null;
  void releaseLeases(workerId);
}

export async function tick(): Promise<void> {
  if (stopped) return;
  await reap();
  const env = validateEnv();
  const limits: Record<RunRuntime, number> = {
    cursor_local: env.RUN_CONCURRENCY_CURSOR_LOCAL,
    cursor_cloud: env.RUN_CONCURRENCY_CURSOR_CLOUD,
    local_worktree: env.RUN_CONCURRENCY_LOCAL_WORKTREE,
    chat: env.RUN_CONCURRENCY_CHAT,
  };
  for (const runtime of RUNTIMES) {
    for (let n = 0; n < limits[runtime]; n++) {
      const run = await claim(workerId, [runtime]);
      if (!run) break;
      void executeClaimed(run);
    }
  }
  const { dispatchReadyTickets } = await import('../tickets/ticketDispatcher');
  await dispatchReadyTickets();
  const { scanSchedule } = await import('../tickets/ticketActions');
  await scanSchedule();
  await maybeWatchPulls();
}
