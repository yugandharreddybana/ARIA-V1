import crypto from 'node:crypto';
import { db } from '@aria/db';
import { workspaces } from '@aria/db';
import { eq } from 'drizzle-orm';
import { AppError } from '../middleware/error.middleware';
import type { LlmConfigInput } from '../schemas/workspace.schema';

// AES-256-GCM encryption for API keys at rest.
function getEncryptionKey(): Buffer {
  const raw = process.env.WORKSPACE_ENCRYPTION_KEY;
  if (!raw || raw.length < 32) {
    throw new AppError('WORKSPACE_ENCRYPTION_KEY env var missing or too short (need 32+ chars)', 500, 'CONFIG_ERROR');
  }
  return Buffer.from(raw.slice(0, 32), 'utf-8');
}

function encryptApiKey(plain: string): string {
  const key = getEncryptionKey();
  const iv  = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptApiKey(stored: string): string {
  const key = getEncryptionKey();
  const parts = stored.split(':');
  if (parts.length !== 3) throw new AppError('Malformed encrypted key', 500, 'DECRYPT_ERROR');
  const [ivHex, tagHex, ctHex] = parts;
  const iv = Buffer.from(ivHex,  'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const ct  = Buffer.from(ctHex,  'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ct).toString('utf-8') + decipher.final('utf-8');
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
      llmProvider: config.provider as 'ollama' | 'anthropic' | 'openai' | 'nvidia' | 'custom',
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
    provider: workspace.llmProvider ?? 'ollama',
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
  const start = Date.now();
  try {
    if (provider === 'ollama') {
      const url = `${baseUrl ?? 'http://localhost:11434'}/api/tags`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (!res.ok) return { ok: false, message: `Ollama returned HTTP ${res.status}` };
      const data = await res.json() as { models?: { name: string }[] };
      const found = data.models?.some(m => m.name.startsWith(model.split(':')[0]));
      return {
        ok: true,
        message: found
          ? `Model "${model}" found on Ollama`
          : `Ollama reachable but model "${model}" not found — pull it first`,
        latencyMs: Date.now() - start,
      };
    }

    if (provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': apiKey ?? '',
          'anthropic-version': '2023-06-01',
        },
        signal: AbortSignal.timeout(6_000),
      });
      if (res.status === 401) return { ok: false, message: 'Invalid Anthropic API key' };
      if (!res.ok)           return { ok: false, message: `Anthropic API returned HTTP ${res.status}` };
      return { ok: true, message: 'Anthropic API key verified', latencyMs: Date.now() - start };
    }

    if (provider === 'nvidia') {
      // NVIDIA NIM is OpenAI-compatible. Base URL defaults to the hosted NIM endpoint.
      const base = baseUrl?.replace(/\/$/, '') ?? 'https://integrate.api.nvidia.com/v1';
      if (!apiKey?.startsWith('nvapi-')) {
        return { ok: false, message: 'NVIDIA API keys must start with "nvapi-". Get yours at build.nvidia.com.' };
      }
      const res = await fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8_000),
      });
      if (res.status === 401) return { ok: false, message: 'Invalid NVIDIA API key — check your nvapi- key at build.nvidia.com' };
      if (res.status === 403) return { ok: false, message: 'NVIDIA API key does not have access to this endpoint' };
      if (!res.ok)           return { ok: false, message: `NVIDIA NIM returned HTTP ${res.status}` };
      // Check if the requested model is available
      const data = await res.json() as { data?: { id: string }[] };
      const found = data.data?.some(m => m.id === model || m.id.includes(model.split('/').pop() ?? model));
      return {
        ok: true,
        message: found
          ? `NVIDIA NIM key verified — model "${model}" available`
          : `NVIDIA NIM key verified — model "${model}" not found in your plan; check build.nvidia.com`,
        latencyMs: Date.now() - start,
      };
    }

    if (provider === 'openai' || provider === 'custom') {
      const base = baseUrl?.replace(/\/$/, '') ?? 'https://api.openai.com/v1';
      const res = await fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${apiKey ?? ''}` },
        signal: AbortSignal.timeout(6_000),
      });
      if (res.status === 401) return { ok: false, message: 'Invalid API key' };
      if (!res.ok)           return { ok: false, message: `Provider returned HTTP ${res.status}` };
      return { ok: true, message: 'API key verified and endpoint reachable', latencyMs: Date.now() - start };
    }

    return { ok: false, message: `Unknown provider: ${provider}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Connection failed: ${msg}` };
  }
}
