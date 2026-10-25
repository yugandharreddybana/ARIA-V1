import { z } from 'zod';
import { validateEnv } from '../../config/env';
import { getPgPool } from '../db.client';
import { developPrompt, qaPrompt, reviewPrompt } from './prompts';
import { storeReport } from '../evidence/reports';
import { createIssueComment, createPull, createReview, getBranch, listCheckRuns, readGithubToken } from '../githubClient.service';
import { secretFindings, sensitivePaths } from '../github/diffGuards';
import { codeWorkerFor, type CodeRunSnapshot } from '../models/codeWorker';
import { reasoningFor } from '../models/reasoning';
import { RunError } from '../runs/errors';
import { append } from '../runs/runLogs';
import type { AgentRunRow } from '../runs/runQueue';
import { applyTransition } from '../tickets/ticketActions';
import { reportLinks } from '../evidence/reports';

interface TicketContext {
  id: string;
  ticket_key: string;
  title: string;
  description: string;
  story_points: number;
  project_id: string;
  workspace_id: string;
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
  const fullName = row?.repo_name || 'acme/demo-app';
  return { repoUrl: row?.repo_url || `https://github.com/${fullName}`, fullName };
}

function reportFrom(text: string, heading: string): string | null {
  const start = text.indexOf(heading);
  if (start < 0) return null;
  return text.slice(start).trim();
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
    if (err instanceof RunError) throw err;
  }
}

export async function executeDevelop(run: AgentRunRow): Promise<{ outputSource: 'ai'; text: string; prUrl?: string; prNumber?: number; branch?: string; headSha?: string; tokensTotal?: number }> {
  const ticket = await ticketOf(run);
  const repo = await repoOf(run.project_id);
  const prompt = `${developPrompt({
    ticketKey: ticket.ticket_key,
    title: ticket.title,
    description: ticket.description,
    storyPoints: Number(ticket.story_points),
    persona: 'You are the developer on this ticket.',
  })}\n[[stub:ok]]`;
  await append(run.id, 'status', 'develop started');
  const worker = codeWorkerFor();
  const ref = await worker.start({ run, repoUrl: repo.repoUrl, prompt, autoCreatePR: true, workOnCurrentBranch: false });
  const snap = await worker.follow(ref, null, (kind, text) => { void append(run.id, kind === 'assistant' ? 'assistant' : 'status', text); });
  const usage = await worker.usage(ref);
  return finishCode(run, ticket, repo.fullName, snap, usage?.total ?? null, 'dev');
}

async function finishCode(
  run: AgentRunRow,
  ticket: TicketContext,
  fullName: string,
  snap: CodeRunSnapshot,
  tokens: number | null,
  kind: 'dev' | 'qa',
): Promise<{ outputSource: 'ai'; text: string; prUrl?: string; prNumber?: number; branch?: string; headSha?: string; tokensTotal?: number }> {
  if (snap.status === 'error' || snap.status === 'expired' || snap.status === 'cancelled') {
    throw new RunError(snap.status === 'expired' ? 'RUN_EXPIRED' : 'RUN_ERROR', snap.resultText || snap.status, snap.status !== 'cancelled');
  }
  if (!snap.branch && !snap.prUrl && kind === 'dev') throw new RunError('NO_CHANGES', snap.resultText || 'no branch', false);
  let prUrl = snap.prUrl;
  let prNumber: number | undefined;
  if (snap.branch && !prUrl && kind === 'dev') {
    const token = await readGithubToken(ticket.workspace_id);
    const opened = await createPull(token, fullName, {
      title: `${ticket.ticket_key} ${ticket.title}`,
      head: snap.branch,
      base: 'main',
      body: reportLinks(ticket.id),
    });
    prUrl = opened.url;
    prNumber = opened.number;
  }
  const heading = kind === 'dev' ? '## Commands' : '## Previous behaviour';
  const markdown = reportFrom(snap.resultText || '', heading);
  if (markdown) {
    await storeReport({
      workspaceId: ticket.workspace_id,
      projectId: ticket.project_id,
      ticketId: ticket.id,
      ticketKey: ticket.ticket_key,
      kind,
      markdown,
      storyPoints: Number(ticket.story_points),
      agents: [run.agent_id || 'agent'],
      runId: run.id,
      commitSha: snap.headSha ?? null,
    });
  }
  if (kind === 'dev' && prUrl) await applyTransition(ticket.id, 'pr_opened', { actorKind: 'agent', agentId: run.agent_id, runId: run.id, prUrl });
  return { outputSource: 'ai', text: snap.resultText || '', prUrl, prNumber, branch: snap.branch, headSha: snap.headSha, tokensTotal: tokens ?? undefined };
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

export async function executeReview(run: AgentRunRow): Promise<{ outputSource: 'ai' | 'template'; text: string }> {
  const ticket = await ticketOf(run);
  const model = await reasoningFor(run.workspace_id);
  let verdict: z.infer<typeof reviewSchema>;
  try {
    const planned = await model.plan({
      run,
      schema: reviewSchema,
      instructions: reviewPrompt({ ticketKey: ticket.ticket_key, diff: String(run.input.diff ?? '') }),
      onLog: (kind, text) => { void append(run.id, kind === 'error' ? 'error' : 'status', text); },
    });
    verdict = planned.value as z.infer<typeof reviewSchema>;
  } catch (err) {
    if (!(err instanceof RunError) || err.code !== 'SCHEMA_INVALID') throw err;
    throw new RunError('SCHEMA_INVALID', 'review incomplete', false);
  }
  const secrets = secretFindings(String(run.input.diff ?? ''));
  const sensitive = sensitivePaths(Array.isArray(run.input.files) ? run.input.files as string[] : []);
  const comments = verdict.comments ?? [];
  const changes = verdict.verdict === 'changes' || secrets.length > 0 || comments.some((comment) => comment.severity === 'blocker');
  try {
    const token = await readGithubToken(ticket.workspace_id);
    const repo = await repoOf(run.project_id);
    const pr = Number(run.input.prNumber ?? 0);
    if (pr) {
      await createReview(token, repo.fullName, pr, { event: 'COMMENT', body: verdict.summary });
    }
  } catch {
    await append(run.id, 'status', 'review comment skipped');
  }
  if (sensitive.length) await append(run.id, 'status', `sensitive paths: ${sensitive.join(', ')}`);
  await applyTransition(ticket.id, changes ? 'review_changes' : 'review_passed', { agentId: run.agent_id, runId: run.id, reason: verdict.summary });
  return { outputSource: 'ai', text: verdict.summary };
}

export async function executeQa(run: AgentRunRow): Promise<{ outputSource: 'ai'; text: string; prUrl?: string; tokensTotal?: number }> {
  const ticket = await ticketOf(run);
  const repo = await repoOf(run.project_id);
  const prompt = `${qaPrompt({
    ticketKey: ticket.ticket_key,
    title: ticket.title,
    storyPoints: Number(ticket.story_points),
    persona: 'You are QA.',
    diffSummary: String(run.input.diff ?? 'diff unavailable'),
  })}\n[[stub:ok]]`;
  const worker = codeWorkerFor();
  const prUrl = typeof run.input.prUrl === 'string' ? run.input.prUrl : null;
  const ref = await worker.start({ run, repoUrl: repo.repoUrl, prompt, autoCreatePR: false, workOnCurrentBranch: true, prUrl });
  const snap = await worker.follow(ref, null, (kind, text) => { void append(run.id, kind === 'assistant' ? 'assistant' : 'status', text); });
  const usage = await worker.usage(ref);
  const finished = await finishCode(run, ticket, repo.fullName, { ...snap, prUrl: snap.prUrl || prUrl || undefined }, usage?.total ?? null, 'qa');
  if (snap.headSha) {
    try {
      const token = await readGithubToken(ticket.workspace_id);
      const checks = await listCheckRuns(token, repo.fullName, snap.headSha);
      if (checks.some((check) => check.conclusion === 'failure')) {
        await applyTransition(ticket.id, 'qa_failed', { reason: 'check run failed', runId: run.id, returnTo: 'qa' });
        return { outputSource: 'ai', text: finished.text, prUrl: finished.prUrl, tokensTotal: finished.tokensTotal };
      }
    } catch {
      await append(run.id, 'status', 'check runs unavailable');
    }
  }
  await applyTransition(ticket.id, 'qa_passed', { agentId: run.agent_id, runId: run.id, prUrl: finished.prUrl });
  if (finished.prUrl) {
    try {
      const token = await readGithubToken(ticket.workspace_id);
      await createIssueComment(token, repo.fullName, Number(finished.prUrl.split('/').pop()), reportLinks(ticket.id));
    } catch {
      await append(run.id, 'status', 'pr comment skipped');
    }
  }
  return { outputSource: 'ai', text: finished.text, prUrl: finished.prUrl, tokensTotal: finished.tokensTotal };
}

export async function executeFix(run: AgentRunRow): Promise<{ outputSource: 'ai'; text: string; tokensTotal?: number }> {
  const ticket = await ticketOf(run);
  const repo = await repoOf(run.project_id);
  const worker = codeWorkerFor();
  const prUrl = typeof run.input.prUrl === 'string' ? run.input.prUrl : null;
  const ref = await worker.start({
    run,
    repoUrl: repo.repoUrl,
    prompt: `Fix the findings for ${ticket.ticket_key}. [[stub:ok]]`,
    autoCreatePR: false,
    workOnCurrentBranch: true,
    prUrl,
  });
  const snap = await worker.follow(ref, null, (kind, text) => { void append(run.id, kind === 'assistant' ? 'assistant' : 'status', text); });
  const usage = await worker.usage(ref);
  const returnTo = run.input.returnTo === 'qa' ? 'qa' : 'review';
  await applyTransition(ticket.id, 'fix_done', { returnTo, agentId: run.agent_id, runId: run.id });
  return { outputSource: 'ai', text: snap.resultText || '', tokensTotal: usage?.total };
}
