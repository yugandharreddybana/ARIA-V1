/**
 * ARIA Token Gateway (V27.9 §18H)
 * ─────────────────────────────────────────────────────────────────────
 * Single egress for every LLM call in the system. Direct provider calls
 * are forbidden — all callers must `enqueue()` requests here.
 *
 * Responsibilities:
 *   1. Capacity Registry — track each backend (local Ollama, remote Anthropic)
 *      with its rate limits, max concurrency, and rolling-window state.
 *   2. Priority Queue — five buckets (p0_critical → speculative). Backpressure
 *      at MAX_QUEUE_DEPTH rejects speculative + low first.
 *   3. Budget Enforcement — every session has a token budget; warn at
 *      TOKEN_BUDGET_WARN_RATIO (default 0.80), hard-stop at TOKEN_BUDGET_HARD_RATIO
 *      (default 0.95). Reservations debit from a session ledger.
 *   4. ReplayFrame Capture — every dispatch writes a ReplayFrame BEFORE the
 *      API call (V27.9 §18F deterministic-replay contract).
 *   5. Event Emission — emits `token.warn` / `token.hard_stop` / `queue.depth`
 *      events for the WebSocket layer.
 *
 * This service is intentionally storage-agnostic for unit testing — the
 * persistence and dispatch ports are injected.
 */

import { EventEmitter } from 'node:events';
import { randomUUID, createHash } from 'node:crypto';

// ── Types ──────────────────────────────────────────────────────────────

export type Priority = 'p0_critical' | 'high' | 'normal' | 'low' | 'speculative';

const PRIORITY_ORDER: Priority[] = ['p0_critical', 'high', 'normal', 'low', 'speculative'];

export interface LocalBackend {
  backendId: string;
  type: 'local';
  modelId: string;
  baseUrl: string;
  maxConcurrentRequests: number;
  maxContextTokensPerRequest: number;
}

export interface RemoteBackend {
  backendId: string;
  type: 'remote';
  modelId: string;
  tier: 'team' | 'enterprise';
  requestsPerMinuteLimit: number;
  tokensPerMinuteLimit: number;
  tokensPerDayLimit: number;
}

export type Backend = LocalBackend | RemoteBackend;

export interface GatewayRequest {
  /** Set by the gateway; callers don't need to populate. */
  requestId?: string;
  sessionId: string;
  agentId: string;
  skillSlug?: string;
  /** Target backend id; if 'auto', the gateway picks based on classification. */
  targetBackend: string | 'auto';
  /** P0 = security/Defcon-1; speculative = pre-cog. */
  priority: Priority;
  promptTokensEstimated: number;
  contextWindowTokens?: number;
  systemMessage?: string;
  injectedContextRefs?: Record<string, unknown>;
  /** OpenAI-style chat messages or Ollama prompt. Provider-specific. */
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  /** Optional sampler params; defaults applied by backend driver. */
  modelParameters?: Record<string, unknown>;
  /** When set, gateway will reject if reserved + this > session budget. */
  timeoutMs?: number;
}

export interface GatewayResponse {
  requestId: string;
  backendId: string;
  modelId: string;
  responseText: string;
  responseTokens: number;
  totalTokens: number;
  status: 'completed' | 'failed' | 'rejected';
  error?: string;
  /** Hash of the prompt for ReplayFrame join. */
  promptHash: string;
  responseHash: string;
}

export interface ReplayFrame {
  id: string;
  sessionId: string;
  agentId: string | null;
  skillSlug: string | null;
  requestId: string;
  priority: Priority;
  modelBackend: string;
  modelId: string;
  modelParameters: Record<string, unknown>;
  promptHash: string;
  promptFull: string;
  contextWindowTokens: number;
  systemMessage: string | null;
  injectedContextRefs: Record<string, unknown> | null;
  promptTokensEstimated: number;
  promptTokensActual: number | null;
  responseHash: string | null;
  responseFull: string | null;
  responseTokens: number | null;
  totalTokens: number | null;
  outcomeObjectRef: string | null;
  status: 'queued' | 'dispatched' | 'completed' | 'failed' | 'rejected';
  error: string | null;
  retainedIndefinitely: boolean;
  createdAt: Date;
  dispatchedAt: Date | null;
  completedAt: Date | null;
}

export interface SessionBudget {
  sessionId: string;
  maxTokens: number;
  used: number;
  reserved: number;
  warnRatio: number;
  hardRatio: number;
  status: 'ok' | 'warn' | 'hard_stop';
}

export interface QueueStatus {
  queueDepthByPriority: Record<Priority, number>;
  totalQueueDepth: number;
  inflightByBackend: Record<string, number>;
  acceptingRequests: boolean;
  rejectedCount: number;
}

// ── Ports (dependency-inverted for unit testing) ───────────────────────

export interface ReplayFrameRepository {
  insertQueued(frame: Omit<ReplayFrame, 'id' | 'dispatchedAt' | 'completedAt' | 'promptTokensActual'
    | 'responseHash' | 'responseFull' | 'responseTokens' | 'totalTokens' | 'outcomeObjectRef'
    | 'error'>): Promise<string>;
  markDispatched(id: string): Promise<void>;
  markCompleted(id: string, fields: {
    responseHash: string;
    responseFull: string;
    responseTokens: number;
    totalTokens: number;
    promptTokensActual: number;
  }): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  markRejected(id: string, error: string): Promise<void>;
}

export interface TokenLedgerRepository {
  reserve(sessionId: string, backendId: string, tokens: number): Promise<void>;
  consume(sessionId: string, backendId: string, actualTokens: number, releasedReserved: number): Promise<void>;
  releaseReservation(sessionId: string, backendId: string, tokens: number): Promise<void>;
  getBudget(sessionId: string, maxTokens: number, warnRatio: number, hardRatio: number): Promise<SessionBudget>;
}

export interface BackendDispatcher {
  dispatch(req: GatewayRequest, backend: Backend): Promise<{ responseText: string; responseTokens: number; promptTokensActual: number }>;
}

// ── Errors ─────────────────────────────────────────────────────────────

export class TokenGatewayError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'TokenGatewayError';
  }
}

// ── Gateway ────────────────────────────────────────────────────────────

export interface TokenGatewayDeps {
  backends: Backend[];
  replay: ReplayFrameRepository;
  ledger: TokenLedgerRepository;
  dispatcher: BackendDispatcher;
  maxQueueDepth: number;
  maxSessionTokenBudget: number;
  warnRatio: number;
  hardRatio: number;
  /** Optional: override for tests. */
  now?: () => Date;
}

export class TokenGateway {
  readonly events = new EventEmitter();

  private readonly backendMap: Map<string, Backend> = new Map();
  private readonly inflight: Map<string, number> = new Map();
  private readonly queues: Record<Priority, Array<{
    req: GatewayRequest;
    resolve: (r: GatewayResponse) => void;
    reject: (e: Error) => void;
    backend: Backend;
    frameId: string;
  }>> = {
    p0_critical: [],
    high: [],
    normal: [],
    low: [],
    speculative: [],
  };
  private rejectedCount = 0;

  constructor(private readonly deps: TokenGatewayDeps) {
    for (const b of deps.backends) {
      this.backendMap.set(b.backendId, b);
      this.inflight.set(b.backendId, 0);
    }
  }

  /** Total enqueued requests across all priority buckets. */
  queueDepth(): number {
    return PRIORITY_ORDER.reduce((acc, p) => acc + this.queues[p].length, 0);
  }

  status(): QueueStatus {
    const depths: Record<Priority, number> = {
      p0_critical: this.queues.p0_critical.length,
      high: this.queues.high.length,
      normal: this.queues.normal.length,
      low: this.queues.low.length,
      speculative: this.queues.speculative.length,
    };
    const inflight: Record<string, number> = {};
    this.inflight.forEach((v, k) => { inflight[k] = v; });
    return {
      queueDepthByPriority: depths,
      totalQueueDepth: this.queueDepth(),
      inflightByBackend: inflight,
      acceptingRequests: this.queueDepth() < this.deps.maxQueueDepth,
      rejectedCount: this.rejectedCount,
    };
  }

  /**
   * Submit a request. Resolves with the model response or rejects with a
   * TokenGatewayError. Writes a ReplayFrame BEFORE dispatch (never silent).
   */
  async invoke(req: GatewayRequest): Promise<GatewayResponse> {
    const requestId = req.requestId ?? randomUUID();
    const reqWithId: GatewayRequest = { ...req, requestId };

    // 1) Resolve backend.
    const backend = this.resolveBackend(reqWithId);
    if (!backend) {
      this.rejectedCount++;
      throw new TokenGatewayError(`Unknown backend: ${req.targetBackend}`, 'UNKNOWN_BACKEND');
    }

    // 2) Backpressure: reject speculative + low when queue is full.
    if (this.queueDepth() >= this.deps.maxQueueDepth) {
      if (reqWithId.priority === 'speculative' || reqWithId.priority === 'low') {
        this.rejectedCount++;
        throw new TokenGatewayError('Gateway queue full; speculative/low rejected', 'GATEWAY_QUEUE_FULL');
      }
    }

    // 3) Budget pre-flight check.
    const budget = await this.deps.ledger.getBudget(
      reqWithId.sessionId,
      this.deps.maxSessionTokenBudget,
      this.deps.warnRatio,
      this.deps.hardRatio,
    );
    const projected = budget.used + budget.reserved + reqWithId.promptTokensEstimated;
    const hardLimit = Math.floor(budget.maxTokens * budget.hardRatio);
    if (projected > hardLimit) {
      this.rejectedCount++;
      this.events.emit('token.hard_stop', { sessionId: reqWithId.sessionId, projected, hardLimit });
      throw new TokenGatewayError(
        `Session budget exceeded: projected=${projected} > hard=${hardLimit}`,
        'BUDGET_EXCEEDED',
      );
    }
    const warnLimit = Math.floor(budget.maxTokens * budget.warnRatio);
    if (projected > warnLimit) {
      this.events.emit('token.warn', { sessionId: reqWithId.sessionId, projected, warnLimit });
    }

    // 4) Reserve tokens up front.
    await this.deps.ledger.reserve(reqWithId.sessionId, backend.backendId, reqWithId.promptTokensEstimated);

    // 5) Write a queued ReplayFrame BEFORE doing anything else.
    const promptFull = JSON.stringify(reqWithId.messages);
    const promptHash = sha256(promptFull);
    const frameId = await this.deps.replay.insertQueued({
      sessionId: reqWithId.sessionId,
      agentId: reqWithId.agentId,
      skillSlug: reqWithId.skillSlug ?? null,
      requestId,
      priority: reqWithId.priority,
      modelBackend: backend.backendId,
      modelId: backend.modelId,
      modelParameters: reqWithId.modelParameters ?? {},
      promptHash,
      promptFull,
      contextWindowTokens: reqWithId.contextWindowTokens ?? 0,
      systemMessage: reqWithId.systemMessage ?? null,
      injectedContextRefs: reqWithId.injectedContextRefs ?? null,
      promptTokensEstimated: reqWithId.promptTokensEstimated,
      status: 'queued',
      retainedIndefinitely: reqWithId.priority === 'p0_critical',
      createdAt: this.now(),
    });

    // 6) Enqueue + drain. Resolution is awaited via the promise.
    return new Promise<GatewayResponse>((resolve, reject) => {
      this.queues[reqWithId.priority].push({ req: reqWithId, resolve, reject, backend, frameId });
      this.events.emit('queue.depth', this.status());
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    for (const priority of PRIORITY_ORDER) {
      const q = this.queues[priority];
      while (q.length > 0) {
        const head = q[0];
        if (!this.canDispatch(head.backend)) return;
        q.shift();
        void this.execute(head.req, head.backend, head.resolve, head.reject, head.frameId);
      }
    }
  }

  private canDispatch(backend: Backend): boolean {
    if (backend.type !== 'local') return true; // Remote concurrency handled by dispatcher / rate-limit logic.
    const current = this.inflight.get(backend.backendId) ?? 0;
    return current < backend.maxConcurrentRequests;
  }

  private async execute(
    req: GatewayRequest,
    backend: Backend,
    resolve: (r: GatewayResponse) => void,
    reject: (e: Error) => void,
    frameId: string,
  ): Promise<void> {
    this.inflight.set(backend.backendId, (this.inflight.get(backend.backendId) ?? 0) + 1);
    try {
      await this.deps.replay.markDispatched(frameId);
      const result = await this.deps.dispatcher.dispatch(req, backend);
      const responseHash = sha256(result.responseText);
      const totalTokens = result.promptTokensActual + result.responseTokens;
      await this.deps.replay.markCompleted(frameId, {
        responseHash,
        responseFull: result.responseText,
        responseTokens: result.responseTokens,
        totalTokens,
        promptTokensActual: result.promptTokensActual,
      });
      const released = req.promptTokensEstimated;
      await this.deps.ledger.consume(req.sessionId, backend.backendId, totalTokens, released);
      const promptHash = sha256(JSON.stringify(req.messages));
      resolve({
        requestId: req.requestId!,
        backendId: backend.backendId,
        modelId: backend.modelId,
        responseText: result.responseText,
        responseTokens: result.responseTokens,
        totalTokens,
        status: 'completed',
        promptHash,
        responseHash,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.deps.replay.markFailed(frameId, message).catch(() => undefined);
      await this.deps.ledger.releaseReservation(req.sessionId, backend.backendId, req.promptTokensEstimated)
        .catch(() => undefined);
      reject(new TokenGatewayError(`Dispatch failed: ${message}`, 'DISPATCH_FAILED'));
    } finally {
      const after = (this.inflight.get(backend.backendId) ?? 1) - 1;
      this.inflight.set(backend.backendId, Math.max(0, after));
      void this.drain();
    }
  }

  private resolveBackend(req: GatewayRequest): Backend | undefined {
    if (req.targetBackend !== 'auto') return this.backendMap.get(req.targetBackend);
    // Auto-routing rule: p0_critical → first remote backend if available, else first local;
    // everything else → first local backend (cheapest), else remote.
    const remotes = [...this.backendMap.values()].filter(b => b.type === 'remote');
    const locals  = [...this.backendMap.values()].filter(b => b.type === 'local');
    if (req.priority === 'p0_critical') return remotes[0] ?? locals[0];
    return locals[0] ?? remotes[0];
  }

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
