import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { analysisJobs, businessFlows, db, knowledgeMaps, projectRepos, projects, skills, teamMembers, workspaces } from '@aria/db';
import { AppError } from '../middleware/error.middleware';
import { generateCompany, type CompanyMix, type GeneratedAgent, type RoleKey } from './companyGenerator';
import { logger } from '../config/logger';
import { getPgPool } from './db.client';
import { loadWorkspaceLlm, providerId } from './guardedLlm.service';
import { applyCompanyRoster } from './activities/companyApply';
import { decorateFlows, removeAgent, setOwners, type FlowLayer } from './flows/flowOwners';
import { enqueue } from './runs/runQueue';
import { readTier, resolveModelRoute, taskTierMap, tierModelMap, type ModelTier, type TaskTierMap, type TierModelMap } from './modelTiers';

export interface AgentView {
  id: string;
  slug: string;
  realName: string;
  roleKey: string | null;
  roleTitle: string;
  department: string | null;
  hierarchyLevel: number;
  reportingManagerId: string | null;
  backupAgentId: string | null;
  instructions: string;
  description: string;
  skills: unknown;
  ownedFlowIds: unknown;
  enabled: boolean;
  planningTier: ModelTier | null;
  developmentTier: ModelTier | null;
  modelOverride: string | null;
}

async function ownedProject(projectId: string, workspaceId: string) {
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)),
  });
  if (!project) throw new AppError('Project not found', 404, 'NOT_FOUND');
  return project;
}

function toView(row: typeof skills.$inferSelect): AgentView {
  return {
    id: row.id,
    slug: row.slug,
    realName: row.realName,
    roleKey: row.roleKey ?? null,
    roleTitle: row.roleTitle,
    department: row.department ?? null,
    hierarchyLevel: row.hierarchyLevel,
    reportingManagerId: row.reportingManagerId ?? null,
    backupAgentId: row.backupAgentId ?? null,
    instructions: row.instructions,
    description: row.description,
    skills: row.ownedDomains,
    ownedFlowIds: [],
    enabled: row.enabled,
    planningTier: readTier(row.modelTaskTiers, 'planning'),
    developmentTier: readTier(row.modelTaskTiers, 'development'),
    modelOverride: row.modelOverride ?? null,
  };
}

async function workspaceChoice(workspaceId: string) {
  const row = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  return {
    provider: providerId(row?.llmProvider),
    model: row?.llmModel ?? null,
    tierModels: tierModelMap(row?.llmTierModels),
    catalog: Array.isArray(row?.llmModelCatalog) ? row.llmModelCatalog.filter((id): id is string => typeof id === 'string') : [],
  };
}

function routedModels(input: {
  provider: ReturnType<typeof providerId>;
  workspaceModel: string | null;
  projectTaskTiers: TaskTierMap;
  projectTierModels: TierModelMap;
  workspaceTierModels?: TierModelMap | null;
  agentTaskTiers?: TaskTierMap | null;
  agentModelOverride?: string | null;
}) {
  const shared = {
    provider: input.provider,
    workspaceModel: input.workspaceModel,
    projectTaskTiers: input.projectTaskTiers,
    projectTierModels: input.projectTierModels,
    workspaceTierModels: input.workspaceTierModels,
    agentTaskTiers: input.agentTaskTiers,
    agentModelOverride: input.agentModelOverride,
  };
  return {
    planningModel: resolveModelRoute({ ...shared, taskType: 'knowledge_map' }).modelId,
    developmentModel: resolveModelRoute({ ...shared, taskType: 'coding' }).modelId,
  };
}

export async function getCompany(projectId: string, workspaceId: string) {
  const project = await ownedProject(projectId, workspaceId);
  const choice = await workspaceChoice(workspaceId);
  const projectTaskTiers = taskTierMap(project.modelTaskTiers);
  const projectTierModels = tierModelMap(project.modelTierModels);
  const agents = await db.query.skills.findMany({ where: eq(skills.projectId, projectId) });
  const flows = await db.query.businessFlows.findMany({ where: eq(businessFlows.projectId, projectId) });
  const companyRoute = routedModels({ provider: choice.provider, workspaceModel: choice.model, projectTaskTiers, projectTierModels, workspaceTierModels: choice.tierModels });
  return {
    projectId,
    companySize: project.companySize ?? null,
    companyMix: project.companyMix ?? null,
    modelTiers: {
      planning: projectTaskTiers.planning ?? 'top',
      development: projectTaskTiers.development ?? 'auto',
      topModel: projectTierModels.top ?? null,
      autoModel: projectTierModels.auto ?? null,
      provider: choice.provider,
      planningModel: companyRoute.planningModel,
      developmentModel: companyRoute.developmentModel,
    },
    agents: agents.map((row) => ({
      ...toView(row),
      ...routedModels({
        provider: choice.provider,
        workspaceModel: choice.model,
        projectTaskTiers,
        projectTierModels,
        workspaceTierModels: choice.tierModels,
        agentTaskTiers: taskTierMap(row.modelTaskTiers),
        agentModelOverride: row.modelOverride,
      }),
    })),
    flows: await decorateFlows(flows.map((flow) => ({
      id: flow.id,
      flowKey: flow.flowKey,
      name: flow.name,
      kind: flow.kind,
      description: flow.description,
      entryPoints: flow.entryPoints,
    }))),
  };
}

export async function getKnowledge(projectId: string, workspaceId: string) {
  await ownedProject(projectId, workspaceId);
  const stored = await db.query.knowledgeMaps.findFirst({ where: eq(knowledgeMaps.projectId, projectId) });
  const flows = await db.query.businessFlows.findMany({ where: eq(businessFlows.projectId, projectId) });
  const jobs = await db.query.analysisJobs.findMany({ where: eq(analysisJobs.projectId, projectId) });
  return {
    projectId,
    map: stored ? {
      id: stored.id,
      summary: stored.summary,
      source: stored.source,
      techStack: stored.techStack,
      modules: stored.modules,
      dataModel: stored.dataModel,
      apis: stored.apis,
    } : null,
    flows: await decorateFlows(flows.map((flow) => ({
      id: flow.id,
      flowKey: flow.flowKey,
      name: flow.name,
      kind: flow.kind,
      description: flow.description,
      entryPoints: flow.entryPoints,
    }))),
    jobs: jobs.map((job) => ({
      id: job.id,
      status: job.status,
      resultSummary: job.resultSummary ?? null,
      errorMessage: job.errorMessage ?? null,
    })),
  };
}

export async function updateModelTiers(projectId: string, workspaceId: string, patch: {
  planning: ModelTier;
  development: ModelTier;
  topModel?: string | null;
  autoModel?: string | null;
}) {
  const project = await ownedProject(projectId, workspaceId);
  const choice = await workspaceChoice(workspaceId);
  for (const id of [patch.topModel, patch.autoModel]) {
    if (id && choice.catalog.length > 0 && !choice.catalog.includes(id)) {
      throw new AppError(`Model ${id} is not in the provider catalog from Test Connection`, 422, 'MODEL_NOT_VALIDATED');
    }
  }
  const models = tierModelMap(project.modelTierModels);
  if (patch.topModel === null) delete models.top;
  else if (patch.topModel) models.top = patch.topModel;
  if (patch.autoModel === null) delete models.auto;
  else if (patch.autoModel) models.auto = patch.autoModel;
  await db.update(projects).set({
    modelTaskTiers: { planning: patch.planning, development: patch.development },
    modelTierModels: models,
    updatedAt: new Date(),
  }).where(eq(projects.id, projectId));
  return getCompany(projectId, workspaceId);
}

export async function generateProjectCompany(
  projectId: string,
  workspaceId: string,
  size: number,
  mix: CompanyMix,
  tiers?: { planning: ModelTier; development: ModelTier; topModel?: string; autoModel?: string },
  force = false,
) {
  if (tiers) await updateModelTiers(projectId, workspaceId, tiers);
  const project = await ownedProject(projectId, workspaceId);
  const flowRows = await db.query.businessFlows.findMany({ where: eq(businessFlows.projectId, projectId) });
  const choice = await workspaceChoice(workspaceId);
  const planningModel = resolveModelRoute({
    provider: choice.provider,
    taskType: 'company_generation',
    workspaceModel: choice.model,
    projectTaskTiers: taskTierMap(project.modelTaskTiers),
    projectTierModels: tierModelMap(project.modelTierModels),
    workspaceTierModels: choice.tierModels,
  }).modelId;
  const usage = await getPgPool().query<{ sessions: string; tickets: string }>(
    `SELECT
       (SELECT COUNT(*) FROM sessions WHERE project_id = $1::uuid) AS sessions,
       (SELECT COUNT(*) FROM tickets WHERE project_id = $1::uuid) AS tickets`,
    [projectId],
  );
  const sessions = Number(usage.rows[0]?.sessions ?? 0);
  const tickets = Number(usage.rows[0]?.tickets ?? 0);
  if (!force && (sessions > 0 || tickets > 0)) {
    throw new AppError('Regeneration would remove sessions or tickets. Send force: true to continue.', 409, 'COMPANY_IN_USE');
  }
  const generated = generateCompany({
    size,
    mix,
    seed: projectId,
    flows: flowRows.map((flow) => ({ id: flow.id, flowKey: flow.flowKey, name: flow.name, kind: flow.kind })),
  });
  const roster = {
    projectId,
    size,
    mix,
    agents: generated.agents,
    assignments: generated.flowAssignments,
    planningModel,
  };
  const llm = await loadWorkspaceLlm(workspaceId);
  if (!llm) {
    await applyCompanyRoster({ ...roster, source: 'template' });
    return { ...(await getCompany(projectId, workspaceId)), statusCode: 201 as const };
  }
  const queued = await enqueue({
    workspaceId,
    projectId,
    activity: 'company_generation',
    taskType: 'company_generation',
    runtime: llm.provider === 'cursor' ? 'cursor_local' : 'chat',
    idempotencyKey: `company:${projectId}:${Date.now()}`,
    input: { size, mix },
  });
  try {
    const { processRunById } = await import('./runs/runWorker');
    await processRunById(queued.id);
  } catch (err) {
    logger.info('Company run fell back to the template', {
      projectId,
      message: err instanceof Error ? err.message.slice(0, 180) : 'skipped',
    });
    await applyCompanyRoster({ ...roster, source: 'template', runId: queued.id });
  }
  const company = await getCompany(projectId, workspaceId);
  if (!company.agents.length) await applyCompanyRoster({ ...roster, source: 'template', runId: queued.id });
  return { ...(await getCompany(projectId, workspaceId)), statusCode: 202 as const, runId: queued.id };
}

function tierPatch(existing: unknown, patch: { planningTier?: ModelTier | null; developmentTier?: ModelTier | null }) {
  if (patch.planningTier === undefined && patch.developmentTier === undefined) return {};
  const next = taskTierMap(existing);
  if (patch.planningTier === null) delete next.planning;
  else if (patch.planningTier) next.planning = patch.planningTier;
  if (patch.developmentTier === null) delete next.development;
  else if (patch.developmentTier) next.development = patch.developmentTier;
  return { modelTaskTiers: Object.keys(next).length ? next : null };
}

export async function updateAgent(projectId: string, workspaceId: string, agentId: string, patch: {
  roleTitle?: string;
  description?: string;
  instructions?: string;
  department?: string;
  enabled?: boolean;
  realName?: string;
  planningTier?: ModelTier | null;
  developmentTier?: ModelTier | null;
  modelOverride?: string | null;
  reportingManagerId?: string | null;
  backupAgentId?: string | null;
}) {
  await ownedProject(projectId, workspaceId);
  const existing = await db.query.skills.findFirst({
    where: and(eq(skills.id, agentId), eq(skills.projectId, projectId)),
  });
  if (!existing) throw new AppError('Agent not found', 404, 'NOT_FOUND');
  if (patch.reportingManagerId) await assertSameProjectAgent(projectId, patch.reportingManagerId, 'Manager');
  if (patch.backupAgentId) await assertSameProjectAgent(projectId, patch.backupAgentId, 'Backup');
  if (patch.modelOverride) {
    const choice = await workspaceChoice(workspaceId);
    if (choice.catalog.length > 0 && !choice.catalog.includes(patch.modelOverride)) {
      throw new AppError(`Model ${patch.modelOverride} is not in the provider catalog from Test Connection`, 422, 'MODEL_NOT_VALIDATED');
    }
  }
  await db.update(skills).set({
    ...(patch.roleTitle !== undefined ? { roleTitle: patch.roleTitle, role: patch.roleTitle } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.instructions !== undefined ? { instructions: patch.instructions } : {}),
    ...(patch.department !== undefined ? { department: patch.department } : {}),
    ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    ...(patch.realName !== undefined ? { realName: patch.realName, name: patch.realName } : {}),
    ...tierPatch(existing.modelTaskTiers, patch),
    ...(patch.modelOverride !== undefined ? { modelOverride: patch.modelOverride } : {}),
    ...(patch.reportingManagerId !== undefined ? { reportingManagerId: patch.reportingManagerId } : {}),
    ...(patch.backupAgentId !== undefined ? { backupAgentId: patch.backupAgentId } : {}),
    updatedAt: new Date(),
  }).where(eq(skills.id, agentId));
  if (patch.enabled === false) {
    const { blockQueuedForAgent, cancelRunningForAgent } = await import('./runs/runQueue');
    await blockQueuedForAgent(agentId, 'agent_off');
    await cancelRunningForAgent(agentId);
  }
  const updated = await db.query.skills.findFirst({ where: eq(skills.id, agentId) });
  return toView(updated!);
}

export async function createAgent(projectId: string, workspaceId: string, input: {
  realName: string;
  roleTitle: string;
  roleKey: RoleKey;
  instructions: string;
  description?: string;
  managerId?: string | null;
}) {
  const project = await ownedProject(projectId, workspaceId);
  const choice = await workspaceChoice(workspaceId);
  const developmentModel = resolveModelRoute({
    provider: choice.provider,
    taskType: 'coding',
    workspaceModel: choice.model,
    projectTaskTiers: taskTierMap(project.modelTaskTiers),
    projectTierModels: tierModelMap(project.modelTierModels),
    workspaceTierModels: choice.tierModels,
  }).modelId;
  if (input.managerId) await assertSameProjectAgent(projectId, input.managerId, 'Manager');
  const slugBase = input.realName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || input.roleKey;
  const id = randomUUID();
  await db.insert(skills).values({
    id,
    projectId,
    slug: `${slugBase}-${id.slice(0, 8)}`,
    realName: input.realName,
    roleTitle: input.roleTitle,
    roleKey: input.roleKey,
    name: input.realName,
    role: input.roleTitle,
    model: developmentModel,
    hierarchyLevel: 5,
    department: 'Custom',
    description: input.description ?? '',
    instructions: input.instructions,
    reportingManagerId: input.managerId ?? null,
    enabled: true,
    status: 'active',
    riskClass: 'B',
    ownedDomains: [],
  });
  const created = await db.query.skills.findFirst({ where: eq(skills.id, id) });
  return toView(created!);
}

export async function deleteAgent(projectId: string, workspaceId: string, agentId: string) {
  await ownedProject(projectId, workspaceId);
  const existing = await db.query.skills.findFirst({
    where: and(eq(skills.id, agentId), eq(skills.projectId, projectId)),
  });
  if (!existing) throw new AppError('Agent not found', 404, 'NOT_FOUND');
  const managerId = existing.reportingManagerId;
  await removeAgent(agentId);
  await db.transaction(async (tx) => {
    await tx.update(skills).set({ reportingManagerId: managerId }).where(and(
      eq(skills.projectId, projectId),
      eq(skills.reportingManagerId, agentId),
    ));
    await tx.update(skills).set({ backupAgentId: null }).where(and(
      eq(skills.projectId, projectId),
      eq(skills.backupAgentId, agentId),
    ));
    await tx.delete(teamMembers).where(eq(teamMembers.skillId, agentId));
    await tx.delete(skills).where(eq(skills.id, agentId));
  });
}

async function assertSameProjectAgent(projectId: string, agentId: string, label: string): Promise<void> {
  const row = await db.query.skills.findFirst({
    where: and(eq(skills.id, agentId), eq(skills.projectId, projectId)),
  });
  if (!row) throw new AppError(`${label} is not an agent on this project`, 400, 'MANAGER_NOT_IN_PROJECT');
}

export async function assignFlow(projectId: string, workspaceId: string, flowId: string, patch: {
  ownerAgentId?: string | null;
  backupAgentId?: string | null;
}) {
  await ownedProject(projectId, workspaceId);
  const flow = await db.query.businessFlows.findFirst({
    where: and(eq(businessFlows.id, flowId), eq(businessFlows.projectId, projectId)),
  });
  if (!flow) throw new AppError('Flow not found', 404, 'NOT_FOUND');
  if (patch.ownerAgentId) await assertSameProjectAgent(projectId, patch.ownerAgentId, 'Owner');
  if (patch.backupAgentId) await assertSameProjectAgent(projectId, patch.backupAgentId, 'Backup');
  const layer = (flow.layer === 'frontend' || flow.layer === 'backend' || flow.layer === 'fullstack' ? flow.layer : 'fullstack') as FlowLayer;
  const next: Array<{ agentId: string; layer: FlowLayer; role: 'owner' | 'backup' }> = [];
  if (patch.ownerAgentId) next.push({ agentId: patch.ownerAgentId, layer, role: 'owner' });
  if (patch.backupAgentId) next.push({ agentId: patch.backupAgentId, layer, role: 'backup' });
  if (next.length) await setOwners(flowId, next);
  return getCompany(projectId, workspaceId);
}

export async function getSetupState(workspaceId: string) {
  const workspace = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  const project = await db.query.projects.findFirst({
    where: eq(projects.workspaceId, workspaceId),
    orderBy: [desc(projects.createdAt)],
  });
  const llmConfigured = Boolean(workspace?.llmProvider && (workspace.llmApiKeyEncrypted || workspace.llmProvider === 'ollama'));
  if (!project) {
    return { project: null, llmConfigured, repoCount: 0, knowledgeReady: false, summary: '', flows: [], jobs: [] };
  }
  const repos = await db.query.projectRepos.findMany({ where: eq(projectRepos.projectId, project.id) });
  const knowledge = await getKnowledge(project.id, workspaceId);
  const active = knowledge.jobs.some((job) => job.status === 'queued' || job.status === 'running');
  return {
    project: { id: project.id, name: project.name },
    llmConfigured,
    repoCount: repos.length,
    knowledgeReady: Boolean(knowledge.map) && !active,
    knowledge: {
      enrichment: active ? 'pending' as const : knowledge.map?.source === 'ai' ? 'ai' as const : 'template' as const,
    },
    summary: knowledge.map?.summary ?? '',
    flows: knowledge.flows,
    jobs: knowledge.jobs,
  };
}

export type { GeneratedAgent };
