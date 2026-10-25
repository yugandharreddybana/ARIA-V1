import { db } from '@aria/db';
import { workspaces } from '@aria/db';
import { eq } from 'drizzle-orm';
import { AppError } from '../middleware/error.middleware';
import type { LlmConfigInput } from '../schemas/workspace.schema';
import { decryptSecret, encryptSecret } from './crypto.service';
import { testProviderConnection, type LlmProviderId } from './llmProvider.service';

function encryptApiKey(plain: string): string {
  return encryptSecret(plain);
}

export function decryptApiKey(stored: string): string {
  return decryptSecret(stored);
}

export async function saveLlmConfig(
  workspaceId: string,
  config: LlmConfigInput,
): Promise<void> {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });
  if (!workspace) throw new AppError('Workspace not found', 404, 'NOT_FOUND');

  const apiKeyEncrypted =
    config.apiKey ? encryptApiKey(config.apiKey) : null;

  await db
    .update(workspaces)
    .set({
      llmProvider: config.provider as LlmProviderId,
      llmBaseUrl:  config.baseUrl ?? null,
      llmApiKeyEncrypted: apiKeyEncrypted,
      llmModel:    config.model,
      updatedAt:   new Date(),
    })
    .where(eq(workspaces.id, workspaceId));
}

export async function getLlmConfig(workspaceId: string) {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });
  if (!workspace) throw new AppError('Workspace not found', 404, 'NOT_FOUND');

  return {
    provider: workspace.llmProvider ?? 'cursor',
    baseUrl:  workspace.llmBaseUrl ?? null,
    model:    workspace.llmModel ?? null,
    hasApiKey: !!workspace.llmApiKeyEncrypted,
  };
}

/**
 * Tests live connectivity to a configured LLM endpoint.
 * For NVIDIA NIM: hits /models on integrate.api.nvidia.com with Bearer nvapi-... key.
 */
export async function testLlmConnectivity(
  provider: string,
  baseUrl: string | undefined,
  model: string,
  apiKey: string | undefined,
): Promise<{ ok: boolean; message: string; latencyMs?: number }> {
  if (!isProvider(provider)) return { ok: false, message: `Unknown provider: ${provider}` };
  return testProviderConnection({ provider, baseUrl, model, apiKey });
}

function isProvider(provider: string): provider is LlmProviderId {
  return ['cursor', 'gemini', 'groq', 'ollama', 'openai', 'anthropic', 'nvidia', 'custom', 'openai_compatible'].includes(provider);
}
