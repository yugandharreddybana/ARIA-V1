import type { ChatMessage, LlmEndpoint } from './llmProvider.service';

interface PendingCall {
  config: LlmEndpoint;
  messages: ChatMessage[];
}

const pending = new Map<string, PendingCall>();

export function bindLlmCall(requestId: string, call: PendingCall): void {
  pending.set(requestId, call);
}

export function takeLlmCall(requestId: string): PendingCall | undefined {
  const call = pending.get(requestId);
  pending.delete(requestId);
  return call;
}
