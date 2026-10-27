/**
 * Per-task model tiers. Planning defaults to the provider's top model.
 * Development defaults to Auto (Cursor) or the provider's standard model.
 * An agent model id wins, then an agent tier, then the project tier, then the default.
 */

import type { LlmProviderId } from './llmProvider.service';

export const TASK_TYPES = [
  'knowledge_map',
  'company_generation',
  'sprint_planning',
  'architecture',
  'idea_analysis',
  'security_review',
  'code_review',
  'coding',
  'tests',
  'fixes',
  'docs',
] as const;

export type TaskType = typeof TASK_TYPES[number];
export type TaskClass = 'planning' | 'development';
export type ModelTier = 'top' | 'auto';

export const DEFAULT_TASK_TIERS: Record<TaskClass, ModelTier> = {
  planning: 'top',
  development: 'auto',
};

/** Product name for Cursor Auto. The Cloud Agents wire id is `auto-smart` — see cursorWireSelection. */
export const CURSOR_AUTO_MODEL = 'auto';

/**
 * Pinned Cursor planning model. The live catalog is GET /v1/models
 * (example ids there use the `claude-4.6-sonnet-thinking` shape). Override
 * per project when the account's catalog uses a different id.
 */
export const CURSOR_TOP_MODEL = 'claude-4.6-opus-thinking';

export interface TierModels {
  top: string;
  auto: string;
}

export type TaskTierMap = Partial<Record<TaskClass, ModelTier>>;
export type TierModelMap = Partial<TierModels>;

export function taskClassOf(task: TaskType): TaskClass {
  switch (task) {
    case 'knowledge_map':
    case 'company_generation':
    case 'sprint_planning':
    case 'architecture':
    case 'idea_analysis':
    case 'security_review':
    case 'code_review':
      return 'planning';
    case 'coding':
    case 'tests':
    case 'fixes':
    case 'docs':
      return 'development';
    default: {
      const neverTask: never = task;
      throw new Error(`Unknown task ${String(neverTask)}`);
    }
  }
}

export function defaultTierModels(provider: LlmProviderId, workspaceModel?: string | null): TierModels {
  switch (provider) {
    case 'cursor':
      return { top: CURSOR_TOP_MODEL, auto: CURSOR_AUTO_MODEL };
    case 'gemini':
      return { top: 'gemini-2.5-pro', auto: 'gemini-2.5-flash' };
    case 'groq':
      return { top: 'llama-3.3-70b-versatile', auto: 'llama-3.1-8b-instant' };
    case 'openai':
      return { top: 'gpt-4.1', auto: 'gpt-4.1-mini' };
    case 'anthropic':
      return { top: 'claude-opus-4-7', auto: 'claude-sonnet-4-6' };
    case 'nvidia':
      return { top: 'nvidia/llama-3.1-nemotron-70b-instruct', auto: 'meta/llama-3.1-8b-instruct' };
    case 'ollama':
    case 'custom':
    case 'openai_compatible': {
      const model = workspaceModel?.trim() || (provider === 'ollama' ? 'qwen2.5-coder:7b' : 'default');
      return { top: model, auto: model };
    }
    default: {
      const neverProvider: never = provider;
      throw new Error(`Unknown provider ${String(neverProvider)}`);
    }
  }
}

export interface ModelRoute {
  taskType: TaskType;
  taskClass: TaskClass;
  tier: ModelTier | 'override';
  modelId: string;
  source: 'agent_model' | 'agent_tier' | 'project_tier' | 'default';
}

export function resolveModelRoute(input: {
  provider: LlmProviderId;
  taskType: TaskType;
  workspaceModel?: string | null;
  projectTaskTiers?: TaskTierMap | null;
  projectTierModels?: TierModelMap | null;
  workspaceTierModels?: TierModelMap | null;
  agentTaskTiers?: TaskTierMap | null;
  agentModelOverride?: string | null;
}): ModelRoute {
  const taskClass = taskClassOf(input.taskType);
  const override = input.agentModelOverride?.trim();
  if (override) {
    return { taskType: input.taskType, taskClass, tier: 'override', modelId: override, source: 'agent_model' };
  }
  const agentTier = input.agentTaskTiers?.[taskClass];
  const projectTier = input.projectTaskTiers?.[taskClass];
  const tier = agentTier ?? projectTier ?? DEFAULT_TASK_TIERS[taskClass];
  const source = agentTier ? 'agent_tier' : projectTier ? 'project_tier' : 'default';
  const catalog = defaultTierModels(input.provider, input.workspaceModel);
  const custom = input.projectTierModels?.[tier]?.trim();
  const validated = input.workspaceTierModels?.[tier]?.trim();
  return {
    taskType: input.taskType,
    taskClass,
    tier,
    modelId: custom || validated || catalog[tier],
    source,
  };
}

export interface CatalogEntry {
  id: string;
  aliases?: string[];
}

/** Ids a caller may pin. Accepts the string list from Test Connection and the `{ id, aliases }` list stored after a catalog refresh. */
export function catalogModelIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const row of value) {
    if (typeof row === 'string') {
      const id = row.trim();
      if (id) ids.push(id);
      continue;
    }
    if (!row || typeof row !== 'object') continue;
    const record = row as { id?: unknown; aliases?: unknown };
    if (typeof record.id === 'string' && record.id.trim()) ids.push(record.id.trim());
    if (!Array.isArray(record.aliases)) continue;
    for (const alias of record.aliases) {
      if (typeof alias === 'string' && alias.trim()) ids.push(alias.trim());
    }
  }
  return ids;
}

const CURSOR_TOP_PREFERENCE = [
  'claude-opus-5',
  'gpt-5.5',
  'grok-4.6',
  'claude-fable-5',
  'composer-2.5',
  'claude-4.6-opus-thinking',
];

const CURSOR_AUTO_PREFERENCE = ['auto-smart', 'auto'];

function catalogHas(catalog: CatalogEntry[], id: string): CatalogEntry | undefined {
  return catalog.find((entry) => entry.id === id || entry.aliases?.includes(id));
}

function pickListed(catalog: CatalogEntry[], preference: string[], fallback: (id: string) => boolean): string | null {
  for (const id of preference) {
    const found = catalogHas(catalog, id);
    if (found) return found.id;
  }
  return catalog.find((entry) => fallback(entry.id))?.id ?? null;
}

/**
 * Both tier ids must be members of the provider's live model list.
 * Hard-coded names are only preferences, and only when the catalog contains them.
 */
export function selectTierModels(provider: LlmProviderId, catalog: CatalogEntry[], preferredModel?: string | null): TierModels {
  const listed = catalog.filter((entry) => entry.id.trim());
  if (listed.length === 0) throw new Error('Provider returned no models');
  if (provider === 'cursor') {
    const auto = pickListed(listed, CURSOR_AUTO_PREFERENCE, (id) => id === 'auto' || id.startsWith('auto-'));
    const top = pickListed(listed, CURSOR_TOP_PREFERENCE, (id) => id !== auto && !id.startsWith('auto'));
    if (!auto || !top || auto === top) {
      throw new Error('Cursor catalog did not include both a planning model and an Auto model');
    }
    return { top, auto };
  }
  if (provider === 'ollama' || provider === 'custom' || provider === 'openai_compatible') {
    const preferred = preferredModel?.trim();
    if (preferred && !catalogHas(listed, preferred)) {
      throw new Error(`Model ${preferred} is not in the provider catalog`);
    }
    const chosen = preferred ? catalogHas(listed, preferred)!.id : listed[0].id;
    return { top: chosen, auto: listed.find((entry) => entry.id !== chosen)?.id ?? chosen };
  }
  const defaults = defaultTierModels(provider, preferredModel);
  const top = catalogHas(listed, defaults.top)?.id
    ?? pickListed(listed, [], (id) => /opus|pro|large|70b|nemotron|gpt-5/i.test(id));
  const auto = catalogHas(listed, defaults.auto)?.id
    ?? pickListed(listed, [], (id) => id !== top && /flash|mini|small|8b|instant|haiku|sonnet/i.test(id));
  if (!top || !auto) throw new Error(`${provider} catalog did not include a planning model and a standard model`);
  return { top, auto };
}

/**
 * Wire id for a model that Test Connection already found in the account catalog.
 * `{ id: "auto" }` is the documented Auto fallback. `auto-smart` is only sent
 * when that id was actually listed (Teams / Enterprise router).
 */
export function cursorWireSelection(modelId: string): { id: string; params?: Array<{ id: string; value: string }> } {
  if (modelId === 'auto-smart') {
    return { id: 'auto-smart', params: [{ id: 'optimize_for', value: 'cost' }] };
  }
  return { id: modelId };
}

export function readTier(value: unknown, key: TaskClass): ModelTier | null {
  if (!value || typeof value !== 'object') return null;
  const raw = (value as Record<string, unknown>)[key];
  return raw === 'top' || raw === 'auto' ? raw : null;
}

export function readTierModel(value: unknown, key: ModelTier): string | null {
  if (!value || typeof value !== 'object') return null;
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

export function taskTierMap(value: unknown): TaskTierMap {
  const planning = readTier(value, 'planning');
  const development = readTier(value, 'development');
  return {
    ...(planning ? { planning } : {}),
    ...(development ? { development } : {}),
  };
}

export function tierModelMap(value: unknown): TierModelMap {
  const top = readTierModel(value, 'top');
  const auto = readTierModel(value, 'auto');
  return {
    ...(top ? { top } : {}),
    ...(auto ? { auto } : {}),
  };
}
