interface StartMessage {
  type: 'start';
  prompt: string;
  stub: boolean;
  modelId?: string;
  tools?: 'read_only' | 'none';
  cwd?: string;
}

function reply(message: { type?: string; text?: string; error?: string; envKeys?: string[]; usage?: { total?: number } }): void {
  const code = message.type === 'error' ? 1 : 0;
  if (typeof process.send !== 'function') process.exit(code);
  process.send(message, () => {
    process.exit(code);
  });
}

const COMPANY_OK = JSON.stringify({
  agents: [
    { roleKey: 'ceo', realName: 'Maya Chen', roleTitle: 'Chief Executive Officer', department: 'Leadership', managerIndex: null, backupIndex: 1, description: 'Leads the company.', instructions: 'Set priorities. Do not merge.', skills: ['strategy'], flows: [] },
    { roleKey: 'cto', realName: 'Luis Ortega', roleTitle: 'Chief Technology Officer', department: 'Engineering', managerIndex: 0, backupIndex: 0, description: 'Owns architecture.', instructions: 'Keep the system small.', skills: ['architecture'], flows: [] },
    { roleKey: 'product_owner', realName: 'Amelia Brooks', roleTitle: 'Product Owner', department: 'Product', managerIndex: 0, backupIndex: 0, description: 'Owns the backlog.', instructions: 'Write acceptance criteria.', skills: ['backlog'], flows: [] },
  ],
});

function stubText(prompt: string): string {
  if (prompt.includes('[[stub:env]]')) return JSON.stringify({ envKeys: Object.keys(process.env).sort() });
  if (prompt.includes('[[stub:points-bad]]')) return 'not json';
  if (prompt.includes('Estimate story points')) return '{"storyPoints":5}';
  if (prompt.includes('[[stub:company-ok]]')) return COMPANY_OK;
  if (prompt.includes('[[stub:company-cycle]]')) {
    return JSON.stringify({ agents: [{ roleKey: 'ceo', realName: 'A', roleTitle: 'CEO', department: 'Leadership', managerIndex: 1, backupIndex: null, description: 'x', instructions: 'y', skills: [], flows: [] }, { roleKey: 'cto', realName: 'B', roleTitle: 'CTO', department: 'Engineering', managerIndex: 0, backupIndex: null, description: 'x', instructions: 'y', skills: [], flows: [] }] });
  }
  if (prompt.includes('[[stub:knowledge]]')) {
    return JSON.stringify({
      summary: 'Rewritten map without the signup word.',
      techStack: [{ name: 'TypeScript', evidence: 'package.json' }],
      modules: [
        { name: 'web', path: 'apps/web/package.json', fileCount: 2 },
        { name: 'invented', path: 'no/such/file.ts', fileCount: 1 },
      ],
      flows: [
        { flowKey: 'signup', name: 'Signup', kind: 'ui', layer: 'frontend', description: 'Account creation.', entryPoints: ['apps/web/src/app/signup/page.tsx', 'missing/page.tsx'] },
        { flowKey: 'billing', name: 'Billing', kind: 'api', layer: 'backend', description: 'Invoices.', entryPoints: ['apps/web/package.json'] },
      ],
      apis: [],
      dataModel: [],
    });
  }
  if (prompt.includes('[[stub:review-changes]]') || prompt.includes('[[stub:review-always]]')) {
    return '{"verdict":"changes","summary":"Need a fix.","comments":[{"path":"apps/middleware/src/services/tickets/ticketPipeline.ts","line":1,"severity":"blocker","body":"fix this"}]}';
  }
  if (prompt.includes('"verdict"') || prompt.includes('verdict:')) {
    return '{"verdict":"pass","summary":"No blockers.","comments":[]}';
  }
  return `stub planning\n${prompt.slice(0, 180)}`;
}

async function handle(message: StartMessage): Promise<void> {
  if (!message || message.type !== 'start') return;
  const envKeys = Object.keys(process.env).sort();
  try {
    if (message.stub) {
      reply({ type: 'result', text: stubText(message.prompt), envKeys });
      return;
    }
    const jsSpecifier = './cursorSdkPlanner.js';
    const tsSpecifier = './cursorSdkPlanner.ts';
    let loaded: { planWithCursorSdk: typeof import('./cursorSdkPlanner').planWithCursorSdk };
    try {
      loaded = await import(jsSpecifier) as typeof loaded;
    } catch {
      loaded = await import(tsSpecifier) as typeof loaded;
    }
    const planned = await loaded.planWithCursorSdk({
      prompt: message.prompt,
      apiKey: process.env.CURSOR_API_KEY || '',
      modelId: message.modelId || 'auto',
      tools: message.tools === 'none' ? 'none' : 'read_only',
      cwd: message.cwd || process.cwd(),
    });
    const total = planned.usage?.totalTokens
      ?? ((planned.usage?.inputTokens ?? 0) + (planned.usage?.outputTokens ?? 0) + (planned.usage?.cacheReadTokens ?? 0) + (planned.usage?.cacheWriteTokens ?? 0));
    reply({ type: 'result', text: planned.text, envKeys, usage: planned.usage ? { total } : undefined });
  } catch (err) {
    reply({ type: 'error', error: err instanceof Error ? err.message : 'child error', envKeys });
  }
}

process.on('message', (message: StartMessage) => {
  void handle(message);
});
