/**
 * Provider adapter. Cursor is the default and can only be verified via the
 * Cloud Agents API (GET /v1/me). It has no chat-completions endpoint — see
 * docs/CURSOR_PROVIDER.md. Other providers expose a completions call that
 * guardedLlm.service.ts sends through the token gateway.
 */

export const LLM_PROVIDERS = [
  'cursor', 'gemini', 'groq', 'ollama', 'openai', 'anthropic', 'nvidia', 'custom', 'openai_compatible',
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

function isMock(apiKey?: string | null): boolean {
  return process.env.ARIA_LLM_MODE === 'mock' || apiKey === 'aria-mock-key';
}

function cursorBase(baseUrl?: string | null): string {
  return (baseUrl || process.env.CURSOR_API_BASE || 'https://api.cursor.com').replace(/\/$/, '');
}

async function fetchStatus(url: string, headers: Record<string, string>, timeoutMs: number): Promise<number> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  return res.status;
}

export async function testProviderConnection(config: LlmEndpoint): Promise<ConnectionResult> {
  const started = Date.now();
  if (isMock(config.apiKey)) {
    if (config.provider !== 'ollama' && config.provider !== 'custom' && !config.apiKey) {
      return { ok: false, message: 'API key is required' };
    }
    return { ok: true, message: `Mock connection succeeded for ${config.provider}`, latencyMs: Date.now() - started };
  }
  try {
    const status = await probe(config);
    const latencyMs = Date.now() - started;
    if (status === 401 || status === 403) return { ok: false, message: 'Credentials were rejected', latencyMs };
    if (status < 200 || status >= 300) return { ok: false, message: `Provider returned HTTP ${status}`, latencyMs };
    if (config.provider === 'cursor') {
      return { ok: true, message: 'Cursor API key verified via GET /v1/me. This key cannot run chat completions.', latencyMs };
    }
    return { ok: true, message: `${config.provider} connection succeeded`, latencyMs };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Connection failed';
    const safe = config.apiKey ? message.replaceAll(config.apiKey, '[redacted]') : message;
    return { ok: false, message: `Connection failed: ${safe}` };
  }
}

async function probe(config: LlmEndpoint): Promise<number> {
  const key = config.apiKey ?? '';
  switch (config.provider) {
    case 'cursor': {
      const base = cursorBase(config.baseUrl);
      const basic = Buffer.from(`${key}:`).toString('base64');
      const bearer = await fetchStatus(`${base}/v1/me`, { Authorization: `Bearer ${key}`, Accept: 'application/json' }, 8000);
      if (bearer === 200) return bearer;
      return fetchStatus(`${base}/v1/me`, { Authorization: `Basic ${basic}`, Accept: 'application/json' }, 8000);
    }
    case 'gemini': {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${encodeURIComponent(key)}`;
      return fetchStatus(url, {}, 8000);
    }
    case 'groq':
      return fetchStatus('https://api.groq.com/openai/v1/models', { Authorization: `Bearer ${key}` }, 8000);
    case 'ollama': {
      const base = (config.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
      const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return res.status;
      const data = await res.json() as { models?: { name: string }[] };
      const found = data.models?.some((model) => model.name.startsWith(config.model.split(':')[0]));
      return found ? 200 : 404;
    }
    case 'openai':
      return fetchStatus(`${(config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')}/models`, { Authorization: `Bearer ${key}` }, 8000);
    case 'anthropic':
      return fetchStatus('https://api.anthropic.com/v1/models', { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, 8000);
    case 'nvidia':
      return fetchStatus(`${(config.baseUrl || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, '')}/models`, { Authorization: `Bearer ${key}` }, 8000);
    case 'custom':
    case 'openai_compatible': {
      const base = (config.baseUrl || '').replace(/\/$/, '');
      const url = base.endsWith('/v1') ? `${base}/models` : `${base}/v1/models`;
      return fetchStatus(url, key ? { Authorization: `Bearer ${key}` } : {}, 8000);
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
  if (isMock(config.apiKey)) {
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
    openai: 'https://api.openai.com/v1',
    nvidia: 'https://integrate.api.nvidia.com/v1',
  };
  const base = (config.baseUrl || defaults[config.provider] || '').replace(/\/$/, '');
  const root = base.endsWith('/v1') || config.provider === 'groq' || config.provider === 'openai' || config.provider === 'nvidia'
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
