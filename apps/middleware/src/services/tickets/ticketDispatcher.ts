import { validateEnv } from '../../config/env';
import { getPgPool } from '../db.client';
import { activeStatuses, resolveTicketOwner } from '../ownership/pathOwners';
import { applyTransition } from './ticketActions';

export async function dispatchReadyTickets(): Promise<number> {
  const env = validateEnv();
  const active = activeStatuses();
  const rows = await getPgPool().query<{
    id: string;
    project_id: string;
    workspace_id: string;
    assigned_skill_id: string | null;
    assignee_agent_id: string | null;
    flow_id: string | null;
    layer: string | null;
    predicted_paths: unknown;
  }>(
    `SELECT t.id, t.project_id, p.workspace_id, t.assigned_skill_id, t.assignee_agent_id,
            t.flow_id, t.layer, t.predicted_paths
       FROM tickets t
       JOIN projects p ON p.id = t.project_id
      WHERE t.status = 'ready_for_dev' AND t.human_approved = true
        AND t.issue_type IN ('story', 'sub_task')
      ORDER BY t.priority ASC NULLS LAST, t.created_at
      LIMIT 40`,
  );
  let dispatched = 0;
  for (const row of rows.rows) {
    const paths = Array.isArray(row.predicted_paths)
      ? row.predicted_paths.filter((item): item is string => typeof item === 'string')
      : [];
    const resolved = await resolveTicketOwner({
      workspaceId: row.workspace_id,
      projectId: row.project_id,
      ticketId: row.id,
      assigneeAgentId: row.assignee_agent_id ?? row.assigned_skill_id,
      flowId: row.flow_id,
      layer: row.layer,
      predictedPaths: paths,
      allowBackupOnWip: true,
    });
    if (!resolved.agentId) continue;
    const role = await getPgPool().query<{ role_key: string; enabled: boolean }>(
      `SELECT role_key, enabled FROM skills WHERE id = $1::uuid`,
      [resolved.agentId],
    );
    const skill = role.rows[0];
    if (!skill?.enabled || !['frontend', 'backend', 'fullstack', 'junior'].includes(skill.role_key)) continue;
    const wip = await getPgPool().query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM tickets
        WHERE (assignee_agent_id = $1::uuid OR assigned_skill_id = $1::uuid)
          AND status = ANY($2::text[])`,
      [resolved.agentId, active],
    );
    if (Number(wip.rows[0]?.n ?? 0) >= env.ARIA_AGENT_WIP_LIMIT) continue;

    await getPgPool().query(
      `UPDATE tickets
          SET assignee_agent_id = $2::uuid, assigned_skill_id = $2::uuid, updated_at = NOW()
        WHERE id = $1::uuid`,
      [row.id, resolved.agentId],
    );
    await applyTransition(row.id, 'dispatch', { actorKind: 'system', agentId: resolved.agentId });
    dispatched += 1;
  }
  return dispatched;
}
