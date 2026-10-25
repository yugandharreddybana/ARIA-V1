import { eq } from 'drizzle-orm';
import { db, workspaces } from '@aria/db';
import { loadWorkspaceLlm } from '../guardedLlm.service';
import { testProviderConnection } from '../llmProvider.service';
import { getPgPool } from '../db.client';
import { RunError } from '../runs/errors';
import type { AgentRunRow } from '../runs/runQueue';
import {
  resolveModelRoute,
  selectTierModels,
  taskClassOf,
  taskTierMap,
  tierModelMap,
  type CatalogEntry,
  type TaskType,
} from '../modelTiers';

const DAY_MS = 24 * 60 * 60 * 1000;

export function catalogLists(catalog: CatalogEntry[], id: string): boolean {
  return catalog.some((entry) => entry.id === id || entry.aliases?.includes(id));
}

export function catalogIsStale(refreshedAt: Date | null, now: number): boolean {
  if (!refreshedAt) return true;
  return now - refreshedAt.getTime() > DAY_MS;
}

function asCatalog(value: unknown): CatalogEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: CatalogEntry[] = [];
  for (const row of value) {
    if (typeof row === 'string' && row.trim()) entries.push({ id: row.trim() });
    else if (row && typeof row === 'object' && typeof (row as { id?: unknown }).id === 'string') {
      const record = row as { id: string; aliases?: unknown };
      const aliases = Array.isArray(record.aliases) ? record.aliases.filter((alias): alias is string => typeof alias === 'string') : [];
      entries.push({ id: record.id, aliases });
    }
  }
  return entries;
}

function isTaskType(value: string): value is TaskType {
  switch (value) {
    case 'knowledge_map':
    case 'company_generation':
    case 'sprint_planning':
    case 'architecture':
    case 'idea_analysis':
    case 'security_review':
    case 'code_review':
    case 'coding':
    case 'tests':
    case 'fixes':
    case 'docs':
      return true;
    default:
      return false;
  }
}

export async function resolveForRun(run: AgentRunRow, now = Date.now()): Promise<string> {
  const llm = await loadWorkspaceLlm(run.workspace_id);
  const taskType: TaskType = isTaskType(run.task_type) ? run.task_type : 'coding';
  if (!llm) return run.model_id || 'auto';
  const workspace = await db.query.workspaces.findFirst({ where: eq(workspaces.id, run.workspace_id) });
  const project = await getPgPool().query<{ model_task_tiers: unknown; model_tier_models: unknown }>(
    `SELECT model_task_tiers, model_tier_models FROM projects WHERE id = $1::uuid`,
    [run.project_id],
  );
  const pinRow = run.agent_id
    ? await getPgPool().query<{ model_override: string | null }>(`SELECT model_override FROM skills WHERE id = $1::uuid`, [run.agent_id])
    : { rows: [] as Array<{ model_override: string | null }> };
  const pin = pinRow.rows[0]?.model_override?.trim() || null;
  let catalog = asCatalog(workspace?.llmModelCatalog);
  const routed = resolveModelRoute({
    provider: llm.provider,
    taskType,
    workspaceModel: llm.model,
    projectTaskTiers: taskTierMap(project.rows[0]?.model_task_tiers),
    projectTierModels: tierModelMap(project.rows[0]?.model_tier_models),
    workspaceTierModels: tierModelMap(workspace?.llmTierModels),
    agentModelOverride: pin,
  }).modelId;
  const wanted = pin || routed;
  const stale = catalogIsStale(workspace?.llmCatalogRefreshedAt ? new Date(workspace.llmCatalogRefreshedAt) : null, now);
  if (stale || catalog.length === 0 || !catalogLists(catalog, wanted)) {
    try {
      const probed = await testProviderConnection(llm);
      if (probed.ok && probed.models && probed.models.length > 0) {
        catalog = probed.models.map((id) => ({ id }));
        const tiers = selectTierModels(llm.provider, catalog, llm.model);
        await db.update(workspaces).set({
          llmModelCatalog: catalog,
          llmTierModels: tiers,
          llmCatalogRefreshedAt: new Date(now),
          updatedAt: new Date(now),
        }).where(eq(workspaces.id, run.workspace_id));
      }
    } catch {
      // A failed refresh keeps the stored catalog. A missing pin still fails closed below.
    }
  }
  if (pin && !catalogLists(catalog, pin)) {
    throw new RunError('MODEL_UNAVAILABLE', `Pinned model ${pin} is not in the catalog`, false);
  }
  const freshRoute = resolveModelRoute({
    provider: llm.provider,
    taskType,
    workspaceModel: llm.model,
    projectTaskTiers: taskTierMap(project.rows[0]?.model_task_tiers),
    projectTierModels: tierModelMap(project.rows[0]?.model_tier_models),
    workspaceTierModels: catalog.length ? selectTierModels(llm.provider, catalog, llm.model) : tierModelMap(workspace?.llmTierModels),
    agentModelOverride: pin,
  });
  void taskClassOf(taskType);
  return freshRoute.modelId;
}
