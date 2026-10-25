import { z } from 'zod';
import { validateEnv } from '../../config/env';
import { loadWorkspaceLlm } from '../guardedLlm.service';
import { completeChat } from '../llmProvider.service';
import { parseWithRetry } from './structuredOutput';
import { runLocalAgent } from './localAgentProcess';
import { RunError } from '../runs/errors';
import type { AgentRunRow } from '../runs/runQueue';

export interface PlanRequest<T> {
  run: AgentRunRow;
  schema: z.ZodType<T>;
  instructions: string;
  onLog(kind: string, text: string): void;
}

export interface PlanResult<T> {
  value: T;
  rawText: string;
  retried: boolean;
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
      let text: string;
      try {
        const result = await runLocalAgent({
          prompt: req.instructions,
          stub,
          timeoutMs: 60_000,
          apiKey: llm?.apiKey || 'stub',
        });
        text = result.text;
      } catch (err) {
        throw err instanceof RunError ? err : new RunError('RUN_ERROR', 'local planner failed', true);
      }
      try {
        const parsed = await parseWithRetry(req.schema, text, async () => text);
        return parsed;
      } catch (err) {
        throw new RunError('SCHEMA_INVALID', err instanceof Error ? err.message : 'schema invalid', false);
      }
    },
  };
}

function chatReasoner(workspaceId: string): ReasoningModel {
  return {
    async plan(req) {
      const llm = await loadWorkspaceLlm(workspaceId);
      if (!llm) throw new RunError('KEY_INVALID', 'No model is configured', false);
      if (llm.provider === 'cursor') throw new RunError('RUN_ERROR', 'Cursor has no chat API', false);
      const ask = async (extra: string) => completeChat(llm, [
        { role: 'system', content: req.instructions },
        { role: 'user', content: extra },
      ]);
      try {
        const first = await ask('Reply with JSON only.');
        const parsed = await parseWithRetry(req.schema, first, (issues) => ask(`Fix the JSON. Issues: ${issues}`));
        return parsed;
      } catch (err) {
        throw new RunError('SCHEMA_INVALID', err instanceof Error ? err.message : 'schema invalid', false);
      }
    },
  };
}
