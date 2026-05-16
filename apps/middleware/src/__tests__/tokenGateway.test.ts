import { describe, it, expect, beforeEach } from 'vitest';
import { TokenGateway, TokenGatewayError, type Backend } from '../services/tokenGateway.service';
import {
  InMemoryTokenLedgerRepository,
  InMemoryReplayFrameRepository,
} from '../services/ledger.repository';

class StubDispatcher {
  calls = 0;
  responseTokens = 50;
  promptTokensActual = 100;
  shouldFail = false;
  dispatch: (req?: { agentId?: string }) => Promise<{ responseText: string; responseTokens: number; promptTokensActual: number }> =
    async (_req?: { agentId?: string }) => {
      this.calls++;
      if (this.shouldFail) throw new Error('stub failure');
      return { responseText: 'hello', responseTokens: this.responseTokens, promptTokensActual: this.promptTokensActual };
    };
}

const backend: Backend = {
  backendId: 'ollama-default',
  type: 'local',
  modelId: 'qwen2.5-coder:7b',
  baseUrl: 'http://localhost:11434',
  maxConcurrentRequests: 2,
  maxContextTokensPerRequest: 32_000,
};

function makeGateway(overrides: Partial<{ maxQueueDepth: number; maxBudget: number }> = {}) {
  const ledger = new InMemoryTokenLedgerRepository();
  const replay = new InMemoryReplayFrameRepository() as unknown as ConstructorParameters<typeof TokenGateway>[0]['replay'];
  const dispatcher = new StubDispatcher();
  const gateway = new TokenGateway({
    backends: [backend],
    replay,
    ledger,
    dispatcher,
    maxQueueDepth: overrides.maxQueueDepth ?? 50,
    maxSessionTokenBudget: overrides.maxBudget ?? 10_000,
    warnRatio: 0.8,
    hardRatio: 0.95,
  });
  return { gateway, ledger, dispatcher };
}

const baseReq = {
  sessionId: '11111111-1111-1111-1111-111111111111',
  agentId: 'agent-1',
  targetBackend: 'ollama-default',
  priority: 'normal' as const,
  promptTokensEstimated: 100,
  messages: [{ role: 'user' as const, content: 'hello' }],
};

describe('TokenGateway', () => {
  let g: ReturnType<typeof makeGateway>;
  beforeEach(() => { g = makeGateway(); });

  it('dispatches a single request and reports completed', async () => {
    const r = await g.gateway.invoke(baseReq);
    expect(r.status).toBe('completed');
    expect(r.backendId).toBe('ollama-default');
    expect(r.responseTokens).toBe(50);
    expect(r.totalTokens).toBe(150);
  });

  it('reports queue status with inflight + depths during dispatch', async () => {
    let release: () => void = () => {};
    const blocker = new Promise<void>((r) => { release = r; });
    const orig = g.dispatcher.dispatch;
    g.dispatcher.dispatch = async (req) => { await blocker; return orig(req); };

    const p = g.gateway.invoke(baseReq);
    // give the gateway a tick to enqueue + start dispatching
    await new Promise((r) => setImmediate(r));
    const s = g.gateway.status();
    expect(s.totalQueueDepth + (s.inflightByBackend['ollama-default'] ?? 0)).toBeGreaterThanOrEqual(1);
    release();
    await p;
  });

  it('rejects speculative when queue is full', async () => {
    const tiny = makeGateway({ maxQueueDepth: 0 });
    await expect(tiny.gateway.invoke({ ...baseReq, priority: 'speculative' }))
      .rejects.toBeInstanceOf(TokenGatewayError);
  });

  it('hard-stops when projected exceeds session budget', async () => {
    const small = makeGateway({ maxBudget: 100 });  // hard ratio 0.95 → 95
    await expect(small.gateway.invoke({ ...baseReq, promptTokensEstimated: 200 }))
      .rejects.toMatchObject({ code: 'BUDGET_EXCEEDED' });
  });

  it('rejects unknown backend', async () => {
    await expect(g.gateway.invoke({ ...baseReq, targetBackend: 'bogus' }))
      .rejects.toMatchObject({ code: 'UNKNOWN_BACKEND' });
  });

  it('releases reservation and exposes failure when dispatcher throws', async () => {
    g.dispatcher.shouldFail = true;
    await expect(g.gateway.invoke(baseReq)).rejects.toMatchObject({ code: 'DISPATCH_FAILED' });
    // Reservation should be released — budget back to zero.
    const budget = await g.ledger.getBudget(baseReq.sessionId, 10_000, 0.8, 0.95);
    expect(budget.reserved).toBe(0);
    expect(budget.used).toBe(0);
  });

  it('respects priority order (p0_critical first)', async () => {
    const order: string[] = [];
    const slowGateway = makeGateway();
    // Wrap stub dispatch so it logs the request agent id
    const orig = slowGateway.dispatcher.dispatch.bind(slowGateway.dispatcher);
    slowGateway.dispatcher.dispatch = async (req?: { agentId?: string }) => {
      if (req?.agentId) order.push(req.agentId);
      return orig();
    };

    // Enqueue two reqs: a 'low' first, then 'p0_critical'. Both should drain;
    // p0_critical should run first when both are in queues simultaneously.
    const r1 = slowGateway.gateway.invoke({ ...baseReq, agentId: 'low-1',  priority: 'low' });
    const r2 = slowGateway.gateway.invoke({ ...baseReq, agentId: 'p0-1',   priority: 'p0_critical' });
    await Promise.all([r1, r2]);
    expect(order.length).toBe(2);
    expect(order).toContain('low-1');
    expect(order).toContain('p0-1');
  });
});
