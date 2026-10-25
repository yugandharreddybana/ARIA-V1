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

interface SdkRunResult {
  status: string;
  result?: string;
  usage?: SdkUsage;
  error?: { message?: string };
}

interface SdkAgent {
  send(message: string, options?: { mode?: 'plan' | 'agent' }): Promise<{ wait(): Promise<SdkRunResult> }>;
  close(): void;
}

interface SdkModule {
  Agent: {
    create(options: {
      apiKey: string;
      model: { id: string };
      mode: 'plan';
      tools: string[];
      local: { cwd: string; settingSources: []; dirs: string[] };
      sandboxOptions: { enabled: boolean };
    }): Promise<SdkAgent>;
  };
}

/** Live local planning. CI keeps ARIA_CURSOR_LOCAL_MODE=stub, so this import stays off that path. */
export async function planWithCursorSdk(input: CursorPlanInput): Promise<{ text: string; usage?: SdkUsage }> {
  const sdk = await import('@cursor/sdk') as unknown as SdkModule;
  const agent = await sdk.Agent.create({
    apiKey: input.apiKey,
    model: { id: input.modelId || 'auto' },
    mode: 'plan',
    tools: input.tools === 'none' ? [] : ['read', 'grep', 'glob', 'ls'],
    local: { cwd: input.cwd, settingSources: [], dirs: [input.cwd] },
    sandboxOptions: { enabled: true },
  });
  try {
    const run = await agent.send(input.prompt, { mode: 'plan' });
    const result = await run.wait();
    if (result.status === 'error') throw new Error(result.error?.message || 'local planner failed');
    return { text: result.result ?? '', usage: result.usage };
  } finally {
    agent.close();
  }
}
