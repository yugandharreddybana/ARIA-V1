/**
 * Anthropic BackendDispatcher — disabled unless ANTHROPIC_ENABLED=true
 * and ANTHROPIC_API_KEY is set. Wires real Claude calls when enabled.
 */

import type { BackendDispatcher, Backend, GatewayRequest } from './tokenGateway.service';
import { AppError } from '../middleware/error.middleware';

interface AnthropicMessage { role: 'user' | 'assistant'; content: string }
interface AnthropicResponse {
  content: Array<{ type: 'text'; text: string }>;
  usage: { input_tokens: number; output_tokens: number };
}

export class AnthropicDispatcher implements BackendDispatcher {
  constructor(
    private readonly enabled: boolean,
    private readonly apiKey: string | undefined,
  ) {}

  async dispatch(
    req: GatewayRequest,
    backend: Backend,
  ): Promise<{ responseText: string; responseTokens: number; promptTokensActual: number }> {
    if (!this.enabled || !this.apiKey) {
      throw new AppError('Anthropic backend not enabled (ANTHROPIC_ENABLED=false or key missing)', 503);
    }
    if (backend.type !== 'remote') {
      throw new AppError(`AnthropicDispatcher cannot handle backend type=${backend.type}`, 500);
    }
    const messages: AnthropicMessage[] = req.messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
    const system = req.messages.find(m => m.role === 'system')?.content ?? req.systemMessage;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: backend.modelId,
        max_tokens: (req.modelParameters?.max_tokens as number) ?? 1024,
        system,
        messages,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => 'unknown error');
      throw new AppError(`Anthropic error: ${text}`, 502);
    }
    const data = (await res.json()) as AnthropicResponse;
    const responseText = data.content?.map(c => c.text).join('\n') ?? '';
    return {
      responseText,
      responseTokens: data.usage?.output_tokens ?? 0,
      promptTokensActual: data.usage?.input_tokens ?? req.promptTokensEstimated,
    };
  }
}
