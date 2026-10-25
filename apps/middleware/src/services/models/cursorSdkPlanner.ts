import type { AgentOptions } from '@cursor/sdk';

export interface CursorPlanInput {
  prompt: string;
  apiKey: string;
  modelId: string;
  tools: 'read_only' | 'none';
  cwd: string;
}

interface SdkUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  totalTokens?: number;
}

/** Live local planning. CI keeps ARIA_CURSOR_LOCAL_MODE=stub, so this import stays off that path. */
export async function planWithCursorSdk(input: CursorPlanInput): Promise<{ text: string; usage?: SdkUsage }> {
  const sdk = await import('@cursor/sdk');
  const options: AgentOptions = {
    apiKey: input.apiKey,
    model: { id: input.modelId || 'auto' },
    mode: 'plan',
    tools: input.tools === 'none' ? [] : ['read', 'grep', 'glob', 'ls'],
    local: {
      cwd: input.cwd,
      settingSources: [],
      dirs: [input.cwd],
      sandboxOptions: { enabled: true },
    },
  };
  const agent = await sdk.Agent.create(options);
  try {
    const run = await agent.send(input.prompt, { mode: 'plan' });
    const result = await run.wait();
    if (result.status === 'error') throw new Error(result.error?.message || 'local planner failed');
    return { text: result.result ?? '', usage: result.usage };
  } finally {
    agent.close();
  }
}
