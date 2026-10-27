import { and, eq, isNull, ne } from 'drizzle-orm';
import { db, providerCredentials, projects, workspaces } from '@aria/db';
import { AppError } from '../../middleware/error.middleware';
import { decryptSecret, encryptSecret } from '../crypto.service';
import { getPgPool } from '../db.client';
import { defaultTierModels } from '../modelTiers';
import type { LlmProviderId } from '../llmProvider.service';
import { getProvider, isProviderId, providersForTier } from './registry';
import type {
  BinaryStatus,
  ConnectionStatus,
  CredentialPublic,
  ProviderId,
  ProviderTier,
} from './types';

export interface ResolvedCredential {
  id: string;
  provider: ProviderId;
  label: string;
  apiKey: string | null;
  baseUrl: string | null;
  model: string;
  connectionStatus: ConnectionStatus;
  binaryStatus: BinaryStatus;
}

function toPublic(row: typeof providerCredentials.$inferSelect): CredentialPublic {
  const adapter = getProvider(row.provider);
  const catalog = Array.isArray(row.catalogJson)
    ? (row.catalogJson as unknown[]).map((item) => (typeof item === 'string' ? item : (item as { id?: string })?.id)).filter((id): id is string => Boolean(id))
    : [];
  return {
    id: row.id,
    provider: (isProviderId(row.provider) ? row.provider : 'cursor') as ProviderId,
    label: row.label,
    baseUrl: row.baseUrl ?? null,
    connectionStatus: row.connectionStatus as ConnectionStatus,
    lastTestedAt: row.lastTestedAt?.toISOString() ?? null,
    lastError: row.lastError ?? null,
    binaryStatus: row.binaryStatus as BinaryStatus,
    retiredAt: row.retiredAt?.toISOString() ?? null,
    catalog,
    canPlan: adapter?.canPlan ?? true,
    canCode: adapter?.canCode ?? false,
    installSteps: adapter?.installSteps ?? [],
    hasApiKey: Boolean(row.apiKeyEncrypted),
  };
}

function assertNoSecrets(payload: unknown): void {
  const text = JSON.stringify(payload);
  if (/gcm:v2:|scrypt:v1:|api_key_encrypted|apiKeyEncrypted|extra_encrypted/i.test(text)) {
    throw new AppError('Serializer leaked a secret', 500, 'SECRET_LEAK');
  }
}

export async function listCatalog(tier?: ProviderTier) {
  const adapters = tier ? providersForTier(tier) : providersForTier('planning');
  const coding = new Set(providersForTier('coding').map((a) => a.id));
  return adapters.map((adapter) => ({
    id: adapter.id,
    label: adapter.label,
    canPlan: adapter.canPlan,
    canCode: coding.has(adapter.id),
    needsApiKey: adapter.needsApiKey,
    defaultModel: adapter.defaultModel,
    binary: adapter.binary ?? null,
    installSteps: adapter.installSteps,
    envKeyHint: adapter.envKeyHint ?? null,
    runtime: adapter.runtime,
  }));
}

export async function listCredentials(workspaceId: string): Promise<CredentialPublic[]> {
  const rows = await db.query.providerCredentials.findMany({
    where: eq(providerCredentials.workspaceId, workspaceId),
  });
  const out = rows.map(toPublic);
  assertNoSecrets(out);
  return out;
}

export async function createCredential(
  workspaceId: string,
  input: { provider: string; label?: string; apiKey?: string; baseUrl?: string; model?: string },
): Promise<CredentialPublic> {
  if (!isProviderId(input.provider)) throw new AppError('Unknown provider', 400, 'VALIDATION_ERROR');
  const adapter = getProvider(input.provider)!;
  if (adapter.needsApiKey && !input.apiKey?.trim()) throw new AppError('API key is required', 400, 'VALIDATION_ERROR');
  const label = (input.label?.trim() || 'default').slice(0, 80);
  const binary = await adapter.detectBinary();
  try {
    const [row] = await db.insert(providerCredentials).values({
      workspaceId,
      provider: input.provider,
      label,
      apiKeyEncrypted: input.apiKey
        ? encryptSecret(input.apiKey, { workspaceId, column: 'provider_credentials.api_key_encrypted' })
        : null,
      baseUrl: input.baseUrl ?? null,
      connectionStatus: 'untested',
      binaryStatus: binary.status,
      catalogJson: [],
    }).returning();
    return toPublic(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (/unique|duplicate/i.test(message)) {
      throw new AppError(`A ${input.provider} credential labelled "${label}" already exists`, 409, 'CONFLICT');
    }
    throw err;
  }
}

async function ownedCredential(workspaceId: string, credentialId: string) {
  const row = await db.query.providerCredentials.findFirst({
    where: and(eq(providerCredentials.id, credentialId), eq(providerCredentials.workspaceId, workspaceId)),
  });
  if (!row) throw new AppError('Credential not found', 404, 'NOT_FOUND');
  return row;
}

export async function testCredential(
  workspaceId: string,
  credentialId: string,
  override?: { apiKey?: string; model?: string },
): Promise<{ result: Awaited<ReturnType<NonNullable<ReturnType<typeof getProvider>>['testConnection']>>; credential: CredentialPublic }> {
  const row = await ownedCredential(workspaceId, credentialId);
  if (row.retiredAt) throw new AppError('Credential is retired', 409, 'CONFLICT');
  const adapter = getProvider(row.provider);
  if (!adapter) throw new AppError('Unknown provider', 400, 'VALIDATION_ERROR');
  const apiKey = override?.apiKey
    ?? (row.apiKeyEncrypted
      ? decryptSecret(row.apiKeyEncrypted, { workspaceId, column: 'provider_credentials.api_key_encrypted' })
      : null);
  const model = override?.model || adapter.defaultModel;
  const binary = await adapter.detectBinary();
  const result = await adapter.testConnection({ apiKey, baseUrl: row.baseUrl, model });
  const status: ConnectionStatus = result.ok ? 'ok' : 'failed';
  const catalog = result.models ?? [];
  const [updated] = await db.update(providerCredentials).set({
    connectionStatus: status,
    lastTestedAt: new Date(),
    lastError: result.ok ? null : result.message,
    binaryStatus: binary.status,
    catalogJson: catalog,
    catalogRefreshedAt: result.ok ? new Date() : row.catalogRefreshedAt,
    ...(override?.apiKey ? {
      apiKeyEncrypted: encryptSecret(override.apiKey, { workspaceId, column: 'provider_credentials.api_key_encrypted' }),
    } : {}),
    updatedAt: new Date(),
  }).where(eq(providerCredentials.id, row.id)).returning();

  if (!result.ok) {
    await maybeFailover(workspaceId, row.id, row.provider as ProviderId);
  }

  const credential = toPublic(updated);
  const payload = { result: { ...result, binaryStatus: binary.status, installSteps: binary.installSteps }, credential };
  assertNoSecrets(payload);
  return payload;
}

export async function activateCredential(
  workspaceId: string,
  credentialId: string,
  tier: ProviderTier,
  projectId?: string,
): Promise<{ activePlanningCredentialId: string | null; activeCodingCredentialId: string | null }> {
  const row = await ownedCredential(workspaceId, credentialId);
  if (row.retiredAt) throw new AppError('Cannot activate a retired credential', 409, 'CONFLICT');
  if (row.connectionStatus !== 'ok') {
    throw new AppError('Test Connection must succeed before activate', 409, 'TEST_REQUIRED');
  }
  const adapter = getProvider(row.provider);
  if (!adapter) throw new AppError('Unknown provider', 400, 'VALIDATION_ERROR');
  if (tier === 'planning' && !adapter.canPlan) throw new AppError('Provider cannot plan', 400, 'VALIDATION_ERROR');
  if (tier === 'coding' && !adapter.canCode) throw new AppError('Provider cannot code', 400, 'VALIDATION_ERROR');
  if (tier === 'coding') {
    const binary = await adapter.detectBinary();
    await db.update(providerCredentials).set({ binaryStatus: binary.status, updatedAt: new Date() }).where(eq(providerCredentials.id, row.id));
    if (adapter.binary && binary.status !== 'ok') {
      throw new AppError(`Install ${adapter.binary} before activating for coding`, 409, 'BINARY_MISSING');
    }
  }

  if (projectId) {
    await assertProject(workspaceId, projectId);
    await db.update(projects).set({
      ...(tier === 'planning' ? { planningCredentialId: row.id } : { codingCredentialId: row.id }),
      updatedAt: new Date(),
    }).where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)));
  }

  const patch = tier === 'planning'
    ? { activePlanningCredentialId: row.id }
    : { activeCodingCredentialId: row.id };
  await db.update(workspaces).set({ ...patch, updatedAt: new Date() }).where(eq(workspaces.id, workspaceId));

  if (tier === 'planning') {
    await syncLegacyLlm(workspaceId, row);
  }

  const workspace = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  return {
    activePlanningCredentialId: workspace?.activePlanningCredentialId ?? null,
    activeCodingCredentialId: workspace?.activeCodingCredentialId ?? null,
  };
}

export async function retireCredential(workspaceId: string, credentialId: string): Promise<CredentialPublic> {
  const row = await ownedCredential(workspaceId, credentialId);
  const workspace = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  if (workspace?.activePlanningCredentialId === row.id || workspace?.activeCodingCredentialId === row.id) {
    throw new AppError('Deactivate before retiring an active credential', 409, 'CONFLICT');
  }
  const [updated] = await db.update(providerCredentials).set({
    retiredAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(providerCredentials.id, row.id)).returning();
  return toPublic(updated);
}

export async function resolveActiveCredential(
  workspaceId: string,
  tier: ProviderTier,
  projectId?: string,
): Promise<ResolvedCredential | null> {
  let credentialId: string | null = null;
  if (projectId) {
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)),
    });
    credentialId = (tier === 'planning' ? project?.planningCredentialId : project?.codingCredentialId) ?? null;
  }
  if (!credentialId) {
    const workspace = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
    credentialId = (tier === 'planning' ? workspace?.activePlanningCredentialId : workspace?.activeCodingCredentialId) ?? null;
  }
  if (!credentialId) return null;
  const row = await db.query.providerCredentials.findFirst({ where: eq(providerCredentials.id, credentialId) });
  if (!row || row.retiredAt || row.workspaceId !== workspaceId) return null;
  const adapter = getProvider(row.provider);
  const model = adapter?.defaultModel
    ?? defaultTierModels(row.provider as LlmProviderId).top;
  return {
    id: row.id,
    provider: (isProviderId(row.provider) ? row.provider : 'cursor') as ProviderId,
    label: row.label,
    apiKey: row.apiKeyEncrypted
      ? decryptSecret(row.apiKeyEncrypted, { workspaceId, column: 'provider_credentials.api_key_encrypted' })
      : null,
    baseUrl: row.baseUrl ?? null,
    model,
    connectionStatus: row.connectionStatus as ConnectionStatus,
    binaryStatus: row.binaryStatus as BinaryStatus,
  };
}

export async function setupCredentialsReady(workspaceId: string): Promise<{
  ok: boolean;
  planning: boolean;
  coding: boolean;
  missing: string[];
}> {
  const workspace = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  const planningId = workspace?.activePlanningCredentialId;
  const codingId = workspace?.activeCodingCredentialId;
  const planning = planningId
    ? await db.query.providerCredentials.findFirst({ where: eq(providerCredentials.id, planningId) })
    : null;
  const coding = codingId
    ? await db.query.providerCredentials.findFirst({ where: eq(providerCredentials.id, codingId) })
    : null;
  const missing: string[] = [];
  const planningOk = Boolean(planning && !planning.retiredAt && planning.connectionStatus === 'ok');
  if (!planningOk) missing.push('planning');
  let codingOk = Boolean(coding && !coding.retiredAt && coding.connectionStatus === 'ok');
  if (codingOk && coding) {
    const adapter = getProvider(coding.provider);
    if (adapter?.binary && coding.binaryStatus !== 'ok') {
      codingOk = false;
      missing.push('coding_binary');
    }
  }
  if (!codingOk && !missing.includes('coding_binary')) missing.push('coding');
  return { ok: planningOk && codingOk, planning: planningOk, coding: codingOk, missing };
}

export async function completeSetup(workspaceId: string): Promise<void> {
  const ready = await setupCredentialsReady(workspaceId);
  if (!ready.ok) {
    throw new AppError(
      `Activate tested credentials for: ${ready.missing.join(', ')}`,
      409,
      'SETUP_INCOMPLETE',
    );
  }
}

/** When the active credential fails, promote another ok key for the same provider; else pause coding queue. */
export async function maybeFailover(workspaceId: string, failedId: string, provider: ProviderId): Promise<void> {
  const workspace = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  if (!workspace) return;
  const isActive = workspace.activePlanningCredentialId === failedId || workspace.activeCodingCredentialId === failedId;
  if (!isActive) return;

  const candidates = await db.query.providerCredentials.findMany({
    where: and(
      eq(providerCredentials.workspaceId, workspaceId),
      eq(providerCredentials.provider, provider),
      eq(providerCredentials.connectionStatus, 'ok'),
      isNull(providerCredentials.retiredAt),
      ne(providerCredentials.id, failedId),
    ),
  });
  const next = candidates[0];
  if (next) {
    if (workspace.activePlanningCredentialId === failedId) {
      await activateCredential(workspaceId, next.id, 'planning');
    }
    if (workspace.activeCodingCredentialId === failedId) {
      await activateCredential(workspaceId, next.id, 'coding');
    }
    return;
  }

  // No healthy spare — pause queued coding runs (no silent poison).
  if (workspace.activeCodingCredentialId === failedId) {
    await getPgPool().query(
      `UPDATE agent_runs SET status = 'blocked', blocked_reason = 'provider_unhealthy', updated_at = NOW()
       WHERE workspace_id = $1::uuid AND status = 'queued'
         AND activity IN ('develop','review','fix','qa')`,
      [workspaceId],
    );
  }
}

async function syncLegacyLlm(workspaceId: string, row: typeof providerCredentials.$inferSelect): Promise<void> {
  const adapter = getProvider(row.provider);
  const model = adapter?.defaultModel ?? 'auto';
  const tiers = defaultTierModels(row.provider as LlmProviderId, model);
  await db.update(workspaces).set({
    llmProvider: row.provider,
    llmBaseUrl: row.baseUrl,
    llmApiKeyEncrypted: row.apiKeyEncrypted
      ? encryptSecret(
        decryptSecret(row.apiKeyEncrypted, { workspaceId, column: 'provider_credentials.api_key_encrypted' }),
        { workspaceId, column: 'llm_api_key_encrypted' },
      )
      : null,
    llmModel: model,
    llmTierModels: tiers,
    llmModelCatalog: Array.isArray(row.catalogJson) ? row.catalogJson : [tiers.top, tiers.auto],
    llmCatalogRefreshedAt: row.catalogRefreshedAt ?? new Date(),
    updatedAt: new Date(),
  }).where(eq(workspaces.id, workspaceId));
}

async function assertProject(workspaceId: string, projectId: string): Promise<void> {
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)),
  });
  if (!project) throw new AppError('Project not found', 404, 'NOT_FOUND');
}

/** Upsert from legacy llm-config save so existing setup still creates a credential row. */
export async function upsertFromLegacyLlm(
  workspaceId: string,
  input: { provider: string; apiKey?: string | null; baseUrl?: string | null; model: string; catalog?: string[] },
): Promise<void> {
  if (!isProviderId(input.provider)) return;
  const label = 'default';
  const existing = await db.query.providerCredentials.findFirst({
    where: and(
      eq(providerCredentials.workspaceId, workspaceId),
      eq(providerCredentials.provider, input.provider),
      eq(providerCredentials.label, label),
    ),
  });
  const adapter = getProvider(input.provider)!;
  const binary = await adapter.detectBinary();
  const apiKeyEncrypted = input.apiKey
    ? encryptSecret(input.apiKey, { workspaceId, column: 'provider_credentials.api_key_encrypted' })
    : existing?.apiKeyEncrypted ?? null;
  let id = existing?.id;
  if (existing) {
    await db.update(providerCredentials).set({
      apiKeyEncrypted,
      baseUrl: input.baseUrl ?? null,
      connectionStatus: 'ok',
      lastTestedAt: new Date(),
      lastError: null,
      binaryStatus: binary.status,
      catalogJson: input.catalog ?? [],
      catalogRefreshedAt: new Date(),
      retiredAt: null,
      updatedAt: new Date(),
    }).where(eq(providerCredentials.id, existing.id));
  } else {
    const [row] = await db.insert(providerCredentials).values({
      workspaceId,
      provider: input.provider,
      label,
      apiKeyEncrypted,
      baseUrl: input.baseUrl ?? null,
      connectionStatus: 'ok',
      lastTestedAt: new Date(),
      binaryStatus: binary.status,
      catalogJson: input.catalog ?? [],
      catalogRefreshedAt: new Date(),
    }).returning();
    id = row.id;
  }
  if (!id) return;
  // First choice becomes the project/workspace default — no product-default provider.
  const workspace = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  const patch: Partial<typeof workspaces.$inferInsert> = {};
  if (!workspace?.activePlanningCredentialId && adapter.canPlan) patch.activePlanningCredentialId = id;
  if (!workspace?.activeCodingCredentialId && adapter.canCode && binary.status !== 'missing') {
    patch.activeCodingCredentialId = id;
  }
  if (Object.keys(patch).length) {
    await db.update(workspaces).set({ ...patch, updatedAt: new Date() }).where(eq(workspaces.id, workspaceId));
  }
}
