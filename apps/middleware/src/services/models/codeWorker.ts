import { validateEnv } from '../../config/env';
import { RunError } from '../runs/errors';
import type { AgentRunRow } from '../runs/runQueue';

export interface CodeTask {
  run: AgentRunRow;
  repoUrl: string;
  prompt: string;
  autoCreatePR: boolean;
  workOnCurrentBranch: boolean;
  prUrl?: string | null;
}

export interface ExternalRef {
  agentId: string;
  runId: string;
  url?: string;
}

export interface CodeRunSnapshot {
  status: 'running' | 'finished' | 'error' | 'cancelled' | 'expired';
  resultText?: string;
  branch?: string;
  prUrl?: string;
  headSha?: string;
}

export interface TokenUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  total?: number;
}

export interface CodeWorker {
  start(task: CodeTask): Promise<ExternalRef>;
  follow(ref: ExternalRef, cursor: string | null, onEvent: (kind: string, text: string) => void): Promise<CodeRunSnapshot>;
  usage(ref: ExternalRef): Promise<TokenUsage | null>;
  cancel(ref: ExternalRef): Promise<void>;
}

function base(): string {
  return (process.env.CURSOR_API_BASE || validateEnv().CURSOR_API_BASE).replace(/\/$/, '');
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.CURSOR_API_KEY || 'stub'}`,
    'Content-Type': 'application/json',
    'User-Agent': 'aria-v1',
  };
}

async function readError(res: Response): Promise<string> {
  const text = await res.text();
  return text.slice(0, 300);
}

export function cursorCloudWorker(): CodeWorker {
  return {
    async start(task) {
      const agentId = `bc-${task.run.id}`;
      const res = await fetch(`${base()}/v1/agents`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          agentId,
          prompt: { text: task.prompt },
          repoUrl: task.repoUrl,
          autoCreatePR: task.autoCreatePR,
          workOnCurrentBranch: task.workOnCurrentBranch,
          prUrl: task.prUrl ?? undefined,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (res.status === 401 || res.status === 403) throw new RunError('KEY_INVALID', 'Cursor rejected the key', false);
      if (res.status === 409) {
        const existing = await fetch(`${base()}/v1/agents/${agentId}`, { headers: authHeaders() });
        const body = await existing.json() as { latestRunId?: string; url?: string };
        if (!body.latestRunId) throw new RunError('RUN_ERROR', 'agent already exists without a run', true);
        return { agentId, runId: body.latestRunId, url: body.url };
      }
      if (res.status === 422 || res.status === 400) {
        const text = await readError(res);
        if (/IntegrationNotConnected|repo/i.test(text)) throw new RunError('REPO_ACCESS', text, false);
        throw new RunError('RUN_ERROR', text, false);
      }
      if (!res.ok) throw new RunError(res.status >= 500 ? 'NETWORK' : 'RUN_ERROR', `Cursor HTTP ${res.status}`, res.status >= 500);
      const body = await res.json() as { runId?: string; id?: string; url?: string };
      const runId = body.runId || body.id;
      if (!runId) throw new RunError('RUN_ERROR', 'Cursor did not return a run id', true);
      return { agentId, runId, url: body.url };
    },
    async follow(ref, cursor, onEvent) {
      const stream = await fetch(`${base()}/v1/agents/${ref.agentId}/runs/${ref.runId}/stream`, {
        headers: { ...authHeaders(), ...(cursor ? { 'Last-Event-ID': cursor } : {}) },
        signal: AbortSignal.timeout(20_000),
      });
      if (stream.status === 410) {
        const polled = await fetch(`${base()}/v1/agents/${ref.agentId}/runs/${ref.runId}`, { headers: authHeaders() });
        const body = await polled.json() as CodeRunSnapshot;
        return body;
      }
      if (!stream.ok) throw new RunError('NETWORK', `stream HTTP ${stream.status}`, true);
      const raw = await stream.text();
      let result: CodeRunSnapshot = { status: 'running' };
      for (const block of raw.split('\n\n')) {
        const data = block.split('\n').find((line) => line.startsWith('data:'));
        if (!data) continue;
        const event = JSON.parse(data.slice(5).trim()) as { type?: string; text?: string; status?: string; branch?: string; prUrl?: string; resultText?: string; headSha?: string };
        if (event.type === 'assistant' && event.text) onEvent('assistant', event.text);
        if (event.type === 'status') {
          onEvent('status', event.status || '');
          result = {
            status: (event.status || 'running').toLowerCase() as CodeRunSnapshot['status'],
            resultText: event.resultText,
            branch: event.branch,
            prUrl: event.prUrl,
            headSha: event.headSha,
          };
        }
      }
      return result;
    },
    async usage(ref) {
      const res = await fetch(`${base()}/v1/agents/${ref.agentId}/runs/${ref.runId}/usage`, { headers: authHeaders() });
      if (!res.ok) return null;
      const body = await res.json() as TokenUsage;
      return body;
    },
    async cancel(ref) {
      const res = await fetch(`${base()}/v1/agents/${ref.agentId}/runs/${ref.runId}/cancel`, { method: 'POST', headers: authHeaders() });
      if (res.status === 409) return;
      if (!res.ok && res.status !== 404) throw new RunError('RUN_ERROR', `cancel HTTP ${res.status}`, false);
    },
  };
}

export function codeWorkerFor(): CodeWorker {
  return cursorCloudWorker();
}
