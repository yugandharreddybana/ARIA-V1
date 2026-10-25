import { validateEnv } from '../../config/env';
import { getPgPool } from '../db.client';
import { executeCompany } from '../activities/company';
import { executeFix, executeDevelop, executeQa, executeReview, prepareDevelop } from '../activities/delivery';
import { executeKnowledge } from '../activities/knowledgeMap';
import { executeStoryPoints } from '../tickets/pointEstimate';
import { releaseRun, reserveRun, settleRun } from './budget';
import { resolveForRun } from '../models/resolveForRun';
import { maybeWatchPulls } from '../tickets/prWatcher';
import { dispatchReadyTickets } from '../tickets/ticketDispatcher';
import { applyTransition, scanSchedule } from '../tickets/ticketActions';
import { LeaseLost, RunError, asRunError } from './errors';
import { append, flush } from './runLogs';
import { block, claim, claimById, consumeReservation, fail, heartbeat, markTokensReserved, reap, releaseHeldRuns, releaseLeases, succeed, type AgentRunRow, type RunRuntime } from './runQueue';

const BLOCKING = new Set(['BUDGET_EXCEEDED', 'MERGE_GUARD', 'REPO_ACCESS', 'KEY_INVALID', 'USAGE_LIMIT', 'MODEL_UNAVAILABLE', 'NO_CHANGES', 'CANCELLED']);

let timer: NodeJS.Timeout | null = null;
let stopped = false;
let ticking = false;
let housekeeping: Promise<void> | null = null;
const workerId = `mw-${process.pid}`;
const inflight: Record<RunRuntime, number> = {
  cursor_local: 0,
  cursor_cloud: 0,
  local_worktree: 0,
  chat: 0,
};

export async function processRunById(id: string): Promise<void> {
  const claimed = await claimById(id, workerId);
  if (!claimed) return;
  await executeClaimed(claimed);
}

async function executeClaimed(run: AgentRunRow): Promise<void> {
  const abort = new AbortController();
  const beat = setInterval(() => {
    void heartbeat(run.id, workerId).then((ok) => {
      if (!ok) abort.abort();
    }).catch(() => abort.abort());
  }, 30_000);
  beat.unref?.();
  let reserved = 0;
  let projectScoped = false;
  const giveBack = async () => {
    if (!reserved) return;
    const taken = await consumeReservation(run.id);
    reserved = 0;
    if (taken > 0) {
      await releaseHeldRuns([{
        id: run.id,
        workspace_id: run.workspace_id,
        project_id: run.project_id,
        agent_id: run.agent_id,
        activity: run.activity,
        taken,
        external_agent_id: run.external_agent_id,
        external_run_id: run.external_run_id,
      }]);
    }
  };
  try {
    if (abort.signal.aborted) return;
    run.model_id = await resolveForRun(run);
    await getPgPool().query(
      `UPDATE agent_runs SET model_id = $2, updated_at = NOW() WHERE id = $1::uuid AND status = 'running' AND lease_owner = $3`,
      [run.id, run.model_id, workerId],
    );
    if (run.activity === 'develop') await prepareDevelop(run);
    const project = await getPgPool().query<{ token_budget_monthly: string | null; agent_budget: string | null }>(
      `SELECT p.token_budget_monthly::text, s.token_budget_monthly::text AS agent_budget
         FROM projects p LEFT JOIN skills s ON s.id = $2::uuid WHERE p.id = $1::uuid`,
      [run.project_id, run.agent_id],
    );
    const row = project.rows[0];
    const projectBudget = row?.token_budget_monthly ? Number(row.token_budget_monthly) : null;
    projectScoped = projectBudget != null;
    const decision = await reserveRun({
      workspaceId: run.workspace_id,
      agentId: run.agent_id,
      activity: run.activity,
      projectBudget,
      agentBudget: row?.agent_budget ? Number(row.agent_budget) : null,
      projectId: run.project_id,
    });
    if (!decision.ok) {
      await block(run.id, workerId, decision.code || 'BUDGET_EXCEEDED', 'Monthly token budget would be exceeded');
      return;
    }
    reserved = decision.reserved;
    await markTokensReserved(run.id, reserved);
    const result = await dispatch(run, abort.signal);
    if (abort.signal.aborted) {
      await giveBack();
      return;
    }
    const alive = await heartbeat(run.id, workerId);
    if (!alive) {
      await giveBack();
      return;
    }
    const recorded = result.tokensTotal == null ? reserved : result.tokensTotal;
    const wrote = await succeed(run.id, workerId, {
      result_text: result.result_text ?? result.text,
      output_source: result.outputSource,
      pr_url: result.prUrl,
      pr_number: result.prNumber,
      branch: result.branch,
      head_sha: result.headSha,
      tokensTotal: recorded,
      external_agent_id: result.external_agent_id,
      external_run_id: result.external_run_id,
      result_json: result.result_json,
    });
    if (!wrote) {
      await giveBack();
      return;
    }
    await settleRun({
      workspaceId: run.workspace_id,
      activity: run.activity,
      reserved,
      actual: recorded,
      projectId: run.project_id,
      limit: projectBudget ?? validateEnv().ARIA_MONTHLY_TOKEN_BUDGET,
      agentId: run.agent_id,
      projectScoped,
    });
  } catch (err) {
    if (abort.signal.aborted || err instanceof LeaseLost) {
      await giveBack();
      return;
    }
    const runError = asRunError(err);
    await append(run.id, 'error', runError.message);
    const wrote = BLOCKING.has(runError.code) || !runError.retryable
      ? await block(run.id, workerId, runError.code, runError.message)
      : await fail(run.id, workerId, runError.code, runError.message, runError.retryable);
    if (wrote && reserved) await releaseRun(run.workspace_id, run.activity, reserved, run.agent_id, run.project_id, projectScoped);
    if (wrote && run.ticket_id && runError.code !== 'MERGE_GUARD') await failTicket(run, runError);
  } finally {
    clearInterval(beat);
    await flush(run.id);
  }
}

async function failTicket(run: AgentRunRow, runError: RunError): Promise<void> {
  try {
    const ticket = await getPgPool().query<{ status: string }>(`SELECT status FROM tickets WHERE id = $1::uuid`, [run.ticket_id]);
    const status = ticket.rows[0]?.status;
    if (run.activity === 'review' && status === 'ready_for_review') {
      await applyTransition(run.ticket_id!, 'review_changes', { reason: runError.message, runId: run.id });
      return;
    }
    if (run.activity === 'qa' && status === 'in_qa') {
      await applyTransition(run.ticket_id!, 'qa_failed', { reason: runError.message, runId: run.id, returnTo: 'qa' });
      return;
    }
    if ((run.activity === 'develop' || run.activity === 'fix') && status === 'in_progress') {
      await applyTransition(run.ticket_id!, 'dev_failed', { reason: runError.message, runId: run.id });
    }
  } catch {
    // The ticket may already have moved.
  }
}

interface DispatchResult {
  outputSource?: string;
  text?: string;
  prUrl?: string;
  prNumber?: number;
  branch?: string;
  headSha?: string;
  tokensTotal?: number;
  result_text?: string;
  result_json?: unknown;
  external_agent_id?: string;
  external_run_id?: string;
}

async function dispatch(run: AgentRunRow, signal: AbortSignal): Promise<DispatchResult> {
  switch (run.activity) {
    case 'company_generation': {
      const result = await executeCompany(run);
      return { outputSource: result.outputSource, text: result.text, result_text: result.text, tokensTotal: result.tokensTotal };
    }
    case 'knowledge_map': {
      const result = await executeKnowledge(run);
      return { outputSource: result.outputSource, text: result.text, result_text: result.text, tokensTotal: result.tokensTotal };
    }
    case 'story_points': {
      const result = await executeStoryPoints(run);
      return { outputSource: result.outputSource, text: result.text, result_text: result.text, tokensTotal: result.tokensTotal };
    }
    case 'develop': {
      const result = await executeDevelop(run, signal);
      return { ...result, result_text: result.text };
    }
    case 'review': {
      const result = await executeReview(run);
      return { outputSource: result.outputSource, text: result.text, result_text: result.text, tokensTotal: result.tokensTotal };
    }
    case 'qa': {
      const result = await executeQa(run, signal);
      return { ...result, result_text: result.text };
    }
    case 'fix': {
      const result = await executeFix(run, signal);
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
  void reap().catch((err: unknown) => {
    process.stderr.write(`reap failed: ${err instanceof Error ? err.message : 'error'}\n`);
  });
  timer = setInterval(() => { void tick().catch((err: unknown) => {
    process.stderr.write(`tick failed: ${err instanceof Error ? err.message : 'error'}\n`);
  }); }, 2000);
  timer.unref?.();
}

export function stopRunWorker(): void {
  stopped = true;
  if (timer) clearInterval(timer);
  timer = null;
  void releaseLeases(workerId);
}

export async function tick(): Promise<void> {
  if (stopped || ticking) return;
  ticking = true;
  try {
    await reap();
    const env = validateEnv();
    const limits: Record<RunRuntime, number> = {
      cursor_local: env.RUN_CONCURRENCY_CURSOR_LOCAL,
      cursor_cloud: env.RUN_CONCURRENCY_CURSOR_CLOUD,
      local_worktree: env.RUN_CONCURRENCY_LOCAL_WORKTREE,
      chat: env.RUN_CONCURRENCY_CHAT,
    };
    for (const runtime of RUNTIMES) {
      while (inflight[runtime] < limits[runtime]) {
        const run = await claim(workerId, [runtime]);
        if (!run) break;
        inflight[runtime] += 1;
        void executeClaimed(run).catch((err: unknown) => {
          process.stderr.write(`run ${run.id} failed outside the executor: ${err instanceof Error ? err.message : 'error'}\n`);
        }).finally(() => {
          inflight[runtime] -= 1;
        });
      }
    }
  } finally {
    ticking = false;
  }
  if (!housekeeping) {
    housekeeping = Promise.resolve().then(async () => {
      await dispatchReadyTickets();
      await scanSchedule();
      await maybeWatchPulls();
    }).catch((err: unknown) => {
      process.stderr.write(`housekeeping failed: ${err instanceof Error ? err.message : 'error'}\n`);
    }).finally(() => {
      housekeeping = null;
    });
  }
}
