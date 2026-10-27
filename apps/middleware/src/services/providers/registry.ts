import { testProviderConnection, type LlmProviderId } from '../llmProvider.service';
import { cursorCloudWorker } from '../models/codeWorker';
import { detectBinary } from './binary';
import { cliCodeWorker } from './cliWorker';
import type { ProviderAdapter, ProviderId, ProviderTier } from './types';

const CLAUDE_INSTALL = [
  'Install Claude Code: https://code.claude.com/docs/en/headless',
  'Ensure `claude` is on PATH',
  'Set ANTHROPIC_API_KEY for the API key used in ARIA',
];
const CODEX_INSTALL = [
  'Install Codex CLI: https://learn.chatgpt.com/docs/non-interactive-mode',
  'Ensure `codex` is on PATH',
  'Set CODEX_API_KEY (or OPENAI_API_KEY) to the key saved in ARIA',
];
const AGY_INSTALL = [
  'Install Antigravity CLI: https://antigravity.google/docs/cli/headless/',
  'Ensure `agy` is on PATH',
  'Set GEMINI_API_KEY to the key saved in ARIA',
];

function makeAdapter(spec: {
  id: ProviderId;
  label: string;
  canCode?: boolean;
  binary?: string;
  runtime?: string;
  defaultModel: string;
  envKeyHint?: string;
  installSteps?: string[];
  needsApiKey?: boolean;
  asCoder?: ProviderAdapter['asCoder'];
}): ProviderAdapter {
  const installSteps = spec.installSteps ?? [];
  return {
    id: spec.id,
    label: spec.label,
    canPlan: true,
    canCode: spec.canCode ?? false,
    binary: spec.binary,
    runtime: spec.runtime ?? 'chat',
    installSteps,
    needsApiKey: spec.needsApiKey ?? true,
    defaultModel: spec.defaultModel,
    envKeyHint: spec.envKeyHint,
    asCoder: spec.asCoder,
    async testConnection(input) {
      return testProviderConnection({
        provider: spec.id as LlmProviderId,
        apiKey: input.apiKey,
        baseUrl: input.baseUrl,
        model: input.model || spec.defaultModel,
      });
    },
    async detectBinary() {
      return detectBinary(spec.binary, installSteps);
    },
  };
}

const ADAPTERS: ProviderAdapter[] = [
  makeAdapter({
    id: 'cursor',
    label: 'Cursor',
    canCode: true,
    runtime: 'cursor_cloud',
    defaultModel: 'cursor-agent',
    envKeyHint: 'CURSOR_API_KEY',
    asCoder: () => cursorCloudWorker(),
  }),
  makeAdapter({
    id: 'claude_code',
    label: 'Claude Code',
    canCode: true,
    binary: 'claude',
    runtime: 'claude_cli',
    defaultModel: 'claude-sonnet-4-6',
    envKeyHint: 'ANTHROPIC_API_KEY',
    installSteps: CLAUDE_INSTALL,
    asCoder: () => cliCodeWorker('claude_cli'),
  }),
  makeAdapter({
    id: 'codex',
    label: 'Codex',
    canCode: true,
    binary: 'codex',
    runtime: 'codex_cli',
    defaultModel: 'gpt-4.1',
    envKeyHint: 'CODEX_API_KEY',
    installSteps: CODEX_INSTALL,
    asCoder: () => cliCodeWorker('codex_cli'),
  }),
  makeAdapter({
    id: 'antigravity',
    label: 'Antigravity',
    canCode: true,
    binary: 'agy',
    runtime: 'antigravity_cli',
    defaultModel: 'gemini-2.5-pro',
    envKeyHint: 'GEMINI_API_KEY',
    installSteps: AGY_INSTALL,
    asCoder: () => cliCodeWorker('antigravity_cli'),
  }),
  makeAdapter({ id: 'gemini', label: 'Gemini', defaultModel: 'gemini-2.0-flash', envKeyHint: 'GEMINI_API_KEY' }),
  makeAdapter({ id: 'openai', label: 'OpenAI', defaultModel: 'gpt-4o-mini', envKeyHint: 'OPENAI_API_KEY' }),
  makeAdapter({ id: 'anthropic', label: 'Anthropic', defaultModel: 'claude-sonnet-4-6', envKeyHint: 'ANTHROPIC_API_KEY' }),
  makeAdapter({ id: 'groq', label: 'Groq', defaultModel: 'llama-3.3-70b-versatile' }),
  makeAdapter({ id: 'ollama', label: 'Ollama', defaultModel: 'qwen2.5-coder:7b', needsApiKey: false }),
  makeAdapter({ id: 'openai_compatible', label: 'OpenAI-compatible', defaultModel: 'local-model' }),
  makeAdapter({ id: 'custom', label: 'Custom', defaultModel: 'default', needsApiKey: false }),
  makeAdapter({ id: 'nvidia', label: 'NVIDIA NIM', defaultModel: 'meta/llama-3.1-8b-instruct' }),
];

const BY_ID = new Map(ADAPTERS.map((adapter) => [adapter.id, adapter]));

export function allProviders(): ProviderAdapter[] {
  return ADAPTERS.slice();
}

export function getProvider(id: string): ProviderAdapter | undefined {
  return BY_ID.get(id as ProviderId);
}

/** Capability-filtered lists: planning = canPlan; coding = canCode only (never show-and-block). */
export function providersForTier(tier: ProviderTier): ProviderAdapter[] {
  return ADAPTERS.filter((adapter) => (tier === 'planning' ? adapter.canPlan : adapter.canCode));
}

export function isProviderId(value: string): value is ProviderId {
  return BY_ID.has(value as ProviderId);
}
