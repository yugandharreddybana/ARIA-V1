import { getPgPool } from '../db.client';
import { AppError } from '../../middleware/error.middleware';

export type FlowLayer = 'frontend' | 'backend' | 'fullstack';
export type FlowRole = 'owner' | 'backup';

export interface FlowOwnerInput {
  agentId: string;
  layer: FlowLayer;
  role: FlowRole;
}

export function assertOwnerInvariant(owners: FlowOwnerInput[]): void {
  const layers = new Set(owners.filter((owner) => owner.role === 'owner').map((owner) => owner.layer));
  if (layers.has('fullstack') && (layers.has('frontend') || layers.has('backend'))) {
    throw new AppError('A flow has a fullstack owner or frontend/backend owners, not both', 422, 'FLOW_OWNERS');
  }
  const keys = owners.map((owner) => `${owner.layer}:${owner.role}`);
  if (new Set(keys).size !== keys.length) {
    throw new AppError('Duplicate flow owner layer and role', 422, 'FLOW_OWNERS');
  }
}

export async function ownersOf(flowId: string): Promise<FlowOwnerInput[]> {
  const result = await getPgPool().query<FlowOwnerInput>(
    `SELECT agent_id AS "agentId", layer, role FROM flow_owners WHERE flow_id = $1::uuid`,
    [flowId],
  );
  return result.rows.map((row) => ({
    agentId: row.agentId,
    layer: row.layer as FlowLayer,
    role: row.role as FlowRole,
  }));
}

export async function setOwners(flowId: string, owners: FlowOwnerInput[], projectId?: string): Promise<void> {
  assertOwnerInvariant(owners);
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (projectId) {
      const agents = await client.query<{ id: string }>(
        `SELECT id FROM skills WHERE project_id = $1::uuid AND id = ANY($2::uuid[])`,
        [projectId, owners.map((owner) => owner.agentId)],
      );
      if (agents.rows.length !== new Set(owners.map((owner) => owner.agentId)).size) {
        throw new AppError('Flow owner is not an agent on this project', 403, 'FORBIDDEN');
      }
    }
    await client.query(`DELETE FROM flow_owners WHERE flow_id = $1::uuid`, [flowId]);
    for (const owner of owners) {
      await client.query(
        `INSERT INTO flow_owners (flow_id, agent_id, layer, role) VALUES ($1::uuid, $2::uuid, $3, $4)`,
        [flowId, owner.agentId, owner.layer, owner.role],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function routeTicket(flowId: string | null, layer: FlowLayer | null, projectId: string): Promise<string | null> {
  if (flowId) {
    const owners = await ownersOf(flowId);
    const wanted = layer ?? 'fullstack';
    const same = owners.filter((owner) => owner.layer === wanted);
    const owner = same.find((row) => row.role === 'owner') ?? same.find((row) => row.role === 'backup');
    if (owner) return owner.agentId;
    const full = owners.filter((row) => row.layer === 'fullstack');
    const fallback = full.find((row) => row.role === 'owner') ?? full.find((row) => row.role === 'backup');
    if (fallback) return fallback.agentId;
  }
  const dev = await getPgPool().query<{ id: string }>(
    `SELECT id FROM skills WHERE enabled = true AND role_key = 'fullstack' AND project_id = $1::uuid
      ORDER BY created_at LIMIT 1`,
    [projectId],
  );
  return dev.rows[0]?.id ?? null;
}

export async function removeAgent(agentId: string): Promise<void> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const owned = await client.query<{ flow_id: string; layer: string }>(
      `DELETE FROM flow_owners WHERE agent_id = $1::uuid AND role = 'owner' RETURNING flow_id, layer`,
      [agentId],
    );
    for (const row of owned.rows) {
      await client.query(
        `UPDATE flow_owners SET role = 'owner'
          WHERE flow_id = $1::uuid AND layer = $2 AND role = 'backup'`,
        [row.flow_id, row.layer],
      );
    }
    await client.query(`DELETE FROM flow_owners WHERE agent_id = $1::uuid`, [agentId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export interface FlowOwnerView {
  ownerAgentId: string | null;
  backupAgentId: string | null;
  owners: FlowOwnerInput[];
}

export async function decorateFlows<T extends { id: string }>(flows: T[]): Promise<Array<T & FlowOwnerView>> {
  if (!flows.length) return [];
  const result = await getPgPool().query<{ flow_id: string; agent_id: string; layer: string; role: string }>(
    `SELECT flow_id, agent_id, layer, role FROM flow_owners WHERE flow_id = ANY($1::uuid[])`,
    [flows.map((flow) => flow.id)],
  );
  const grouped = new Map<string, Array<{ agent_id: string; layer: string; role: string }>>();
  for (const row of result.rows) {
    const list = grouped.get(row.flow_id) ?? [];
    list.push(row);
    grouped.set(row.flow_id, list);
  }
  return flows.map((flow) => {
    const rows = grouped.get(flow.id) ?? [];
    const owners = rows.filter((row) => row.role === 'owner');
    const primary = owners.find((row) => row.layer === 'fullstack') ?? owners[0] ?? null;
    const backup = primary
      ? rows.find((row) => row.role === 'backup' && row.layer === primary.layer) ?? null
      : null;
    return {
      ...flow,
      ownerAgentId: primary?.agent_id ?? null,
      backupAgentId: backup?.agent_id ?? null,
      owners: rows.map((row) => ({
        agentId: row.agent_id,
        layer: row.layer as FlowLayer,
        role: row.role as FlowRole,
      })),
    };
  });
}
