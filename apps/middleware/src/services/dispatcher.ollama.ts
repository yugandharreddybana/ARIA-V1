/**
 * Ollama dispatcher — chat completions (default) + a sibling `embed()` for
 * `nomic-embed-text`. The Token Gateway always calls `dispatch()`; embedding
 * callers (Sprint 8 ConceptGraphBuilder + Sprint 14 hydrator) use `embed()`
 * directly via the `/api/llm/embed` route.
 */

import type { BackendDispatcher, Backend, GatewayRequest } from './tokenGateway.service';
import { AppError } from '../middleware/error.middleware';
import { validateEnv } from '../config/env';

interface OllamaChatResponse {
  message: { role: 'assistant'; content: string };
  model: string;
  prompt_eval_count?: number;
  eval_count?: number;
  done?: boolean;
}

interface OllamaEmbedResponse {
  embedding: number[];
  model: string;
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

  /**
   * Embedding endpoint — bypasses the chat path because Ollama exposes it at /api/embeddings.
   * Still respects the env-configured base URL + embedding model. Used by the /api/llm/embed
   * middleware route.
   */
  async embed(text: string, model?: string): Promise<{ embedding: number[]; model: string }> {
    const env = validateEnv();
    const baseUrl = env.OLLAMA_BASE_URL;
    const modelId = model ?? env.OLLAMA_EMBEDDING_MODEL;
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelId, prompt: text }),
      });
    } catch {
      throw new AppError(`Ollama unreachable at ${baseUrl}`, 503);
    }
    if (!res.ok) {
      const t = await res.text().catch(() => 'unknown error');
      throw new AppError(`Ollama embedding error: ${t}`, 502);
    }
    const data = (await res.json()) as OllamaEmbedResponse;
    return { embedding: data.embedding ?? [], model: data.model ?? modelId };
  }
}
