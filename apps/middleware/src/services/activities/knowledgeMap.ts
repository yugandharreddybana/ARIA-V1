import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { businessFlows, db, knowledgeMaps } from '@aria/db';
import { getPgPool } from '../db.client';
import { reasoningFor } from '../models/reasoning';
import { RunError } from '../runs/errors';
import type { AgentRunRow } from '../runs/runQueue';
import { append } from '../runs/runLogs';
import { emitProject } from '../runs/hub';
import { mergeKnowledgeState, type AiKnowledge, type MergeFlow, type MergeModule } from './knowledgeMerge';

const knowledgeSchema = z.object({
  summary: z.string().min(1),
  techStack: z.array(z.object({ name: z.string(), evidence: z.string().optional() })).default([]),
  modules: z.array(z.object({ name: z.string(), path: z.string(), fileCount: z.number().optional() })).default([]),
  flows: z.array(z.object({
    flowKey: z.string(),
    name: z.string(),
    kind: z.string().optional(),
    layer: z.string().optional(),
    description: z.string().optional(),
    entryPoints: z.array(z.string()).default([]),
  })).default([]),
  apis: z.array(z.object({ method: z.string().optional(), path: z.string().optional(), source: z.string().optional() })).default([]),
  dataModel: z.array(z.object({ name: z.string().optional(), source: z.string().optional() })).default([]),
});

export async function executeKnowledge(run: AgentRunRow): Promise<{ outputSource: 'ai' | 'template'; text: string }> {
  const model = await reasoningFor(run.workspace_id);
  const existing = await db.query.knowledgeMaps.findFirst({ where: eq(knowledgeMaps.projectId, run.project_id) });
  const marker = typeof run.input.fixture === 'string' ? `\n${run.input.fixture}` : '';
  try {
    const planned = await model.plan({
      run,
      schema: knowledgeSchema,
      tools: 'read_only',
      instructions: `Return JSON {summary, techStack, modules, flows, apis, dataModel}. Keep every flow name from the draft. Drop paths that are not in the repository.${marker}`,
      onLog: (kind, text) => { void append(run.id, kind === 'error' ? 'error' : 'status', text); },
    });
    if (existing) {
      const value = planned.value;
      await applyKnowledgeMerge(run, existing.id, existing, {
        summary: value.summary,
        techStack: value.techStack ?? [],
        modules: value.modules ?? [],
        flows: (value.flows ?? []).map((flow) => ({ ...flow, entryPoints: flow.entryPoints ?? [] })),
        apis: value.apis ?? [],
        dataModel: value.dataModel ?? [],
      });
    }
    emitProject(run.project_id, 'knowledge:updated', { projectId: run.project_id, source: 'ai' });
    return { outputSource: 'ai', text: planned.value.summary };
  } catch (err) {
    if (err instanceof RunError && err.code === 'SCHEMA_INVALID') {
      if (existing) {
        await db.update(knowledgeMaps).set({ source: 'template', updatedAt: new Date() }).where(eq(knowledgeMaps.id, existing.id));
      }
      emitProject(run.project_id, 'knowledge:updated', { projectId: run.project_id, source: 'template' });
      return { outputSource: 'template', text: existing?.summary ?? 'template' };
    }
    throw err;
  }
}

async function applyKnowledgeMerge(
  run: AgentRunRow,
  mapId: string,
  existing: { summary: string; techStack: unknown; modules: unknown; apis: unknown; dataModel: unknown },
  ai: AiKnowledge,
): Promise<void> {
  const projectId = run.project_id;
  const flowRows = await db.query.businessFlows.findMany({ where: eq(businessFlows.projectId, projectId) });
  const ownerRows = await getPgPool().query<{ flow_id: string }>(
    `SELECT flow_id FROM flow_owners WHERE flow_id = ANY($1::uuid[])`,
    [flowRows.map((flow) => flow.id)],
  );
  const owned = new Set(ownerRows.rows.map((row) => row.flow_id));
  const flows: MergeFlow[] = flowRows.map((flow) => ({
    id: flow.id,
    flowKey: flow.flowKey,
    name: flow.name,
    kind: flow.kind,
    description: flow.description,
    layer: flow.layer,
    entryPoints: Array.isArray(flow.entryPoints) ? flow.entryPoints.filter((entry): entry is string => typeof entry === 'string') : [],
    hasOwner: owned.has(flow.id),
  }));
  const modules = Array.isArray(existing.modules) ? existing.modules as MergeModule[] : [];
  const knownPaths = new Set<string>();
  for (const mod of modules) if (mod && typeof mod.path === 'string') knownPaths.add(mod.path);
  for (const flow of flows) for (const entry of flow.entryPoints) knownPaths.add(entry);
  const merged = mergeKnowledgeState({
    summary: existing.summary,
    flowNames: flows.map((flow) => flow.name),
    techStack: Array.isArray(existing.techStack) ? existing.techStack : [],
    modules,
    apis: Array.isArray(existing.apis) ? existing.apis : [],
    dataModel: Array.isArray(existing.dataModel) ? existing.dataModel : [],
    flows,
    ai,
    knownPaths,
  });
  await db.update(knowledgeMaps).set({
    summary: merged.summary,
    techStack: merged.techStack,
    modules: merged.modules,
    apis: merged.apis,
    dataModel: merged.dataModel,
    source: 'ai',
    agentRunId: run.id,
    updatedAt: new Date(),
  }).where(eq(knowledgeMaps.id, mapId));
  for (const flow of merged.updates) {
    await db.update(businessFlows).set({
      name: flow.name,
      kind: flow.kind,
      description: flow.description,
      layer: flow.layer,
      entryPoints: flow.entryPoints,
      updatedAt: new Date(),
    }).where(eq(businessFlows.id, flow.id));
  }
  for (const flow of merged.inserts) {
    await db.insert(businessFlows).values({
      projectId,
      knowledgeMapId: mapId,
      flowKey: flow.flowKey,
      name: flow.name,
      kind: flow.kind,
      description: flow.description,
      layer: flow.layer,
      entryPoints: flow.entryPoints,
    });
  }
}
