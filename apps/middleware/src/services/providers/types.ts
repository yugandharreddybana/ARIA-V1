import type { ConnectionResult } from '../llmProvider.service';
import type { CodeWorker } from '../models/codeWorker';
import type { ReasoningModel } from '../models/reasoning';

export const CODING_PROVIDERS = ['cursor', 'claude_code', 'codex', 'antigravity'] as const;
export const PLANNING_PROVIDERS = [
  'cursor', 'claude_code', 'codex', 'antigravity',
  'gemini', 'openai', 'anthropic', 'groq', 'ollama', 'openai_compatible', 'custom', 'nvidia',
] as const;

export type CodingProviderId = typeof CODING_PROVIDERS[number];
export type ProviderId = typeof PLANNING_PROVIDERS[number];
export type ProviderTier = 'planning' | 'coding';

export type BinaryStatus = 'unknown' | 'ok' | 'missing' | 'not_required';
export type ConnectionStatus = 'untested' | 'ok' | 'failed';

export interface BinaryProbe {
  status: BinaryStatus;
  binary?: string;
  installSteps: string[];
}

export interface ProviderAdapter {
  id: ProviderId;
  label: string;
  canPlan: boolean;
  canCode: boolean;
  /** CLI binary required for coding; omit when API-only. */
  binary?: string;
  runtime: string;
  installSteps: string[];
  needsApiKey: boolean;
  defaultModel: string;
  envKeyHint?: string;
  testConnection(input: {
    apiKey?: string | null;
    baseUrl?: string | null;
    model?: string;
  }): Promise<ConnectionResult>;
  detectBinary(): Promise<BinaryProbe>;
  asReasoner?(ctx: { workspaceId: string; apiKey?: string | null; baseUrl?: string | null; model?: string | null }): ReasoningModel;
  asCoder?(): CodeWorker;
}

export interface CredentialPublic {
  id: string;
  provider: ProviderId;
  label: string;
  baseUrl: string | null;
  connectionStatus: ConnectionStatus;
  lastTestedAt: string | null;
  lastError: string | null;
  binaryStatus: BinaryStatus;
  retiredAt: string | null;
  catalog: string[];
  canPlan: boolean;
  canCode: boolean;
  installSteps: string[];
  /** Never include secrets. */
  hasApiKey: boolean;
}
