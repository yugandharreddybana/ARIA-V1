import { z } from 'zod';
import { validateEnv } from '../../config/env';
import { getPgPool } from '../db.client';
import { developPrompt, qaPrompt, reviewPrompt } from './prompts';
import { storeReport } from '../evidence/reports';
import {
  createIssueComment,
  createPull,
  createReview,
  getBranch,
  getFileAtRef,
  githubFullName,
  getPull,
  getPullDiff,
  getPullFiles,
  listCheckRuns,
  readGithubToken,
} from '../githubClient.service';
import { diffHunkLines, diffTouchesUi, secretFindings, sensitivePaths } from '../github/diffGuards';
import { codeWorkerFor, prNumberFromUrl, type CodeRunSnapshot } from '../models/codeWorker';
import { workspaceCursorKey } from '../models/cursorKey';
import { reasoningFor } from '../models/reasoning';
import { checkMidRun, estimateFor } from '../runs/budget';
import { RunError } from '../runs/errors';
import { append } from '../runs/runLogs';
import type { AgentRunRow } from '../runs/runQueue';
import { applyTransition } from '../tickets/ticketActions';
import { sha256 } from '../runs/budget';

interface TicketContext {
  id: string;
  ticket_key: string;
  title: string;
  description: string;
  story_points: number;
  project_id: string;
  workspace_id: string;
}

interface CodeResult {
  outputSource: 'ai';
  text: string;
  prUrl?: string;
  prNumber?: number;
  branch?: string;
  headSha?: string;
  tokensTotal?: number;
  external_agent_id?: string;
  external_run_id?: string;
}

async function ticketOf(run: AgentRunRow): Promise<TicketContext> {
  const result = await getPgPool().query<TicketContext>(
    `SELECT t.id, t.ticket_key, t.title, t.description, t.story_points, t.project_id, p.workspace_id
       FROM tickets t JOIN projects p ON p.id = t.project_id WHERE t.id = $1::uuid`,
    [run.ticket_id],
  );
  if (!result.rows[0]) throw new RunError('RUN_ERROR', 'Ticket missing', false);
  return result.rows[0];
}

async function repoOf(projectId: string): Promise<{ repoUrl: string; fullName: string }> {
  const result = await getPgPool().query<{ repo_url: string; repo_name: string }>(
    `SELECT repo_url, repo_name FROM project_repos WHERE project_id = $1::uuid ORDER BY created_at LIMIT 1`,
    [projectId],
  );
  const row = result.rows[0];
  if (!row?.repo_name || !row.repo_url) throw new RunError('REPO_ACCESS', 'Project has no repository', false);
  return { repoUrl: row.repo_url, fullName: githubFullName(row.repo_name, row.repo_url) };
}

function fixture(run: AgentRunRow): string {
  if (process.env.NODE_ENV === 'production') return '';
  return typeof run.input.fixture === 'string' ? `\n${run.input.fixture}` : '';
}

function knownPrUrl(run: AgentRunRow): string | null {
  if (typeof run.input.prUrl === 'string' && run.input.prUrl) return run.input.prUrl;
  return run.pr_url;
}

async function recordedPrUrl(run: AgentRunRow): Promise<string | null> {
  const direct = knownPrUrl(run);
  if (direct || !run.ticket_id) return direct;
  const prior = await getPgPool().query<{ pr_url: string | null }>(
    `SELECT pr_url FROM agent_runs
      WHERE ticket_id = $1::uuid AND pr_url IS NOT NULL
      ORDER BY created_at DESC LIMIT 1`,
    [run.ticket_id],
  );
  return prior.rows[0]?.pr_url ?? null;
}

function positiveEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function evidenceFile(token: string, fullName: string, ticketKey: string, kind: 'dev' | 'qa', sha: string): Promise<string | null> {
  const text = await getFileAtRef(token, fullName, `evidence/${ticketKey}/${kind}-report.md`, sha);
  if (!text) return null;
  return text.slice(0, 200_000);
}

export async function prepareDevelop(run: AgentRunRow): Promise<void> {
  const env = validateEnv();
  const project = await getPgPool().query<{ merge_guard_ack_at: Date | null; workspace_id: string }>(
    `SELECT merge_guard_ack_at, workspace_id FROM projects WHERE id = $1::uuid`,
    [run.project_id],
  );
  const row = project.rows[0];
  if (!row) throw new RunError('RUN_ERROR', 'Project missing', false);
  if (row.merge_guard_ack_at) return;
  try {
    const token = await readGithubToken(row.workspace_id);
    const repo = await repoOf(run.project_id);
    const branch = await getBranch(token, repo.fullName);
    if (!branch.protected && env.ARIA_MERGE_GUARD_MODE === 'block') {
      throw new RunError('MERGE_GUARD', `Default branch ${branch.name} is unprotected`, false);
    }
    if (!branch.protected) await append(run.id, 'status', `warning: ${branch.name} is unprotected`);
  } catch (err) {
    if (err instanceof RunError && (err.code === 'MERGE_GUARD' || err.code === 'REPO_ACCESS')) throw err;
    const message = err instanceof Error ? err.message : 'merge guard could not read the default branch';
    throw new RunError('MERGE_GUARD', message, false);
  }
}

export async function executeDevelop(run: AgentRunRow, signal?: AbortSignal): Promise<CodeResult> {
  const ticket = await ticketOf(run);
  const repo = await repoOf(run.project_id);
  const prompt = developPrompt({
    ticketKey: ticket.ticket_key,
    title: ticket.title,
    description: ticket.description,
    storyPoints: Number(ticket.story_points),
    persona: 'You are the developer on this ticket.',
  }) + fixture(run);
  await append(run.id, 'status', 'develop started');
  return finishCloud(run, ticket, repo, prompt, { autoCreatePR: true, workOnCurrentBranch: false, prUrl: null, kind: 'dev', signal });
}

async function finishCloud(
  run: AgentRunRow,
  ticket: TicketContext,
  repo: { repoUrl: string; fullName: string },
  prompt: string,
  options: { autoCreatePR: boolean; workOnCurrentBranch: boolean; prUrl: string | null; kind: 'dev' | 'qa' | 'fix'; signal?: AbortSignal },
): Promise<CodeResult> {
  const apiKey = await workspaceCursorKey(ticket.workspace_id);
  const worker = codeWorkerFor();
  const cap = (await estimateFor(run.activity, run.workspace_id)).cap;
  const ref = await worker.start({
    run,
    apiKey,
    repoUrl: repo.repoUrl,
    startingRef: run.base_ref,
    prompt,
    autoCreatePR: options.autoCreatePR,
    workOnCurrentBranch: options.workOnCurrentBranch,
    prUrl: options.prUrl,
  });
  await getPgPool().query(
    `UPDATE agent_runs
        SET external_agent_id = $2, external_run_id = $3, external_url = $4, updated_at = NOW()
      WHERE id = $1::uuid AND status = 'running'`,
    [run.id, ref.agentId, ref.runId, ref.url ?? null],
  );
  const snap = await worker.follow(ref, run.stream_cursor, (kind, text, cursor) => {
    void append(run.id, kind === 'assistant' ? 'assistant' : kind === 'error' ? 'error' : 'status', text);
    if (cursor) {
      void getPgPool().query(`UPDATE agent_runs SET stream_cursor = $2, updated_at = NOW() WHERE id = $1::uuid`, [run.id, cursor]);
    }
  }, { apiKey, repoUrl: repo.repoUrl, capTokens: cap, signal: options.signal, prompt });
  const usage = await worker.usage(ref, apiKey);
  if (usage?.unavailable) await checkMidRun(snap.estimatedTokens ?? 0, cap);
  else if (usage?.total != null && usage.total > cap) {
    throw new RunError('BUDGET_EXCEEDED', 'Per-run token cap exceeded', false);
  }
  const finished = await finishCode(run, ticket, repo.fullName, snap, usage?.total ?? null, options.kind);
  return { ...finished, external_agent_id: ref.agentId, external_run_id: ref.runId };
}

async function headFor(token: string, fullName: string, prNumber: number | undefined, snap: CodeRunSnapshot): Promise<string | undefined> {
  if (!prNumber) return snap.headSha;
  const pulled = await getPull(token, fullName, prNumber);
  return pulled.pull?.headSha || snap.headSha;
}

async function finishCode(
  run: AgentRunRow,
  ticket: TicketContext,
  fullName: string,
  snap: CodeRunSnapshot,
  tokens: number | null,
  kind: 'dev' | 'qa' | 'fix',
): Promise<CodeResult> {
  if (snap.status === 'error' || snap.status === 'expired' || snap.status === 'cancelled') {
    throw new RunError(snap.status === 'expired' ? 'RUN_EXPIRED' : snap.status === 'cancelled' ? 'CANCELLED' : 'RUN_ERROR', snap.resultText || snap.status, snap.status === 'error');
  }
  if (!snap.branch && !snap.prUrl && kind === 'dev') throw new RunError('NO_CHANGES', snap.resultText || 'no branch', false);
  let prUrl = snap.prUrl || (kind === 'dev' ? null : knownPrUrl(run));
  let prNumber = prNumberFromUrl(prUrl);
  const token = await readGithubToken(ticket.workspace_id);
  if (snap.branch && !prUrl && kind === 'dev') {
    const branch = await getBranch(token, fullName);
    const opened = await createPull(token, fullName, {
      title: `${ticket.ticket_key} ${ticket.title}`,
      head: snap.branch,
      base: branch.name,
      body: `${ticket.ticket_key} ${ticket.title}`,
    });
    prUrl = opened.url;
    prNumber = opened.number;
  }
  if (!prUrl && kind !== 'dev') {
    const prior = await getPgPool().query<{ pr_url: string | null }>(
      `SELECT pr_url FROM agent_runs
        WHERE ticket_id = $1::uuid AND pr_url IS NOT NULL
        ORDER BY created_at DESC LIMIT 1`,
      [ticket.id],
    );
    prUrl = prior.rows[0]?.pr_url ?? null;
    prNumber = prNumberFromUrl(prUrl);
  }
  const headSha = await headFor(token, fullName, prNumber, snap);
  if (headSha) {
    const files = prNumber ? await getPullFiles(token, fullName, prNumber) : [];
    const kinds = kind === 'qa' ? (['dev', 'qa'] as const) : (['dev'] as const);
    for (const reportKind of kinds) {
      const markdown = await evidenceFile(token, fullName, ticket.ticket_key, reportKind, headSha);
      if (!markdown) continue;
      await storeReport({
        workspaceId: ticket.workspace_id,
        projectId: ticket.project_id,
        ticketId: ticket.id,
        ticketKey: ticket.ticket_key,
        kind: reportKind,
        markdown,
        storyPoints: Number(ticket.story_points),
        agents: [run.agent_id || 'agent'],
        runId: run.id,
        commitSha: headSha,
        uiFromDiff: diffTouchesUi(files),
      });
    }
  }
  if (kind === 'dev' && prUrl) await applyTransition(ticket.id, 'pr_opened', { actorKind: 'agent', agentId: run.agent_id, runId: run.id, prUrl });
  return {
    outputSource: 'ai',
    text: snap.resultText || '',
    prUrl: prUrl ?? undefined,
    prNumber,
    branch: snap.branch,
    headSha,
    tokensTotal: tokens ?? undefined,
  };
}

const reviewSchema = z.object({
  verdict: z.enum(['pass', 'changes']),
  summary: z.string(),
  comments: z.array(z.object({
    path: z.string(),
    line: z.number().optional(),
    severity: z.enum(['blocker', 'major', 'minor', 'nit']),
    body: z.string(),
  })).default([]),
});

async function pullContext(run: AgentRunRow, ticket: TicketContext): Promise<{ diff: string; files: string[]; prNumber: number; fullName: string }> {
  const repo = await repoOf(run.project_id);
  const token = await readGithubToken(ticket.workspace_id);
  const fromRun = await getPgPool().query<{ pr_number: number | null; pr_url: string | null }>(
    `SELECT pr_number, pr_url FROM agent_runs
      WHERE ticket_id = $1::uuid AND (pr_number IS NOT NULL OR pr_url IS NOT NULL)
      ORDER BY created_at DESC LIMIT 1`,
    [ticket.id],
  );
  const recorded = fromRun.rows[0];
  const prNumber = recorded?.pr_number || prNumberFromUrl(recorded?.pr_url) || prNumberFromUrl(typeof run.input.prUrl === 'string' ? run.input.prUrl : null);
  if (!prNumber) throw new RunError('RUN_ERROR', 'Review has no pull request number', false);
  const diff = await getPullDiff(token, repo.fullName, prNumber);
  const files = await getPullFiles(token, repo.fullName, prNumber);
  return { diff, files, prNumber, fullName: repo.fullName };
}

export async function executeReview(run: AgentRunRow): Promise<{ outputSource: 'ai' | 'template'; text: string; tokensTotal?: number }> {
  const ticket = await ticketOf(run);
  const pulled = await pullContext(run, ticket);
  const model = await reasoningFor(run.workspace_id);
  let verdict: z.infer<typeof reviewSchema>;
  let tokensTotal: number | undefined;
  try {
    const planned = await model.plan({
      run,
      schema: reviewSchema,
      instructions: reviewPrompt({ ticketKey: ticket.ticket_key, diff: `${pulled.diff}${fixture(run)}` }),
      onLog: (kind, text) => { void append(run.id, kind === 'error' ? 'error' : 'status', text); },
    });
    verdict = planned.value as z.infer<typeof reviewSchema>;
    tokensTotal = planned.tokensTotal;
  } catch (err) {
    if (!(err instanceof RunError) || err.code !== 'SCHEMA_INVALID') throw err;
    throw new RunError('SCHEMA_INVALID', 'review incomplete', false);
  }
  const secrets = secretFindings(pulled.diff);
  const sensitive = sensitivePaths(pulled.files);
  const comments = verdict.comments ?? [];
  const changes = verdict.verdict === 'changes' || secrets.length > 0 || comments.some((comment) => comment.severity === 'blocker');
  const token = await readGithubToken(ticket.workspace_id);
  const hunks = diffHunkLines(pulled.diff);
  const lineComments: Array<{ path: string; line?: number; body: string }> = [];
  const bodyNotes: string[] = [];
  for (const comment of comments) {
    const text = `${comment.severity}: ${comment.body}`;
    const allowed = comment.line && comment.line > 0 && hunks.get(comment.path)?.has(comment.line);
    if (allowed) lineComments.push({ path: comment.path, line: comment.line, body: text });
    else bodyNotes.push(`${comment.path}${comment.line ? `:${comment.line}` : ''} ${text}`);
  }
  const body = [verdict.summary, ...bodyNotes].join('\n').slice(0, 6000);
  await createReview(token, pulled.fullName, pulled.prNumber, {
    event: 'COMMENT',
    body,
    comments: lineComments,
  });
  if (sensitive.length) await append(run.id, 'status', `sensitive paths: ${sensitive.join(', ')}`);
  await applyTransition(ticket.id, changes ? 'review_changes' : 'review_passed', {
    agentId: run.agent_id,
    runId: run.id,
    reason: verdict.summary,
    findings: comments.map((comment) => `${comment.path}: ${comment.body}`).join('\n') || verdict.summary,
  });
  return { outputSource: 'ai', text: verdict.summary, tokensTotal };
}

const BLOCKING_CHECK = new Set(['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure', 'stale']);

export async function executeQa(run: AgentRunRow, signal?: AbortSignal): Promise<CodeResult> {
  const ticket = await ticketOf(run);
  const repo = await repoOf(run.project_id);
  const prior = await pullContext(run, ticket).catch(() => null);
  const prompt = qaPrompt({
    ticketKey: ticket.ticket_key,
    title: ticket.title,
    description: ticket.description,
    storyPoints: Number(ticket.story_points),
    persona: 'You are QA.',
    diffSummary: prior?.diff || 'diff unavailable',
  }) + fixture(run);
  const prUrl = await recordedPrUrl(run);
  const finished = await finishCloud(run, ticket, repo, prompt, {
    autoCreatePR: false,
    workOnCurrentBranch: true,
    prUrl,
    kind: 'qa',
    signal,
  });
  const head = finished.headSha;
  if (!head) throw new RunError('RUN_ERROR', 'QA could not read the pull request head', false);
  const timeoutMs = positiveEnv('ARIA_QA_CHECK_TIMEOUT_MS', 30 * 60 * 1000);
  const pollMs = positiveEnv('ARIA_QA_CHECK_POLL_MS', 15_000);
  const started = Date.now();
  let checks: Array<{ name: string; status: string; conclusion: string | null }>;
  try {
    const token = await readGithubToken(ticket.workspace_id);
    checks = await listCheckRuns(token, repo.fullName, head);
    while (checks.some((check) => check.status !== 'completed')) {
      if (Date.now() - started >= timeoutMs) {
        await applyTransition(ticket.id, 'qa_failed', { reason: 'checks still pending after 30 minutes', runId: run.id, returnTo: 'qa' });
        return finished;
      }
      if (signal?.aborted) throw new RunError('CANCELLED', 'QA cancelled while waiting for checks', false);
      await new Promise((resolve) => setTimeout(resolve, pollMs));
      checks = await listCheckRuns(token, repo.fullName, head);
    }
  } catch (err) {
    if (err instanceof RunError) throw err;
    throw new RunError('RUN_ERROR', err instanceof Error ? err.message : 'check runs unavailable', true);
  }
  const blocked = checks.find((check) => check.conclusion != null && BLOCKING_CHECK.has(check.conclusion));
  if (blocked) {
    await applyTransition(ticket.id, 'qa_failed', { reason: `${blocked.name} is ${blocked.status}/${blocked.conclusion ?? 'pending'}`, runId: run.id, returnTo: 'qa' });
    return finished;
  }
  await applyTransition(ticket.id, 'qa_passed', { agentId: run.agent_id, runId: run.id, prUrl: finished.prUrl, commitSha: head });
  if (finished.prUrl && finished.prNumber) {
    const token = await readGithubToken(ticket.workspace_id);
    const reports = await getPgPool().query<{ kind: string; content_hash: string; markdown: string }>(
      `SELECT DISTINCT ON (kind) kind, content_hash, markdown FROM ticket_reports WHERE ticket_id = $1::uuid ORDER BY kind, created_at DESC`,
      [ticket.id],
    );
    const body = reports.rows.map((row) => `${row.kind} evidence sha256 ${row.content_hash}\n${row.markdown.slice(0, 1200)}`).join('\n\n')
      || `Evidence for ${ticket.ticket_key} is stored with the pull request head ${head}.`;
    await createIssueComment(token, repo.fullName, finished.prNumber, body.slice(0, 6000));
  }
  return finished;
}

export async function executeFix(run: AgentRunRow, signal?: AbortSignal): Promise<{ outputSource: 'ai'; text: string; tokensTotal?: number; external_agent_id?: string; external_run_id?: string }> {
  const ticket = await ticketOf(run);
  const repo = await repoOf(run.project_id);
  const prUrl = await recordedPrUrl(run);
  const findings = typeof run.input.findings === 'string' ? run.input.findings : 'No findings were attached.';
  const finished = await finishCloud(run, ticket, repo, [
    `Fix the findings for ${ticket.ticket_key}.`,
    findings.slice(0, 20_000),
    fixture(run),
    ].join('\n'), { autoCreatePR: false, workOnCurrentBranch: true, prUrl, kind: 'fix', signal });
  const returnTo = run.input.returnTo === 'qa' ? 'qa' : 'review';
  await applyTransition(ticket.id, 'fix_done', { returnTo, agentId: run.agent_id, runId: run.id, prUrl });
  return finished;
}

export function evidenceHash(markdown: string): string {
  return sha256(markdown);
}
