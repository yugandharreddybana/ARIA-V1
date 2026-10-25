import { validateEnv } from '../../config/env';
import { cursorWireSelection } from '../modelTiers';
import { RunError } from '../runs/errors';
import type { AgentRunRow } from '../runs/runQueue';

export interface CodeTask {
  run: AgentRunRow;
  apiKey: string;
  repoUrl: string;
  startingRef?: string | null;
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

export interface GitBranch {
  repoUrl: string;
  branch?: string;
  prUrl?: string;
}

export interface CodeRunSnapshot {
  status: 'running' | 'finished' | 'error' | 'cancelled' | 'expired';
  resultText?: string;
  branch?: string;
  prUrl?: string;
  headSha?: string;
  branches: GitBranch[];
}

export interface TokenUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  total?: number;
}

export interface CloudAuth {
  apiKey: string;
  repoUrl: string;
}

export interface CodeWorker {
  start(task: CodeTask): Promise<ExternalRef>;
  follow(
    ref: ExternalRef,
    cursor: string | null,
    onEvent: (kind: string, text: string, cursor: string | null) => void,
    auth: CloudAuth & { capTokens?: number; signal?: AbortSignal },
  ): Promise<CodeRunSnapshot>;
  usage(ref: ExternalRef, apiKey: string): Promise<TokenUsage | null>;
  cancel(ref: ExternalRef, apiKey: string): Promise<void>;
}

const CALL_TIMEOUT_MS = 20_000;

interface CursorErrorBody {
  error?: { code?: string; message?: string };
  code?: string;
  message?: string;
}

function base(): string {
  return (process.env.CURSOR_API_BASE || validateEnv().CURSOR_API_BASE).replace(/\/$/, '');
}

function headers(apiKey: string, extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'User-Agent': 'aria-v1',
    ...extra,
  };
}

async function readBody(res: Response): Promise<{ code: string; message: string; json: unknown }> {
  const text = await res.text();
  try {
    const json = JSON.parse(text) as CursorErrorBody;
    return {
      code: json.error?.code || json.code || '',
      message: json.error?.message || json.message || text.slice(0, 300),
      json,
    };
  } catch {
    return { code: '', message: text.slice(0, 300), json: null };
  }
}

function mapFailure(status: number, code: string, message: string): RunError {
  if (code === 'usage_limit_exceeded') return new RunError('USAGE_LIMIT', message || 'usage limit', false);
  if (code === 'rate_limit_exceeded' || status === 429) return new RunError('RATE_LIMITED', message || 'rate limited', true);
  if (
    code === 'repository_access'
    || code === 'integration_not_connected'
    || code === 'repository_required'
    || code === 'pr_resolution_failed'
    || code === 'stored_repos_unreadable'
  ) {
    return new RunError('REPO_ACCESS', message || code, false);
  }
  if (status === 401 || code === 'unauthorized' || code === 'api_key_not_found' || code === 'key_not_supported') {
    return new RunError('KEY_INVALID', message || 'Cursor rejected the key', false);
  }
  if (status === 403) return new RunError('KEY_INVALID', message || 'Cursor rejected the key', false);
  if (status >= 500) return new RunError('NETWORK', message || `Cursor HTTP ${status}`, true);
  return new RunError('RUN_ERROR', message || `Cursor HTTP ${status}`, false);
}

function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\.git$/, '').replace(/\/$/, '');
}

function mapStatus(raw: string | undefined): CodeRunSnapshot['status'] {
  switch ((raw || '').toUpperCase()) {
    case 'FINISHED': return 'finished';
    case 'ERROR': return 'error';
    case 'CANCELLED': return 'cancelled';
    case 'EXPIRED': return 'expired';
    case 'CREATING':
    case 'RUNNING':
    case 'WAITING_FOR_BACKGROUND_WORK':
      return 'running';
    default:
      return 'running';
  }
}

function pickBranch(branches: GitBranch[], repoUrl: string): GitBranch | undefined {
  const wanted = stripScheme(repoUrl);
  return branches.find((branch) => stripScheme(branch.repoUrl) === wanted)
    ?? branches.find((branch) => branch.prUrl)
    ?? branches[0];
}

function snapshotFromRun(body: {
  status?: string;
  result?: string;
  git?: { branches?: GitBranch[] };
}, repoUrl: string): CodeRunSnapshot {
  const branches = Array.isArray(body.git?.branches) ? body.git.branches : [];
  const chosen = pickBranch(branches, repoUrl);
  return {
    status: mapStatus(body.status),
    resultText: body.result,
    branch: chosen?.branch,
    prUrl: chosen?.prUrl,
    branches,
  };
}

function usageFrom(body: {
  totalUsage?: { inputTokens?: number; outputTokens?: number; cacheWriteTokens?: number; cacheReadTokens?: number; totalTokens?: number };
}): TokenUsage | null {
  const total = body.totalUsage;
  if (!total) return null;
  return {
    input: total.inputTokens,
    output: total.outputTokens,
    cacheWrite: total.cacheWriteTokens,
    cacheRead: total.cacheReadTokens,
    total: total.totalTokens,
  };
}

interface SseEvent {
  id: string | null;
  event: string;
  data: string;
}

function parseSse(block: string): SseEvent | null {
  let id: string | null = null;
  let event = 'message';
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (!line || line.startsWith(':')) continue;
    const split = line.indexOf(':');
    const field = split === -1 ? line : line.slice(0, split);
    const value = split === -1 ? '' : line.slice(split + 1).replace(/^ /, '');
    if (field === 'id') id = value;
    else if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  }
  if (!data.length && event === 'message') return null;
  return { id, event, data: data.join('\n') };
}

export function cursorCloudWorker(): CodeWorker {
  return {
    async start(task) {
      if (!task.apiKey) throw new RunError('KEY_INVALID', 'Workspace has no Cursor key', false);
      const apiKey = task.apiKey;
      const agentId = `bc-${task.run.id}`;
      const repo: { url: string; startingRef?: string; prUrl?: string } = { url: task.repoUrl };
      if (task.prUrl) repo.prUrl = task.prUrl;
      else if (task.startingRef) repo.startingRef = task.startingRef;
      const res = await fetch(`${base()}/v1/agents`, {
        method: 'POST',
        headers: headers(apiKey),
        body: JSON.stringify({
          prompt: { text: task.prompt },
          model: task.run.model_id ? cursorWireSelection(task.run.model_id) : undefined,
          agentId,
          repos: [repo],
          workOnCurrentBranch: task.workOnCurrentBranch,
          autoCreatePR: task.autoCreatePR,
          mode: 'agent',
        }),
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      });
      const parsed = await readBody(res);
      if (res.status === 409 && parsed.code === 'agent_id_conflict') {
        const existing = await fetch(`${base()}/v1/agents/${agentId}`, {
          headers: headers(apiKey),
          signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
        });
        const adopted = await readBody(existing);
        if (!existing.ok) throw mapFailure(existing.status, adopted.code, adopted.message);
        const agent = adopted.json as { latestRunId?: string; url?: string; id?: string };
        if (!agent.latestRunId) throw new RunError('RUN_ERROR', 'agent already exists without a run', true);
        return { agentId: agent.id || agentId, runId: agent.latestRunId, url: agent.url };
      }
      if (!res.ok) throw mapFailure(res.status, parsed.code, parsed.message);
      const body = parsed.json as { agent?: { id?: string; url?: string }; run?: { id?: string } };
      if (!body.agent?.id || !body.run?.id) throw new RunError('RUN_ERROR', 'Cursor did not return an agent and a run', true);
      return { agentId: body.agent.id, runId: body.run.id, url: body.agent.url };
    },
    async follow(ref, cursor, onEvent, auth) {
      const apiKey = auth.apiKey;
      const repoUrl = auth.repoUrl;
      const stream = await fetch(`${base()}/v1/agents/${ref.agentId}/runs/${ref.runId}/stream`, {
        headers: headers(apiKey, {
          Accept: 'text/event-stream',
          ...(cursor ? { 'Last-Event-ID': cursor } : {}),
        }),
        signal: auth.signal,
      });
      if (stream.status === 410) return pollRun(apiKey, ref, repoUrl);
      if (!stream.ok) {
        const parsed = await readBody(stream);
        throw mapFailure(stream.status, parsed.code, parsed.message);
      }
      if (!stream.body) throw new RunError('NETWORK', 'Cursor stream had no body', true);
      const reader = stream.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let result: CodeRunSnapshot = { status: 'running', branches: [] };
      let assistants = 0;
      const apply = async (sse: SseEvent) => {
        let payload: { text?: string; status?: string; git?: { branches?: GitBranch[] }; message?: string } = {};
        if (sse.data) {
          try {
            payload = JSON.parse(sse.data) as typeof payload;
          } catch {
            onEvent('status', sse.data.slice(0, 300), sse.id);
            return;
          }
        }
        if (sse.event === 'assistant' && payload.text) onEvent('assistant', payload.text, sse.id);
        if (sse.event === 'thinking' && payload.text) onEvent('status', payload.text, sse.id);
        if (sse.event === 'tool_call') onEvent('tool', sse.data.slice(0, 500), sse.id);
        if (sse.event === 'error') onEvent('error', payload.message || payload.text || sse.data, sse.id);
        if (sse.event === 'status' || sse.event === 'result' || sse.event === 'done') {
          const branches = Array.isArray(payload.git?.branches) ? payload.git.branches : result.branches;
          const chosen = pickBranch(branches, repoUrl);
          const status = sse.event === 'done' ? result.status : mapStatus(payload.status);
          result = {
            status: status === 'running' && sse.event === 'done' ? 'finished' : status,
            resultText: payload.text || result.resultText,
            branch: chosen?.branch || result.branch,
            prUrl: chosen?.prUrl || result.prUrl,
            branches,
          };
          if (payload.status) onEvent('status', payload.status, sse.id);
        }
        if (sse.event === 'assistant') {
          assistants += 1;
          if (auth.capTokens && assistants % 5 === 0) await enforceCap(apiKey, ref, auth.capTokens);
        }
      };
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() ?? '';
        for (const block of blocks) {
          const sse = parseSse(block);
          if (sse) await apply(sse);
        }
      }
      if (buffer.trim()) {
        const sse = parseSse(buffer);
        if (sse) await apply(sse);
      }
      if (result.status === 'running') {
        const polled = await pollRun(apiKey, ref, repoUrl);
        result = { ...polled, resultText: polled.resultText || result.resultText, branches: polled.branches.length ? polled.branches : result.branches };
      }
      return result;
    },
    async usage(ref, apiKey) {
      const res = await fetch(`${base()}/v1/agents/${ref.agentId}/usage?runId=${encodeURIComponent(ref.runId)}`, {
        headers: headers(apiKey),
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      });
      if (res.status === 403 || res.status === 404) return null;
      if (!res.ok) {
        const parsed = await readBody(res);
        throw mapFailure(res.status, parsed.code, parsed.message);
      }
      const parsed = await readBody(res);
      return usageFrom(parsed.json as { totalUsage?: TokenUsage & { inputTokens?: number; outputTokens?: number; cacheWriteTokens?: number; cacheReadTokens?: number; totalTokens?: number } });
    },
    async cancel(ref, apiKey) {
      const res = await fetch(`${base()}/v1/agents/${ref.agentId}/runs/${ref.runId}/cancel`, {
        method: 'POST',
        headers: headers(apiKey),
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      });
      if (res.status === 409 || res.status === 404) return;
      if (!res.ok) {
        const parsed = await readBody(res);
        throw mapFailure(res.status, parsed.code, parsed.message);
      }
    },
  };
}

async function pollRun(apiKey: string, ref: ExternalRef, repoUrl: string): Promise<CodeRunSnapshot> {
  const polled = await fetch(`${base()}/v1/agents/${ref.agentId}/runs/${ref.runId}`, {
    headers: headers(apiKey),
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });
  const parsed = await readBody(polled);
  if (!polled.ok) throw mapFailure(polled.status, parsed.code, parsed.message);
  return snapshotFromRun(parsed.json as { status?: string; result?: string; git?: { branches?: GitBranch[] } }, repoUrl);
}

async function enforceCap(apiKey: string, ref: ExternalRef, cap: number): Promise<void> {
  const res = await fetch(`${base()}/v1/agents/${ref.agentId}/usage?runId=${encodeURIComponent(ref.runId)}`, {
    headers: headers(apiKey),
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });
  if (!res.ok) return;
  const parsed = await readBody(res);
  const usage = usageFrom(parsed.json as { totalUsage?: { totalTokens?: number; inputTokens?: number; outputTokens?: number; cacheWriteTokens?: number; cacheReadTokens?: number } });
  if (usage?.total != null && usage.total > cap) {
    await fetch(`${base()}/v1/agents/${ref.agentId}/runs/${ref.runId}/cancel`, {
      method: 'POST',
      headers: headers(apiKey),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    throw new RunError('BUDGET_EXCEEDED', 'Per-run token cap exceeded', false);
  }
}

export function codeWorkerFor(): CodeWorker {
  return cursorCloudWorker();
}

export function prNumberFromUrl(url: string | null | undefined): number | undefined {
  const match = url?.match(/\/pull\/(\d+)(?:$|[?#])/);
  return match ? Number(match[1]) : undefined;
}
