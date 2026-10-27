/**
 * Every model completion in the setup path goes through the sanitizer and a
 * token-budget queue. The process-wide gateway persists totals on token_ledger,
 * using the workspace id as the budget bucket.
 * An agent with enabled=false is refused before any tokens are reserved.
 */

import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db, projects, skills, workspaces } from '@aria/db';
import { AppError } from '../middleware/error.middleware';
import { decryptSecret } from './crypto.service';
import { Sanitizer } from './sanitizer.service';
import { getTokenGateway } from './tokenGateway.factory';
import { bindLlmCall, takeLlmCall } from './llmDispatchContext';
import { mockModeEnabled, type ChatMessage, type LlmEndpoint, type LlmProviderId } from './llmProvider.service';
import { validateEnv } from '../config/env';
import { monthlyBucketId } from './runs/budget';
import { resolveModelRoute, taskTierMap, tierModelMap, type TaskType } from './modelTiers';
import { resolveActiveCredential } from './providers/credentials.service';

const sanitizer = new Sanitizer();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function assertAgentEnabled(agentId: string | undefined): Promise<void> {
  if (!agentId || !UUID_RE.test(agentId)) return;
  const row = await db.query.skills.findFirst({ where: eq(skills.id, agentId) });
  if (row && row.enabled === false) {
    throw new AppError('Agent is off and consumes zero tokens', 409, 'AGENT_DISABLED');
  }
}

export async function completeThroughGateway(input: {
  workspaceId: string;
  projectId?: string;
  agentId: string;
  skillSlug?: string;
  taskType: TaskType;
  config: LlmEndpoint;
  messages: ChatMessage[];
}): Promise<string> {
  await assertAgentEnabled(input.agentId);
  const userText = input.messages.filter((message) => message.role === 'user').map((message) => message.content).join('\n');
  const cleaned = await sanitizer.sanitize(userText);
  if (cleaned.trustLabel === 'rejected') {
    throw new AppError('Prompt was rejected by the sanitizer', 422, 'PROMPT_REJECTED');
  }
  const messages = input.messages.map((message) => (
    message.role === 'user' ? { ...message, content: cleaned.cleaned } : message
  ));
  const policy = await loadTierPolicy(input.workspaceId, input.projectId, input.agentId);
  const route = resolveModelRoute({
    provider: input.config.provider,
    taskType: input.taskType,
    workspaceModel: input.config.model,
    projectTaskTiers: policy.projectTaskTiers,
    projectTierModels: policy.projectTierModels,
    workspaceTierModels: policy.workspaceTierModels,
    agentTaskTiers: policy.agentTaskTiers,
    agentModelOverride: policy.agentModelOverride,
  });
  const tierKey = route.tier === 'top' || route.tier === 'auto' ? route.tier : null;
  const storedModel = tierKey ? policy.projectTierModels[tierKey] || policy.workspaceTierModels[tierKey] : null;
  if (!mockModeEnabled() && route.source !== 'agent_model' && !storedModel) {
    throw new AppError('Test Connection has not stored a model id for this tier', 422, 'MODEL_NOT_VALIDATED');
  }
  const routed: LlmEndpoint = { ...input.config, model: route.modelId };
  const requestId = randomUUID();
  bindLlmCall(requestId, { config: routed, messages });
  const gateway = getTokenGateway();
  try {
    const response = await gateway.invoke({
      requestId,
      sessionId: monthlyBucketId(input.workspaceId),
      budgetMaxTokens: validateEnv().ARIA_MONTHLY_TOKEN_BUDGET,
      agentId: input.agentId,
      skillSlug: input.skillSlug,
      targetBackend: 'workspace-llm',
      priority: route.taskClass === 'planning' ? 'high' : 'normal',
      promptTokensEstimated: Math.max(1, Math.ceil(JSON.stringify(messages).length / 4)),
      messages,
      modelParameters: {
        taskType: route.taskType,
        taskClass: route.taskClass,
        tier: route.tier,
        modelSource: route.source,
      },
    });
    return response.responseText;
  } catch (err) {
    takeLlmCall(requestId);
    const message = err instanceof Error ? err.message : '';
    if (message.includes('no chat-completions')) {
      throw new AppError(
        `Cursor has no chat-completions API. Routed ${route.taskType} to model ${route.modelId} and refused the completion.`,
        422,
        'CURSOR_NO_CHAT_API',
      );
    }
    throw err;
  }
}

async function loadTierPolicy(workspaceId: string, projectId: string | undefined, agentId: string): Promise<{
  projectTaskTiers: ReturnType<typeof taskTierMap>;
  projectTierModels: ReturnType<typeof tierModelMap>;
  workspaceTierModels: ReturnType<typeof tierModelMap>;
  agentTaskTiers: ReturnType<typeof taskTierMap>;
  agentModelOverride: string | null;
}> {
  const workspace = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  const workspaceTierModels = tierModelMap(workspace?.llmTierModels);
  let resolvedProjectId = projectId;
  let agentTaskTiers: ReturnType<typeof taskTierMap> = {};
  let agentModelOverride: string | null = null;
  if (UUID_RE.test(agentId)) {
    const skill = await db.query.skills.findFirst({ where: eq(skills.id, agentId) });
    if (skill?.projectId) {
      const owned = await db.query.projects.findFirst({
        where: and(eq(projects.id, skill.projectId), eq(projects.workspaceId, workspaceId)),
      });
      if (owned) {
        agentTaskTiers = taskTierMap(skill.modelTaskTiers);
        agentModelOverride = skill.modelOverride ?? null;
        resolvedProjectId = owned.id;
      }
    }
  }
  if (!resolvedProjectId) {
    return { projectTaskTiers: {}, projectTierModels: {}, workspaceTierModels, agentTaskTiers, agentModelOverride };
  }
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, resolvedProjectId), eq(projects.workspaceId, workspaceId)),
  });
  return {
    projectTaskTiers: taskTierMap(project?.modelTaskTiers),
    projectTierModels: tierModelMap(project?.modelTierModels),
    workspaceTierModels,
    agentTaskTiers,
    agentModelOverride,
  };
}

export function providerId(value: string | null | undefined): LlmProviderId {
  switch (value) {
    case 'cursor':
    case 'claude_code':
    case 'codex':
    case 'antigravity':
    case 'gemini':
    case 'groq':
    case 'ollama':
    case 'openai':
    case 'anthropic':
    case 'nvidia':
    case 'custom':
    case 'openai_compatible':
      return value;
    default:
      return 'cursor';
  }
}

export async function loadWorkspaceLlm(workspaceId: string): Promise<LlmEndpoint | null> {
  // Prefer active planning credential (M3A); fall back to legacy workspace llm_* columns.
  const active = await resolveActiveCredential(workspaceId, 'planning');
  if (active) {
    return {
      provider: providerId(active.provider),
      baseUrl: active.baseUrl,
      model: active.model,
      apiKey: active.apiKey,
    };
  }
  const row = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  if (!row?.llmProvider || !row.llmModel) return null;
  return {
    provider: providerId(row.llmProvider),
    baseUrl: row.llmBaseUrl,
    model: row.llmModel,
    apiKey: row.llmApiKeyEncrypted
      ? decryptSecret(row.llmApiKeyEncrypted, { workspaceId, column: 'llm_api_key_encrypted' })
      : null,
  };
}

export async function workspaceOwnsAgent(agentId: string, workspaceId: string): Promise<boolean> {
  const row = await db.query.skills.findFirst({
    where: eq(skills.id, agentId),
    with: { project: true },
  });
  if (!row?.project || !row.projectId) return false;
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, row.projectId), eq(projects.workspaceId, workspaceId)),
  });
  return Boolean(project);
}
