/**
 * Ollama BackendDispatcher implementation for the Token Gateway.
 * Wraps the existing ollama.service chat call and reports token counts.
 */

import type { BackendDispatcher, Backend, GatewayRequest } from './tokenGateway.service';
import { AppError } from '../middleware/error.middleware';

interface OllamaChatResponse {
  message: { role: 'assistant'; content: string };
  model: string;
  prompt_eval_count?: number;
  eval_count?: number;
  done?: boolean;
}

export class OllamaDispatcher implements BackendDispatcher {
  async dispatch(
    req: GatewayRequest,
    backend: Backend,
  ): Promise<{ responseText: string; responseTokens: number; promptTokensActual: number }> {
    if (backend.type !== 'local') {
      throw new AppError(`OllamaDispatcher cannot handle backend type=${backend.type}`, 500);
    }
    const baseUrl = backend.baseUrl;
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: backend.modelId,
          messages: req.messages,
          stream: false,
          options: req.modelParameters,
        }),
      });
    } catch {
      throw new AppError(`Ollama unreachable at ${baseUrl}`, 503);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => 'unknown error');
      throw new AppError(`Ollama error: ${text}`, 502);
    }
    const data = (await res.json()) as OllamaChatResponse;
    return {
      responseText: data.message?.content ?? '',
      responseTokens: data.eval_count ?? 0,
      promptTokensActual: data.prompt_eval_count ?? req.promptTokensEstimated,
    };
  }
}
