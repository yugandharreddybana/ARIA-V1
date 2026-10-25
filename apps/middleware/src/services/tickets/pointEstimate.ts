import { z } from 'zod';
import { loadWorkspaceLlm } from '../guardedLlm.service';
import { reasoningFor } from '../models/reasoning';
import type { AgentRunRow } from '../runs/runQueue';
import { estimatePoints, isStoryPoint, type StoryPoint } from './schedule';

const schema = z.object({
  storyPoints: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(5), z.literal(8), z.literal(13)]),
});

export async function estimateStoryPoints(workspaceId: string, title: string, description: string): Promise<{ points: StoryPoint; source: 'planner' | 'heuristic' }> {
  const llm = await loadWorkspaceLlm(workspaceId);
  if (!llm) return { points: estimatePoints(title, description), source: 'heuristic' };
  try {
    const model = await reasoningFor(workspaceId);
    const run = {
      id: '00000000-0000-4000-8000-000000000000',
      workspace_id: workspaceId,
      project_id: '00000000-0000-4000-8000-000000000000',
      activity: 'company_generation',
      task_type: 'sprint_planning',
      model_id: 'auto',
      input: {},
    } as AgentRunRow;
    const planned = await model.plan({
      run,
      schema,
      tools: 'none',
      instructions: [
        'Estimate story points for this ticket.',
        'Fibonacci only: 1, 2, 3, 5, 8, 13. One point is one working day.',
        'Reply with JSON {"storyPoints": N}.',
        `Title: ${title}`,
        `Description: ${description}`,
      ].join('\n'),
      onLog: () => undefined,
    });
    if (isStoryPoint(planned.value.storyPoints)) return { points: planned.value.storyPoints, source: 'planner' };
  } catch {
    // The planner is optional. A length heuristic still fills the required column.
  }
  return { points: estimatePoints(title, description), source: 'heuristic' };
}
