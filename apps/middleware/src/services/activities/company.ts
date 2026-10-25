import { z } from 'zod';
import { validateEnv } from '../../config/env';
import { getPgPool } from '../db.client';
import { applyCompanyRoster } from './companyApply';
import { generateCompany } from '../companyGenerator';
import { reasoningFor } from '../models/reasoning';
import { RunError } from '../runs/errors';
import type { AgentRunRow } from '../runs/runQueue';
import { append } from '../runs/runLogs';
import { emitProject } from '../runs/hub';

const companySchema = z.object({
  agents: z.array(z.object({ roleKey: z.string() })).min(1),
});

export async function executeCompany(run: AgentRunRow): Promise<{ outputSource: 'ai' | 'template'; text: string }> {
  const size = Number(run.input.size ?? 8);
  const mix = run.input.mix as Parameters<typeof generateCompany>[0]['mix'];
  const flows = await getPgPool().query<{ id: string; flow_key: string; name: string; kind: string }>(
    `SELECT id, flow_key, name, kind FROM business_flows WHERE project_id = $1::uuid`,
    [run.project_id],
  );
  const template = generateCompany({
    size: Number.isInteger(size) ? size : 8,
    mix: mix ?? { business: 1, qa: 1, frontend: 1, backend: 1, fullstack: 1, junior: 0, aiml: 0, devops: 0, security: 0 },
    seed: run.project_id,
    flows: flows.rows.map((flow) => ({ id: flow.id, flowKey: flow.flow_key, name: flow.name, kind: flow.kind })),
  });
  const model = await reasoningFor(run.workspace_id);
  try {
    await model.plan({
      run,
      schema: companySchema,
      instructions: 'Return a company roster as JSON with an agents array. Seat count must match the request.',
      onLog: (kind, text) => { void append(run.id, kind === 'error' ? 'error' : 'status', text); },
    });
    await applyCompanyRoster({
      projectId: run.project_id,
      size,
      mix: template.agents.length ? (mix ?? { business: 0, qa: 0, frontend: 0, backend: 0, fullstack: 0, junior: 0, aiml: 0, devops: 0, security: 0 }) : template as never,
      agents: template.agents,
      assignments: template.flowAssignments,
      planningModel: 'template',
      source: 'template',
      runId: run.id,
    });
  } catch (err) {
    if (!(err instanceof RunError) || err.code !== 'SCHEMA_INVALID') throw err;
    await applyCompanyRoster({
      projectId: run.project_id,
      size: Number.isInteger(size) ? size : 8,
      mix: mix ?? { business: 1, qa: 1, frontend: 1, backend: 1, fullstack: 1, junior: 0, aiml: 0, devops: 0, security: 0 },
      agents: template.agents,
      assignments: template.flowAssignments,
      planningModel: run.model_id || 'template',
      source: 'template',
      runId: run.id,
    });
  }
  emitProject(run.project_id, 'company:updated', { projectId: run.project_id, source: 'template' });
  void validateEnv();
  return { outputSource: 'template', text: 'template company applied' };
}
