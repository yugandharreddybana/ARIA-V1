/**
 * Provider adapter. Cursor is the default and can only be verified via the
 * Cloud Agents API (GET /v1/me). It has no chat-completions endpoint — see
 * docs/CURSOR_PROVIDER.md. Other providers expose a completions call that
 * guardedLlm.service.ts sends through the token gateway.
 */

import { defaultTierModels, selectTierModels, type CatalogEntry, type TierModels } from './modelTiers';

export const LLM_PROVIDERS = [
  'cursor', 'claude_code', 'codex', 'antigravity',
  'gemini', 'groq', 'ollama', 'openai', 'anthropic', 'nvidia', 'custom', 'openai_compatible',
] as const;

export type LlmProviderId = typeof LLM_PROVIDERS[number];

export interface LlmEndpoint {
  provider: LlmProviderId;
  baseUrl?: string | null;
  model: string;
  apiKey?: string | null;
}

export interface ConnectionResult {
  ok: boolean;
  message: string;
  latencyMs?: number;
  topModel?: string;
  autoModel?: string;
  models?: string[];
}

export class CursorNoChatError extends Error {
  readonly code = 'CURSOR_NO_CHAT_API';
  constructor() {
    super('Cursor Cloud Agents API has no chat-completions endpoint. Choose Gemini, Groq, Ollama, OpenAI, Anthropic, or an OpenAI-compatible base URL for text generation.');
    this.name = 'CursorNoChatError';
  }
}

export function providerSupportsChat(provider: LlmProviderId): boolean {
  return provider !== 'cursor';
}

export function mockModeEnabled(): boolean {
  return process.env.ARIA_LLM_MODE === 'mock' && process.env.NODE_ENV !== 'production';
}

function envBase(name: string, fallback: string): string {
  return (process.env[name] || fallback).replace(/\/$/, '');
}

function cursorBase(): string {
  return envBase('CURSOR_API_BASE', 'https://api.cursor.com');
}

async function fetchStatus(url: string, headers: Record<string, string>, timeoutMs: number): Promise<number> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  return res.status;
}

export async function testProviderConnection(config: LlmEndpoint): Promise<ConnectionResult> {
  const started = Date.now();
  if (mockModeEnabled()) {
    if (config.provider !== 'ollama' && config.provider !== 'custom' && !config.apiKey) {
      return { ok: false, message: 'API key is required' };
    }
    const tiers = selectTierModels(config.provider, mockCatalog(config), config.model);
    return {
      ok: true,
      message: `Mock connection succeeded for ${config.provider}`,
      latencyMs: Date.now() - started,
      topModel: tiers.top,
      autoModel: tiers.auto,
      models: [tiers.top, tiers.auto],
    };
  }
  try {
    const probed = await probe(config);
    const latencyMs = Date.now() - started;
    if (probed.status === 401 || probed.status === 403) return { ok: false, message: 'Credentials were rejected', latencyMs };
    if (probed.status < 200 || probed.status >= 300) return { ok: false, message: `Provider returned HTTP ${probed.status}`, latencyMs };
    let tiers: TierModels;
    try {
      tiers = selectTierModels(config.provider, probed.models, config.model);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Model list could not be resolved';
      return { ok: false, message, latencyMs };
    }
    const names = probed.models.map((model) => model.id);
    if (config.provider === 'cursor') {
      return {
        ok: true,
        message: `Cursor API key verified. Planning model ${tiers.top}. Auto model ${tiers.auto}. This key cannot run chat completions.`,
        latencyMs,
        topModel: tiers.top,
        autoModel: tiers.auto,
        models: names,
      };
    }
    return {
      ok: true,
      message: `${config.provider} connection succeeded. Planning model ${tiers.top}. Standard model ${tiers.auto}.`,
      latencyMs,
      topModel: tiers.top,
      autoModel: tiers.auto,
      models: names,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Connection failed';
    const safe = config.apiKey ? message.replaceAll(config.apiKey, '[redacted]') : message;
    return { ok: false, message: `Connection failed: ${safe}` };
  }
}

function mockCatalog(config: LlmEndpoint): CatalogEntry[] {
  if (config.provider === 'cursor') {
    return [{ id: 'claude-opus-5' }, { id: 'auto', aliases: ['auto-smart'] }];
  }
  const tiers = defaultTierModels(config.provider, config.model);
  return [{ id: tiers.top }, { id: tiers.auto }];
}

interface ProbeResult { status: number; models: CatalogEntry[] }

function modelsFromPayload(payload: unknown): CatalogEntry[] {
  if (!payload || typeof payload !== 'object') return [];
  const body = payload as { data?: unknown; models?: unknown; items?: unknown };
  const rows = Array.isArray(body.items) ? body.items : Array.isArray(body.data) ? body.data : Array.isArray(body.models) ? body.models : [];
  const models: CatalogEntry[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const record = row as { id?: unknown; name?: unknown; aliases?: unknown };
    const raw = typeof record.id === 'string' ? record.id : typeof record.name === 'string' ? record.name : '';
    const id = raw.replace(/^models\//, '').trim();
    if (!id) continue;
    const aliases = Array.isArray(record.aliases) ? record.aliases.filter((alias): alias is string => typeof alias === 'string') : [];
    models.push({ id, aliases });
  }
  return models;
}

async function readModels(url: string, headers: Record<string, string>, timeoutMs: number): Promise<ProbeResult> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) return { status: res.status, models: [] };
  return { status: res.status, models: modelsFromPayload(await res.json()) };
}

async function probe(config: LlmEndpoint): Promise<ProbeResult> {
  const key = config.apiKey ?? '';
  switch (config.provider) {
    case 'cursor': {
      const base = cursorBase();
      const basic = Buffer.from(`${key}:`).toString('base64');
      let me = await fetchStatus(`${base}/v1/me`, { Authorization: `Bearer ${key}`, Accept: 'application/json' }, 8000);
      if (me !== 200) {
        me = await fetchStatus(`${base}/v1/me`, { Authorization: `Basic ${basic}`, Accept: 'application/json' }, 8000);
      }
      if (me !== 200) return { status: me, models: [] };
      const models = await readModels(`${base}/v1/models`, { Authorization: `Bearer ${key}`, Accept: 'application/json' }, 8000);
      return models.status === 200 ? models : { status: models.status, models: [] };
    }
    case 'claude_code':
    case 'anthropic':
      return readModels(`${envBase('ANTHROPIC_API_BASE', 'https://api.anthropic.com')}/v1/models`, { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, 8000);
    case 'codex':
    case 'openai':
      return readModels(`${envBase('OPENAI_API_BASE', 'https://api.openai.com/v1')}/models`, { Authorization: `Bearer ${key}` }, 8000);
    case 'antigravity':
    case 'gemini':
      return readModels(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=100&key=${encodeURIComponent(key)}`, {}, 8000);
    case 'groq':
      return readModels('https://api.groq.com/openai/v1/models', { Authorization: `Bearer ${key}` }, 8000);
    case 'ollama': {
      const base = (config.baseUrl || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
      const probed = await readModels(`${base}/api/tags`, {}, 5000);
      if (probed.status !== 200) return probed;
      const wanted = config.model.split(':')[0];
      if (!probed.models.some((model) => model.id.startsWith(wanted))) return { status: 404, models: [] };
      return probed;
    }
    case 'nvidia':
      return readModels(`${envBase('NVIDIA_API_BASE', 'https://integrate.api.nvidia.com/v1')}/models`, { Authorization: `Bearer ${key}` }, 8000);
    case 'custom':
    case 'openai_compatible': {
      const base = (config.baseUrl || '').replace(/\/$/, '');
      const url = base.endsWith('/v1') ? `${base}/models` : `${base}/v1/models`;
      return readModels(url, key ? { Authorization: `Bearer ${key}` } : {}, 8000);
    }
    default: {
      const neverProvider: never = config.provider;
      throw new Error(`Unknown provider ${String(neverProvider)}`);
    }
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function completeChat(config: LlmEndpoint, messages: ChatMessage[]): Promise<string> {
  if (config.provider === 'cursor') throw new CursorNoChatError();
  if (mockModeEnabled()) {
    const last = messages.filter((message) => message.role === 'user').pop();
    return `Mock completion [${config.model}]. Noted ${last?.content.slice(0, 180) ?? 'empty prompt'}.`;
  }
  switch (config.provider) {
    case 'ollama': {
      const base = (config.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
      const res = await fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: config.model, messages, stream: false }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`Ollama returned HTTP ${res.status}`);
      const data = await res.json() as { message?: { content?: string } };
      return data.message?.content ?? '';
    }
    case 'claude_code':
    case 'anthropic': {
      const system = messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n');
      const rest = messages.filter((message) => message.role !== 'system');
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey ?? '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 800,
          system,
          messages: rest.map((message) => ({ role: message.role, content: message.content })),
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`Anthropic returned HTTP ${res.status}`);
      const data = await res.json() as { content?: Array<{ text?: string }> };
      return data.content?.map((part) => part.text ?? '').join('') ?? '';
    }
    case 'antigravity':
    case 'gemini': {
      const prompt = messages.map((message) => `${message.role}: ${message.content}`).join('\n');
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey ?? '')}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`Gemini returned HTTP ${res.status}`);
      const data = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
    }
    case 'codex':
    case 'groq':
    case 'openai':
    case 'nvidia':
    case 'custom':
    case 'openai_compatible':
      return openAiCompatible(config, messages);
    default: {
      const neverProvider: never = config.provider;
      throw new Error(`Unknown provider ${String(neverProvider)}`);
    }
  }
}

async function openAiCompatible(config: LlmEndpoint, messages: ChatMessage[]): Promise<string> {
  const defaults: Partial<Record<LlmProviderId, string>> = {
    groq: 'https://api.groq.com/openai/v1',
    openai: envBase('OPENAI_API_BASE', 'https://api.openai.com/v1'),
    codex: envBase('OPENAI_API_BASE', 'https://api.openai.com/v1'),
    nvidia: envBase('NVIDIA_API_BASE', 'https://integrate.api.nvidia.com/v1'),
  };
  const fixed = config.provider === 'groq' || config.provider === 'openai' || config.provider === 'nvidia' || config.provider === 'codex';
  const base = (fixed ? defaults[config.provider] ?? '' : config.baseUrl || '').replace(/\/$/, '');
  const root = base.endsWith('/v1') || fixed
    ? base
    : `${base}/v1`;
  const res = await fetch(`${root}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({ model: config.model, messages, max_tokens: 800 }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`${config.provider} returned HTTP ${res.status}`);
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? '';
}
