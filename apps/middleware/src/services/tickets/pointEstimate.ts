import { z } from 'zod';
import { getPgPool } from '../db.client';
import { reasoningFor } from '../models/reasoning';
import { RunError } from '../runs/errors';
import type { AgentRunRow } from '../runs/runQueue';
import { append } from '../runs/runLogs';
import { appendTicketEvent } from './ticketEvents';
import { estimatePoints, isStoryPoint, splitSuggested } from './schedule';

const schema = z.object({
  storyPoints: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(5), z.literal(8), z.literal(13)]),
});

export async function executeStoryPoints(run: AgentRunRow): Promise<{ outputSource: 'ai' | 'template'; text: string; tokensTotal?: number }> {
  if (!run.ticket_id) throw new RunError('RUN_ERROR', 'Story points need a ticket', false);
  const ticket = await getPgPool().query<{ title: string; description: string; project_id: string; ticket_key: string }>(
    `SELECT title, description, project_id, ticket_key FROM tickets WHERE id = $1::uuid`,
    [run.ticket_id],
  );
  const row = ticket.rows[0];
  if (!row) throw new RunError('RUN_ERROR', 'Ticket missing', false);
  const fallback = estimatePoints(row.title, row.description);
  const model = await reasoningFor(run.workspace_id);
  try {
    const planned = await model.plan({
      run,
      schema,
      tools: 'none',
      instructions: [
        'Estimate story points for this ticket.',
        'Fibonacci only: 1, 2, 3, 5, 8, 13. One point is one working day.',
        'Reply with JSON {"storyPoints": N}.',
        `Title: ${row.title}`,
        `Description: ${row.description}`,
        typeof run.input.fixture === 'string' ? run.input.fixture : '',
      ].join('\n'),
      onLog: (kind, text) => { void append(run.id, kind === 'error' ? 'error' : 'status', text); },
    });
    const points = planned.value.storyPoints;
    if (!isStoryPoint(points)) throw new RunError('SCHEMA_INVALID', 'story points out of range', false);
    await getPgPool().query(
      `UPDATE tickets SET story_points = $2, split_suggested = $3, updated_at = NOW() WHERE id = $1::uuid`,
      [run.ticket_id, points, splitSuggested(points)],
    );
    await appendTicketEvent({
      workspaceId: run.workspace_id,
      projectId: row.project_id,
      ticketId: run.ticket_id,
      eventType: 'agent_action',
      actorKind: 'system',
      runId: run.id,
      summary: `Planner set ${points} story points`,
      detail: { storyPoints: points, source: 'planner' },
    });
    return { outputSource: 'ai', text: JSON.stringify({ storyPoints: points }), tokensTotal: planned.tokensTotal };
  } catch (err) {
    if (!(err instanceof RunError) || err.code !== 'SCHEMA_INVALID') throw err;
    await appendTicketEvent({
      workspaceId: run.workspace_id,
      projectId: row.project_id,
      ticketId: run.ticket_id,
      eventType: 'agent_action',
      actorKind: 'system',
      runId: run.id,
      summary: `Planner estimate failed; kept ${fallback} story points`,
      detail: { storyPoints: fallback, source: 'heuristic' },
    });
    return { outputSource: 'template', text: JSON.stringify({ storyPoints: fallback, source: 'heuristic' }) };
  }
}
