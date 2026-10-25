import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { analysisJobs, businessFlows, db, knowledgeMaps, projects, skills, teamMembers, teams, workspaces } from '@aria/db';
import { AppError } from '../middleware/error.middleware';
import { generateCompany, type CompanyMix, type GeneratedAgent, type RoleKey } from './companyGenerator';
import { logger } from '../config/logger';
import { completeThroughGateway, loadWorkspaceLlm, providerId } from './guardedLlm.service';
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
    ownedFlowIds: row.ownedFlowIds,
    enabled: row.enabled,
    planningTier: readTier(row.modelTaskTiers, 'planning'),
    developmentTier: readTier(row.modelTaskTiers, 'development'),
    modelOverride: row.modelOverride ?? null,
  };
}

async function workspaceChoice(workspaceId: string) {
  const row = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  return { provider: providerId(row?.llmProvider), model: row?.llmModel ?? null };
}

function routedModels(input: {
  provider: ReturnType<typeof providerId>;
  workspaceModel: string | null;
  projectTaskTiers: TaskTierMap;
  projectTierModels: TierModelMap;
  agentTaskTiers?: TaskTierMap | null;
  agentModelOverride?: string | null;
}) {
  const shared = {
    provider: input.provider,
    workspaceModel: input.workspaceModel,
    projectTaskTiers: input.projectTaskTiers,
    projectTierModels: input.projectTierModels,
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
  const companyRoute = routedModels({ provider: choice.provider, workspaceModel: choice.model, projectTaskTiers, projectTierModels });
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
        agentTaskTiers: taskTierMap(row.modelTaskTiers),
        agentModelOverride: row.modelOverride,
      }),
    })),
    flows: flows.map((flow) => ({
      id: flow.id,
      flowKey: flow.flowKey,
      name: flow.name,
      kind: flow.kind,
      description: flow.description,
      entryPoints: flow.entryPoints,
      ownerAgentId: flow.ownerAgentId,
      backupAgentId: flow.backupAgentId,
    })),
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
      techStack: stored.techStack,
      modules: stored.modules,
      dataModel: stored.dataModel,
      apis: stored.apis,
    } : null,
    flows: flows.map((flow) => ({
      id: flow.id,
      flowKey: flow.flowKey,
      name: flow.name,
      kind: flow.kind,
      description: flow.description,
      entryPoints: flow.entryPoints,
      ownerAgentId: flow.ownerAgentId,
      backupAgentId: flow.backupAgentId,
    })),
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
  }).modelId;
  const { agents, flowOwners } = generateCompany({
    size,
    mix,
    seed: projectId,
    flows: flowRows.map((flow) => ({ id: flow.id, flowKey: flow.flowKey, name: flow.name, kind: flow.kind })),
  });

  await db.execute(sql`UPDATE business_flows SET owner_agent_id = NULL, backup_agent_id = NULL WHERE project_id = ${projectId}::uuid`);
  await db.execute(sql`UPDATE skills SET reporting_manager_id = NULL, backup_agent_id = NULL WHERE project_id = ${projectId}::uuid`);
  await db.execute(sql`DELETE FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE project_id = ${projectId}::uuid)`);
  await db.execute(sql`DELETE FROM skills WHERE project_id = ${projectId}::uuid`);
  await db.execute(sql`DELETE FROM teams WHERE project_id = ${projectId}::uuid`);

  const deptIds = new Map<string, string>();
  for (const department of new Set(agents.map((agent) => agent.department))) {
    const [team] = await db.insert(teams).values({
      id: randomUUID(),
      projectId,
      name: department,
      department,
    }).returning();
    deptIds.set(department, team.id);
  }

  const idByTemp = new Map<string, string>();
  for (const agent of agents) {
    const id = randomUUID();
    idByTemp.set(agent.tempId, id);
    await db.insert(skills).values({
      id,
      projectId,
      teamId: deptIds.get(agent.department) ?? null,
      slug: agent.slug,
      realName: agent.realName,
      roleTitle: agent.roleTitle,
      roleKey: agent.roleKey,
      name: agent.realName,
      role: agent.roleTitle,
      model: planningModel,
      department: agent.department,
      hierarchyLevel: agent.hierarchyLevel,
      description: agent.description,
      instructions: agent.instructions,
      ownedDomains: agent.skills,
      ownedFlowIds: agent.ownedFlowIds,
      enabled: true,
      status: 'active',
      riskClass: 'B',
      idleMode: 'learning',
    });
  }

  for (const agent of agents) {
    const id = idByTemp.get(agent.tempId);
    if (!id) continue;
    await db.update(skills).set({
      reportingManagerId: agent.managerTempId ? idByTemp.get(agent.managerTempId) ?? null : null,
      backupAgentId: agent.backupTempId ? idByTemp.get(agent.backupTempId) ?? null : null,
      updatedAt: new Date(),
    }).where(eq(skills.id, id));
    const teamId = deptIds.get(agent.department);
    if (teamId) {
      const memberRole = agent.hierarchyLevel <= 3 ? 'lead' : agent.roleKey === 'scrum_master' ? 'scrum_master' : 'member';
      await db.insert(teamMembers).values({ teamId, skillId: id, role: memberRole });
    }
  }

  for (const [flowId, owners] of flowOwners) {
    await db.update(businessFlows).set({
      ownerAgentId: idByTemp.get(owners.owner) ?? null,
      backupAgentId: owners.backup ? idByTemp.get(owners.backup) ?? null : null,
      updatedAt: new Date(),
    }).where(and(eq(businessFlows.id, flowId), eq(businessFlows.projectId, projectId)));
  }

  await db.update(projects).set({
    companySize: size,
    companyMix: mix,
    updatedAt: new Date(),
  }).where(eq(projects.id, projectId));

  const llm = await loadWorkspaceLlm(workspaceId);
  if (llm) {
    const roster = agents.map((agent) => agent.roleTitle).join(', ');
    try {
      await completeThroughGateway({
        workspaceId,
        projectId,
        agentId: 'company-generator',
        skillSlug: 'ceo',
        taskType: 'company_generation',
        config: llm,
        messages: [
          { role: 'system', content: 'Reply with one sentence about this company plan. Do not invent repositories or secrets.' },
          { role: 'user', content: `Size ${size}. Roles: ${roster}.` },
        ],
      });
    } catch (err) {
      logger.info('Company planning model was not completed', {
        projectId,
        message: err instanceof Error ? err.message.slice(0, 180) : 'skipped',
      });
    }
  }

  return getCompany(projectId, workspaceId);
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
}) {
  await ownedProject(projectId, workspaceId);
  const existing = await db.query.skills.findFirst({
    where: and(eq(skills.id, agentId), eq(skills.projectId, projectId)),
  });
  if (!existing) throw new AppError('Agent not found', 404, 'NOT_FOUND');
  await db.update(skills).set({
    ...(patch.roleTitle !== undefined ? { roleTitle: patch.roleTitle, role: patch.roleTitle } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.instructions !== undefined ? { instructions: patch.instructions } : {}),
    ...(patch.department !== undefined ? { department: patch.department } : {}),
    ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    ...(patch.realName !== undefined ? { realName: patch.realName, name: patch.realName } : {}),
    ...tierPatch(existing.modelTaskTiers, patch),
    ...(patch.modelOverride !== undefined ? { modelOverride: patch.modelOverride } : {}),
    updatedAt: new Date(),
  }).where(eq(skills.id, agentId));
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
  }).modelId;
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
    ownedFlowIds: [],
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
  await db.update(skills).set({ reportingManagerId: managerId }).where(and(
    eq(skills.projectId, projectId),
    eq(skills.reportingManagerId, agentId),
  ));
  await db.update(skills).set({ backupAgentId: null }).where(and(
    eq(skills.projectId, projectId),
    eq(skills.backupAgentId, agentId),
  ));
  await db.update(businessFlows).set({ ownerAgentId: null }).where(eq(businessFlows.ownerAgentId, agentId));
  await db.update(businessFlows).set({ backupAgentId: null }).where(eq(businessFlows.backupAgentId, agentId));
  await db.delete(teamMembers).where(eq(teamMembers.skillId, agentId));
  await db.delete(skills).where(eq(skills.id, agentId));
}

export type { GeneratedAgent };
