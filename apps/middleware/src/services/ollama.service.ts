import { validateEnv } from '../config/env';
import { AppError } from '../middleware/error.middleware';

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function ollamaChat(messages: OllamaMessage[], model?: string): Promise<{ message: OllamaMessage; model: string }> {
  const env = validateEnv();
  const selectedModel = model ?? env.OLLAMA_DEFAULT_MODEL;
  let res: Response;
  try {
    res = await fetch(`${env.OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: selectedModel, messages, stream: false }),
    });
  } catch {
    throw new AppError('Ollama is not reachable. Make sure it is running on localhost:11434.', 503);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new AppError(`Ollama error: ${text}`, 502);
  }
  const data = await res.json() as { message: OllamaMessage; model: string };
  return { message: data.message, model: data.model };
}

export async function listOllamaModels(): Promise<string[]> {
  const env = validateEnv();
  try {
    const res = await fetch(`${env.OLLAMA_BASE_URL}/api/tags`);
    if (!res.ok) return [];
    const data = await res.json() as { models: { name: string }[] };
    return data.models?.map((m: { name: string }) => m.name) ?? [];
  } catch {
    return [];
  }
}
