import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { businessFlows, db, projects, skills, teamMembers, teams } from '@aria/db';
import { AppError } from '../../middleware/error.middleware';
import type { CompanyMix, FlowAssignment, GeneratedAgent } from '../companyGenerator';
import { assertOwnerInvariant, type FlowLayer, type FlowRole } from '../flows/flowOwners';

function sqlRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

export async function applyCompanyRoster(input: {
  projectId: string;
  size: number;
  mix: CompanyMix;
  agents: GeneratedAgent[];
  assignments: FlowAssignment[];
  planningModel: string;
  source: 'ai' | 'template';
  runId?: string | null;
  force?: boolean;
}): Promise<void> {
  const { projectId, agents, assignments } = input;
  const byFlow = new Map<string, Array<{ agentId: string; layer: FlowLayer; role: FlowRole }>>();
  for (const assignment of assignments) {
    const layer = assignment.layer as FlowLayer;
    const role = assignment.role as FlowRole;
    const list = byFlow.get(assignment.flowId) ?? [];
    list.push({ agentId: assignment.agentTempId, layer, role });
    byFlow.set(assignment.flowId, list);
  }
  for (const owners of byFlow.values()) assertOwnerInvariant(owners);
  await db.transaction(async (tx) => {
    const usage = await tx.execute<{ sessions: string; tickets: string }>(sql`
      SELECT
        (SELECT COUNT(*) FROM sessions WHERE project_id = ${projectId}::uuid) AS sessions,
        (SELECT COUNT(*) FROM tickets WHERE project_id = ${projectId}::uuid) AS tickets
    `);
    const counts = sqlRows<{ sessions: string; tickets: string }>(usage)[0];
    if (counts && (Number(counts.sessions) > 0 || Number(counts.tickets) > 0) && !input.force) {
      throw new AppError('Regeneration would remove sessions or tickets. Send force: true to continue.', 409, 'COMPANY_IN_USE');
    }
    await tx.execute(sql`DELETE FROM flow_owners WHERE flow_id IN (SELECT id FROM business_flows WHERE project_id = ${projectId}::uuid)`);
    await tx.execute(sql`UPDATE skills SET reporting_manager_id = NULL, backup_agent_id = NULL WHERE project_id = ${projectId}::uuid`);
    await tx.execute(sql`DELETE FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE project_id = ${projectId}::uuid)`);
    await tx.execute(sql`DELETE FROM skills WHERE project_id = ${projectId}::uuid`);
    await tx.execute(sql`DELETE FROM teams WHERE project_id = ${projectId}::uuid`);

    const deptIds = new Map<string, string>();
    for (const department of new Set(agents.map((agent) => agent.department))) {
      const [team] = await tx.insert(teams).values({
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
      await tx.insert(skills).values({
        id,
        projectId,
        teamId: deptIds.get(agent.department) ?? null,
        slug: agent.slug,
        realName: agent.realName,
        roleTitle: agent.roleTitle,
        roleKey: agent.roleKey,
        name: agent.realName,
        role: agent.roleTitle,
        model: input.planningModel,
        department: agent.department,
        hierarchyLevel: agent.hierarchyLevel,
        description: agent.description,
        instructions: agent.instructions,
        ownedDomains: agent.skills,
        enabled: agent.enabled,
        status: 'active',
        riskClass: 'B',
        idleMode: 'learning',
      });
    }

    for (const agent of agents) {
      const id = idByTemp.get(agent.tempId);
      if (!id) continue;
      await tx.update(skills).set({
        reportingManagerId: agent.managerTempId ? idByTemp.get(agent.managerTempId) ?? null : null,
        backupAgentId: agent.backupTempId ? idByTemp.get(agent.backupTempId) ?? null : null,
        updatedAt: new Date(),
      }).where(eq(skills.id, id));
      const teamId = deptIds.get(agent.department);
      if (teamId) {
        const memberRole = agent.hierarchyLevel <= 3 ? 'lead' : agent.roleKey === 'scrum_master' ? 'scrum_master' : 'member';
        await tx.insert(teamMembers).values({ teamId, skillId: id, role: memberRole });
      }
    }

    for (const assignment of assignments) {
      const agentId = idByTemp.get(assignment.agentTempId);
      if (!agentId) continue;
      await tx.execute(sql`
        INSERT INTO flow_owners (flow_id, agent_id, layer, role)
        VALUES (${assignment.flowId}::uuid, ${agentId}::uuid, ${assignment.layer}, ${assignment.role})
        ON CONFLICT DO NOTHING
      `);
      await tx.update(businessFlows).set({ layer: assignment.layer, updatedAt: new Date() }).where(eq(businessFlows.id, assignment.flowId));
    }

    await tx.update(projects).set({
      companySize: input.size,
      companyMix: input.mix,
      companySource: input.source,
      companyRunId: input.runId ?? null,
      updatedAt: new Date(),
    }).where(eq(projects.id, projectId));
  });
}
