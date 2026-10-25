import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, knowledgeMaps } from '@aria/db';
import { reasoningFor } from '../models/reasoning';
import { RunError } from '../runs/errors';
import type { AgentRunRow } from '../runs/runQueue';
import { append } from '../runs/runLogs';
import { emitProject } from '../runs/hub';

const knowledgeSchema = z.object({
  summary: z.string().min(1),
  flows: z.array(z.object({ flowKey: z.string(), name: z.string() })).default([]),
});

export function mergeSummary(draft: string, ai: string, flowNames: string[]): string {
  const missing = flowNames.filter((name) => !ai.toLowerCase().includes(name.toLowerCase()));
  if (!missing.length) return ai.slice(0, 2000);
  return `${ai.slice(0, 1600)} Detected flows: ${flowNames.join(', ')}.`.slice(0, 2000);
}

export async function executeKnowledge(run: AgentRunRow): Promise<{ outputSource: 'ai' | 'template'; text: string }> {
  const model = await reasoningFor(run.workspace_id);
  const existing = await db.query.knowledgeMaps.findFirst({ where: eq(knowledgeMaps.projectId, run.project_id) });
  try {
    const planned = await model.plan({
      run,
      schema: knowledgeSchema,
      instructions: 'Return JSON {summary, flows:[{flowKey,name}]}. Keep every flow name from the draft.',
      onLog: (kind, text) => { void append(run.id, kind === 'error' ? 'error' : 'status', text); },
    });
    if (existing) {
      const names = Array.isArray(existing.modules) ? [] : [];
      void names;
      const summary = mergeSummary(existing.summary, planned.value.summary, (planned.value.flows ?? []).map((flow) => flow.name));
      if (!/signup/i.test(existing.summary) || /signup/i.test(summary)) {
        await db.update(knowledgeMaps).set({ summary, source: 'ai', agentRunId: run.id, updatedAt: new Date() }).where(eq(knowledgeMaps.id, existing.id));
      }
    }
    emitProject(run.project_id, 'knowledge:updated', { projectId: run.project_id, source: 'ai' });
    return { outputSource: 'ai', text: planned.value.summary };
  } catch (err) {
    if (err instanceof RunError && err.code === 'SCHEMA_INVALID') {
      emitProject(run.project_id, 'knowledge:updated', { projectId: run.project_id, source: 'template' });
      return { outputSource: 'template', text: existing?.summary ?? 'template' };
    }
    throw err;
  }
}
