/**
 * Wire up the Token Gateway with real persistence + Ollama / Anthropic
 * dispatchers from the validated environment. One per process.
 */

import { TokenGateway, type Backend } from './tokenGateway.service';
import { OllamaDispatcher } from './dispatcher.ollama';
import { AnthropicDispatcher } from './dispatcher.anthropic';
import { PgReplayFrameRepository } from './replay.repository';
import { PgTokenLedgerRepository } from './ledger.repository';
import { getPgPool } from './db.client';
import { validateEnv } from '../config/env';
import type { BackendDispatcher, GatewayRequest } from './tokenGateway.service';

let singleton: TokenGateway | null = null;

/** Routing dispatcher that picks Ollama vs Anthropic based on backend.type. */
class RoutingDispatcher implements BackendDispatcher {
  constructor(private readonly ollama: OllamaDispatcher, private readonly anthropic: AnthropicDispatcher) {}
  async dispatch(req: GatewayRequest, backend: Backend) {
    return backend.type === 'local'
      ? this.ollama.dispatch(req, backend)
      : this.anthropic.dispatch(req, backend);
  }
}

export function getTokenGateway(): TokenGateway {
  if (singleton) return singleton;
  const env = validateEnv();
  const pool = getPgPool();

  const backends: Backend[] = [
    {
      backendId: 'ollama-default',
      type: 'local',
      modelId: env.OLLAMA_DEFAULT_MODEL,
      baseUrl: env.OLLAMA_BASE_URL,
      maxConcurrentRequests: 2,
      maxContextTokensPerRequest: 32_000,
    },
  ];
  if (env.ANTHROPIC_ENABLED) {
    backends.push({
      backendId: 'anthropic-sonnet',
      type: 'remote',
      modelId: env.ANTHROPIC_DEFAULT_MODEL,
      tier: 'team',
      requestsPerMinuteLimit: 50,
      tokensPerMinuteLimit: 40_000,
      tokensPerDayLimit: 1_000_000,
    });
    backends.push({
      backendId: 'anthropic-opus',
      type: 'remote',
      modelId: env.ANTHROPIC_HIGH_STAKES_MODEL,
      tier: 'enterprise',
      requestsPerMinuteLimit: 25,
      tokensPerMinuteLimit: 20_000,
      tokensPerDayLimit: 500_000,
    });
  }

  singleton = new TokenGateway({
    backends,
    replay: new PgReplayFrameRepository(pool),
    ledger: new PgTokenLedgerRepository(pool),
    dispatcher: new RoutingDispatcher(
      new OllamaDispatcher(),
      new AnthropicDispatcher(env.ANTHROPIC_ENABLED, env.ANTHROPIC_API_KEY),
    ),
    maxQueueDepth: env.MAX_QUEUE_DEPTH,
    maxSessionTokenBudget: env.MAX_SESSION_TOKEN_BUDGET,
    warnRatio: env.TOKEN_BUDGET_WARN_RATIO,
    hardRatio: env.TOKEN_BUDGET_HARD_RATIO,
  });
  return singleton;
}
