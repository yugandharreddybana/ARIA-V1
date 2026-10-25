import { z } from 'zod';
import { validateEnv } from '../../config/env';
import { loadWorkspaceLlm } from '../guardedLlm.service';
import { completeChat } from '../llmProvider.service';
import { Sanitizer } from '../sanitizer.service';
import { parseWithRetry } from './structuredOutput';
import { runLocalAgent } from './localAgentProcess';
import { RunError } from '../runs/errors';
import { getPgPool } from '../db.client';
import type { AgentRunRow } from '../runs/runQueue';

export interface PlanRequest<T> {
  run: AgentRunRow;
  schema: z.ZodType<T>;
  instructions: string;
  tools?: 'read_only' | 'none';
  onLog(kind: string, text: string): void;
}

export interface PlanResult<T> {
  value: T;
  rawText: string;
  retried: boolean;
  tokensTotal?: number;
}

export interface ReasoningModel {
  plan<T>(req: PlanRequest<T>): Promise<PlanResult<T>>;
}

export async function reasoningFor(workspaceId: string): Promise<ReasoningModel> {
  const llm = await loadWorkspaceLlm(workspaceId);
  if (!llm || llm.provider === 'cursor') return cursorLocalReasoner(workspaceId);
  return chatReasoner(workspaceId);
}

function cursorLocalReasoner(workspaceId: string): ReasoningModel {
  return {
    async plan(req) {
      const env = validateEnv();
      const llm = await loadWorkspaceLlm(workspaceId);
      const stub = env.ARIA_CURSOR_LOCAL_MODE === 'stub';
      req.onLog('status', stub ? 'stub local planner' : 'local planner');
      if (!llm?.apiKey && !stub) throw new RunError('KEY_INVALID', 'Workspace has no Cursor key', false);
      const apiKey = llm?.apiKey || 'stub';
      const repoUrl = await plannerRepoUrl(req.run.project_id, stub);
      const ask = async (extra: string) => runLocalAgent({
        prompt: extra ? `${req.instructions}\n${extra}` : req.instructions,
        stub,
        timeoutMs: 20 * 60 * 1000,
        apiKey,
        modelId: req.run.model_id || 'auto',
        tools: req.tools ?? (req.run.activity === 'company_generation' || req.run.activity === 'story_points' ? 'none' : 'read_only'),
        repoUrl,
      });
      try {
        const first = await ask('');
        const parsed = await parseWithRetry(req.schema, first.text, async (issues) => (await ask(`Fix the JSON. Issues: ${issues}`)).text);
        const tokens = first.usage?.total;
        return { ...parsed, tokensTotal: tokens };
      } catch (err) {
        if (err instanceof RunError && err.code !== 'SCHEMA_INVALID') throw err;
        throw new RunError('SCHEMA_INVALID', err instanceof Error ? err.message : 'schema invalid', false);
      }
    },
  };
}

async function plannerRepoUrl(projectId: string, stub: boolean): Promise<string | null> {
  if (stub) return null;
  const row = await getPgPool().query<{ repo_url: string }>(
    `SELECT repo_url FROM project_repos WHERE project_id = $1::uuid ORDER BY created_at LIMIT 1`,
    [projectId],
  );
  return row.rows[0]?.repo_url ?? null;
}

function chatReasoner(workspaceId: string): ReasoningModel {
  return {
    async plan(req) {
      const llm = await loadWorkspaceLlm(workspaceId);
      if (!llm) throw new RunError('KEY_INVALID', 'No model is configured', false);
      if (llm.provider === 'cursor') throw new RunError('RUN_ERROR', 'Cursor has no chat API', false);
      const sanitizer = new Sanitizer();
      const ask = async (extra: string) => {
        const cleaned = await sanitizer.sanitize(extra);
        const user = cleaned.trustLabel === 'rejected' ? 'Reply with JSON only.' : cleaned.cleaned;
        return completeChat(llm, [
          { role: 'system', content: req.instructions },
          { role: 'user', content: user },
        ]);
      };
      try {
        const first = await ask('Reply with JSON only.');
        const parsed = await parseWithRetry(req.schema, first, (issues) => ask(`Fix the JSON. Issues: ${issues}`));
        return { ...parsed, tokensTotal: Math.ceil((first.length + req.instructions.length) / 4) };
      } catch (err) {
        throw new RunError('SCHEMA_INVALID', err instanceof Error ? err.message : 'schema invalid', false);
      }
    },
  };
}
