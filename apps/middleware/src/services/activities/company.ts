import { z } from 'zod';
import { getPgPool } from '../db.client';
import { applyCompanyRoster } from './companyApply';
import { acceptCompanyPlan, type PlannedAgent } from './companyRoster';
import { generateCompany, ROLE_KEYS, type CompanyMix } from '../companyGenerator';
import { reasoningFor } from '../models/reasoning';
import { RunError } from '../runs/errors';
import type { AgentRunRow } from '../runs/runQueue';
import { append } from '../runs/runLogs';
import { emitProject } from '../runs/hub';

const companySchema = z.object({
  agents: z.array(z.object({
    roleKey: z.string(),
    realName: z.string(),
    roleTitle: z.string(),
    department: z.string(),
    managerIndex: z.number().int().nullable(),
    backupIndex: z.number().int().nullable().default(null),
    description: z.string().default(''),
    instructions: z.string().default(''),
    skills: z.array(z.string()).default([]),
    flows: z.array(z.object({
      flowKey: z.string(),
      layer: z.string(),
      role: z.string(),
    })).default([]),
  })).min(1),
});

const EMPTY_MIX: CompanyMix = { business: 0, qa: 0, frontend: 0, backend: 0, fullstack: 0, junior: 0, aiml: 0, devops: 0, security: 0 };

export async function executeCompany(run: AgentRunRow): Promise<{ outputSource: 'ai' | 'template'; text: string; tokensTotal?: number }> {
  const size = Number(run.input.size ?? 8);
  const mix = (run.input.mix as CompanyMix | undefined) ?? { ...EMPTY_MIX, business: 1, qa: 1, frontend: 1, backend: 1, fullstack: 1 };
  const safeSize = Number.isInteger(size) ? size : 8;
  const flows = await getPgPool().query<{ id: string; flow_key: string; name: string; kind: string }>(
    `SELECT id, flow_key, name, kind FROM business_flows WHERE project_id = $1::uuid`,
    [run.project_id],
  );
  const flowRefs = flows.rows.map((flow) => ({ id: flow.id, flowKey: flow.flow_key, name: flow.name, kind: flow.kind }));
  const template = generateCompany({ size: safeSize, mix, seed: run.project_id, flows: flowRefs });
  const map = await getPgPool().query<{ summary: string }>(
    `SELECT summary FROM knowledge_maps WHERE project_id = $1::uuid ORDER BY updated_at DESC LIMIT 1`,
    [run.project_id],
  );
  const model = await reasoningFor(run.workspace_id);
  const marker = process.env.NODE_ENV === 'production' || typeof run.input.fixture !== 'string' ? '' : `\n${run.input.fixture}`;
  let accepted: Awaited<ReturnType<typeof acceptCompanyPlan>> = null;
  let reason = 'planner did not return a roster';
  for (let attempt = 1; attempt <= 2 && !accepted; attempt++) {
    try {
      const planned = await model.plan({
        run,
        schema: companySchema,
        tools: 'none',
        instructions: [
          'Return a company roster as JSON with an agents array.',
          `Seat count must be ${safeSize}. Mix ${JSON.stringify(mix)}.`,
          `roleKey must be one of: ${ROLE_KEYS.join(', ')}.`,
          `Known flows: ${flowRefs.map((flow) => flow.flowKey).join(', ') || 'none'}.`,
          `Knowledge map: ${(map.rows[0]?.summary || 'none').slice(0, 1500)}`,
          'One CEO with a null managerIndex. Names unique. Manager graph acyclic.',
          'Each agent: roleKey, realName, roleTitle, department, managerIndex, backupIndex, description, instructions, skills, flows.',
          marker,
        ].join('\n'),
        onLog: (kind, text) => { void append(run.id, kind === 'error' ? 'error' : 'status', text); },
      });
      accepted = await acceptCompanyPlan({
        size: safeSize,
        mix,
        seed: run.project_id,
        flows: flowRefs,
        agents: planned.value.agents as PlannedAgent[],
      });
      if (!accepted) reason = `roster failed validation on attempt ${attempt}`;
    } catch (err) {
      if (!(err instanceof RunError) || err.code !== 'SCHEMA_INVALID') throw err;
      reason = err.message;
    }
  }
  if (accepted) {
    await applyCompanyRoster({
      projectId: run.project_id,
      size: safeSize,
      mix,
      agents: accepted.agents,
      assignments: accepted.assignments,
      planningModel: run.model_id || 'planner',
      source: 'ai',
      runId: run.id,
      force: run.input.force === true,
    });
    emitProject(run.project_id, 'company:updated', { projectId: run.project_id, source: 'ai' });
    return { outputSource: 'ai', text: 'ai company applied' };
  }
  await applyCompanyRoster({
    projectId: run.project_id,
    size: safeSize,
    mix,
    agents: template.agents,
    assignments: template.flowAssignments,
    planningModel: run.model_id || 'template',
    source: 'template',
    runId: run.id,
    force: run.input.force === true,
  });
  await append(run.id, 'status', `template company applied after two failed validations: ${reason}`);
  emitProject(run.project_id, 'company:updated', { projectId: run.project_id, source: 'template' });
  return { outputSource: 'template', text: 'template company applied' };
}
