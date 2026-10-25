import { validateEnv } from '../../config/env';
import { getPgPool } from '../db.client';
import { applyTransition } from './ticketActions';

const ACTIVE = ['in_progress', 'ready_for_review', 'in_qa'];

export async function dispatchReadyTickets(): Promise<number> {
  const env = validateEnv();
  const active = env.ARIA_AWAITING_MERGE_COUNTS_ACTIVE ? [...ACTIVE, 'awaiting_merge'] : ACTIVE;
  const rows = await getPgPool().query<{ id: string }>(
    `SELECT t.id
       FROM tickets t
       JOIN skills s ON s.id = t.assigned_skill_id
      WHERE t.status = 'ready_for_dev' AND t.human_approved = true AND s.enabled = true
        AND s.role_key IN ('frontend', 'backend', 'fullstack', 'junior')
        AND NOT EXISTS (
          SELECT 1 FROM tickets other
           WHERE other.assigned_skill_id = s.id AND other.status = ANY($1::text[])
        )
      ORDER BY t.priority ASC NULLS LAST, t.created_at
      LIMIT 20`,
    [active],
  );
  let dispatched = 0;
  for (const row of rows.rows) {
    await applyTransition(row.id, 'dispatch', { actorKind: 'system' });
    dispatched += 1;
  }
  return dispatched;
}
