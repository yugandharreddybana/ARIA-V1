import type { PoolClient } from 'pg';
import { validateEnv } from '../../config/env';
import { AppError } from '../../middleware/error.middleware';
import { getPgPool } from '../db.client';
import { appendTicketEvent } from '../tickets/ticketEvents';

export type PathLayer = 'frontend' | 'backend' | 'fullstack' | 'docs' | 'other';
export type HandoffReason = 'owner_off' | 'wip_exceeded' | 'user_reassign' | 'agent_deleted';

export interface PathOwnerRow {
  id: string;
  project_id: string;
  path_glob: string;
  layer: PathLayer;
  owner_agent_id: string;
  backup_agent_id: string | null;
  source: string;
  last_ticket_id: string | null;
  last_pr_number: number | null;
  owner_name?: string | null;
  backup_name?: string | null;
}

const ACTIVE_STATUSES = ['in_progress', 'ready_for_review', 'in_qa'] as const;

export function activeStatuses(): string[] {
  const env = validateEnv();
  return env.ARIA_AWAITING_MERGE_COUNTS_ACTIVE
    ? [...ACTIVE_STATUSES, 'awaiting_merge']
    : [...ACTIVE_STATUSES];
}

/** Glob specificity: longer prefix before `*` / `**` wins; ties break on longer pattern. */
export function globSpecificity(glob: string): number {
  const star = glob.search(/[*?]/);
  const prefixLen = star < 0 ? glob.length : star;
  return prefixLen * 1000 + glob.length;
}

/** Minimal glob match: `**` any path, `*` one segment, exact otherwise. */
export function pathMatchesGlob(filePath: string, glob: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
  const g = glob.replace(/\\/g, '/');
  if (g === '**' || g === '**/*') return true;
  const escaped = g
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '§§')
    .replace(/\*/g, '[^/]*')
    .replace(/§§/g, '.*');
  return new RegExp(`^${escaped}$`).test(normalized);
}

export function mostSpecificOwner(owners: PathOwnerRow[], paths: string[]): PathOwnerRow | null {
  let best: PathOwnerRow | null = null;
  let bestScore = -1;
  for (const owner of owners) {
    const hit = paths.some((path) => pathMatchesGlob(path, owner.path_glob));
    if (!hit) continue;
    const score = globSpecificity(owner.path_glob);
    if (score > bestScore) {
      best = owner;
      bestScore = score;
    }
  }
  return best;
}

/** Deterministic mapper: top two path segments → glob. */
export function globsFromPaths(paths: string[]): Array<{ pathGlob: string; layer: PathLayer }> {
  const seen = new Set<string>();
  const out: Array<{ pathGlob: string; layer: PathLayer }> = [];
  for (const raw of paths) {
    const path = raw.replace(/\\/g, '/').replace(/^\.\//, '');
    const parts = path.split('/').filter(Boolean);
    if (!parts.length) continue;
    const base = parts.length === 1 ? parts[0] : `${parts[0]}/${parts[1]}`;
    const pathGlob = `${base}/**`;
    if (seen.has(pathGlob)) continue;
    seen.add(pathGlob);
    out.push({ pathGlob, layer: layerForPath(path) });
  }
  return out;
}

export function layerForPath(path: string): PathLayer {
  const p = path.replace(/\\/g, '/').toLowerCase();
  if (p.includes('/docs/') || p.startsWith('docs/') || p.endsWith('.md')) return 'docs';
  if (
    p.includes('apps/web') || p.includes('/frontend') || p.includes('/ui/')
    || /\.(tsx|jsx|css|scss)$/.test(p)
  ) return 'frontend';
  if (
    p.includes('apps/middleware') || p.includes('apps/backend') || p.includes('/backend')
    || p.includes('/api/') || /\.(java|kt)$/.test(p)
  ) return 'backend';
  if (p.includes('packages/') || p.includes('fullstack')) return 'fullstack';
  return 'other';
}

export async function listPathOwners(projectId: string): Promise<PathOwnerRow[]> {
  const result = await getPgPool().query<PathOwnerRow>(
    `SELECT po.*, o.real_name AS owner_name, b.real_name AS backup_name
       FROM path_owners po
       JOIN skills o ON o.id = po.owner_agent_id
       LEFT JOIN skills b ON b.id = po.backup_agent_id
      WHERE po.project_id = $1::uuid
      ORDER BY po.path_glob`,
    [projectId],
  );
  return result.rows;
}

export async function agentWipCount(agentId: string, client?: PoolClient): Promise<number> {
  const db = client ?? getPgPool();
  const result = await db.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM tickets
      WHERE (assignee_agent_id = $1::uuid OR assigned_skill_id = $1::uuid)
        AND status = ANY($2::text[])`,
    [agentId, activeStatuses()],
  );
  return Number(result.rows[0]?.n ?? 0);
}

export async function agentEligible(agentId: string, client?: PoolClient): Promise<{
  ok: boolean;
  reason: 'missing' | 'off' | 'wip_exceeded' | null;
  enabled: boolean;
  wip: number;
}> {
  const db = client ?? getPgPool();
  const env = validateEnv();
  const agent = await db.query<{ id: string; enabled: boolean }>(
    `SELECT id, enabled FROM skills WHERE id = $1::uuid`,
    [agentId],
  );
  if (!agent.rows[0]) return { ok: false, reason: 'missing', enabled: false, wip: 0 };
  if (!agent.rows[0].enabled) return { ok: false, reason: 'off', enabled: false, wip: 0 };
  const wip = await agentWipCount(agentId, client);
  if (wip >= env.ARIA_AGENT_WIP_LIMIT) {
    return { ok: false, reason: 'wip_exceeded', enabled: true, wip };
  }
  return { ok: true, reason: null, enabled: true, wip };
}

export async function recordHandoff(input: {
  workspaceId: string;
  projectId: string;
  ticketId: string | null;
  pathOwnerId?: string | null;
  flowId?: string | null;
  fromAgentId: string | null;
  toAgentId: string;
  reason: HandoffReason;
  handoverMd: string;
}, client?: PoolClient): Promise<string> {
  const db = client ?? getPgPool();
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO ownership_handoffs
       (project_id, path_owner_id, flow_id, from_agent_id, to_agent_id, reason, handover_md, ticket_id)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8::uuid)
     RETURNING id`,
    [
      input.projectId,
      input.pathOwnerId ?? null,
      input.flowId ?? null,
      input.fromAgentId,
      input.toAgentId,
      input.reason,
      input.handoverMd,
      input.ticketId,
    ],
  );
  if (input.ticketId) {
    await appendTicketEvent({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      ticketId: input.ticketId,
      eventType: 'ownership_handoff',
      actorKind: input.reason === 'user_reassign' ? 'owner' : 'system',
      agentId: input.toAgentId,
      summary: `Ownership handoff (${input.reason})`,
      detail: {
        fromAgentId: input.fromAgentId,
        toAgentId: input.toAgentId,
        reason: input.reason,
        pathOwnerId: input.pathOwnerId ?? null,
        flowId: input.flowId ?? null,
        handoffId: inserted.rows[0]?.id ?? null,
      },
    }, client);
  }
  return inserted.rows[0]!.id;
}

export interface ResolveOwnerResult {
  agentId: string | null;
  backupAgentId: string | null;
  ownershipSource: 'assignee' | 'path' | 'flow' | 'none';
  pathOwnerId: string | null;
  handedOff: boolean;
  handoffReason: HandoffReason | null;
}

/**
 * Routing order (M3 §3): explicit assignee → path owners → flow owners → null.
 * Backup when primary OFF / over WIP; user reassign uses the handoff path separately.
 */
export async function resolveTicketOwner(input: {
  workspaceId: string;
  projectId: string;
  ticketId: string | null;
  assigneeAgentId: string | null;
  flowId: string | null;
  layer: string | null;
  predictedPaths: string[];
  allowBackupOnWip?: boolean;
}): Promise<ResolveOwnerResult> {
  const allowBackupOnWip = input.allowBackupOnWip !== false;
  const empty: ResolveOwnerResult = {
    agentId: null, backupAgentId: null, ownershipSource: 'none',
    pathOwnerId: null, handedOff: false, handoffReason: null,
  };

  if (input.assigneeAgentId) {
    const elig = await agentEligible(input.assigneeAgentId);
    if (elig.ok || input.ticketId === null) {
      // ticketId null = display-only resolve; show explicit assignee even if OFF/WIP.
      return {
        agentId: input.assigneeAgentId,
        backupAgentId: null,
        ownershipSource: 'assignee',
        pathOwnerId: null,
        handedOff: false,
        handoffReason: null,
      };
    }
  }

  const pathOwners = input.predictedPaths.length
    ? await listPathOwners(input.projectId)
    : [];
  const pathHit = mostSpecificOwner(pathOwners, input.predictedPaths);
  if (pathHit) {
    const primary = await agentEligible(pathHit.owner_agent_id);
    if (primary.ok) {
      return {
        agentId: pathHit.owner_agent_id,
        backupAgentId: pathHit.backup_agent_id,
        ownershipSource: 'path',
        pathOwnerId: pathHit.id,
        handedOff: false,
        handoffReason: null,
      };
    }
    const reason: HandoffReason = primary.reason === 'off' ? 'owner_off' : 'wip_exceeded';
    if (pathHit.backup_agent_id && (primary.reason === 'off' || (primary.reason === 'wip_exceeded' && allowBackupOnWip))) {
      const backup = await agentEligible(pathHit.backup_agent_id);
      if (backup.ok) {
        if (input.ticketId) {
          await recordHandoff({
            workspaceId: input.workspaceId,
            projectId: input.projectId,
            ticketId: input.ticketId,
            pathOwnerId: pathHit.id,
            fromAgentId: pathHit.owner_agent_id,
            toAgentId: pathHit.backup_agent_id,
            reason,
            handoverMd: handoverDoc({
              from: pathHit.owner_agent_id,
              to: pathHit.backup_agent_id,
              reason,
              paths: input.predictedPaths,
              pathGlob: pathHit.path_glob,
            }),
          });
        }
        return {
          agentId: pathHit.backup_agent_id,
          backupAgentId: pathHit.backup_agent_id,
          ownershipSource: 'path',
          pathOwnerId: pathHit.id,
          handedOff: true,
          handoffReason: reason,
        };
      }
    }
  }

  if (input.flowId) {
    const flow = await getPgPool().query<{ agent_id: string; role: string; layer: string }>(
      `SELECT agent_id, role, layer FROM flow_owners WHERE flow_id = $1::uuid`,
      [input.flowId],
    );
    const wanted = input.layer ?? 'fullstack';
    const same = flow.rows.filter((row) => row.layer === wanted);
    const owner = same.find((row) => row.role === 'owner') ?? flow.rows.find((row) => row.layer === 'fullstack' && row.role === 'owner');
    const backup = same.find((row) => row.role === 'backup')
      ?? flow.rows.find((row) => row.layer === (owner?.layer ?? wanted) && row.role === 'backup');
    if (owner) {
      const elig = await agentEligible(owner.agent_id);
      if (elig.ok) {
        return {
          agentId: owner.agent_id,
          backupAgentId: backup?.agent_id ?? null,
          ownershipSource: 'flow',
          pathOwnerId: null,
          handedOff: false,
          handoffReason: null,
        };
      }
      const reason: HandoffReason = elig.reason === 'off' ? 'owner_off' : 'wip_exceeded';
      if (backup && (elig.reason === 'off' || (elig.reason === 'wip_exceeded' && allowBackupOnWip))) {
        const backupElig = await agentEligible(backup.agent_id);
        if (backupElig.ok) {
          if (input.ticketId) {
            await recordHandoff({
              workspaceId: input.workspaceId,
              projectId: input.projectId,
              ticketId: input.ticketId,
              flowId: input.flowId,
              fromAgentId: owner.agent_id,
              toAgentId: backup.agent_id,
              reason,
              handoverMd: handoverDoc({
                from: owner.agent_id,
                to: backup.agent_id,
                reason,
                paths: input.predictedPaths,
                pathGlob: null,
              }),
            });
          }
          return {
            agentId: backup.agent_id,
            backupAgentId: backup.agent_id,
            ownershipSource: 'flow',
            pathOwnerId: null,
            handedOff: true,
            handoffReason: reason,
          };
        }
      }
    }
  }

  return empty;
}

export function handoverDoc(input: {
  from: string | null;
  to: string;
  reason: HandoffReason;
  paths: string[];
  pathGlob: string | null;
}): string {
  return [
    '# Ownership handover',
    '',
    `- From: ${input.from ?? 'none'}`,
    `- To: ${input.to}`,
    `- Reason: ${input.reason}`,
    `- Path glob: ${input.pathGlob ?? 'n/a'}`,
    `- Paths: ${input.paths.length ? input.paths.join(', ') : 'n/a'}`,
    '',
    '## Open risks',
    '- Continue from the last ticket_events entry for this flow.',
    '',
  ].join('\n');
}

export async function upsertPathOwnersFromMerge(input: {
  projectId: string;
  agentId: string;
  ticketId: string;
  prNumber: number | null;
  paths: string[];
  backupAgentId?: string | null;
}): Promise<number> {
  const globs = globsFromPaths(input.paths);
  let upserted = 0;
  for (const row of globs) {
    await getPgPool().query(
      `INSERT INTO path_owners
         (project_id, path_glob, layer, owner_agent_id, backup_agent_id, source, last_ticket_id, last_pr_number, updated_at)
       VALUES ($1::uuid, $2, $3, $4::uuid, $5::uuid, 'merged_pr', $6::uuid, $7, NOW())
       ON CONFLICT (project_id, path_glob, layer) DO UPDATE SET
         owner_agent_id = CASE
           WHEN path_owners.owner_agent_id = EXCLUDED.owner_agent_id THEN path_owners.owner_agent_id
           ELSE EXCLUDED.owner_agent_id
         END,
         last_ticket_id = EXCLUDED.last_ticket_id,
         last_pr_number = EXCLUDED.last_pr_number,
         updated_at = NOW()`,
      [input.projectId, row.pathGlob, row.layer, input.agentId, input.backupAgentId ?? null, input.ticketId, input.prNumber],
    );
    upserted += 1;
  }
  return upserted;
}

export async function reassignPathOwner(input: {
  workspaceId: string;
  projectId: string;
  pathOwnerId: string;
  toAgentId: string;
  ticketId?: string | null;
  handoverMd?: string;
}): Promise<PathOwnerRow> {
  const existing = await getPgPool().query<PathOwnerRow>(
    `SELECT * FROM path_owners WHERE id = $1::uuid AND project_id = $2::uuid`,
    [input.pathOwnerId, input.projectId],
  );
  const row = existing.rows[0];
  if (!row) throw new AppError('Path owner not found', 404, 'NOT_FOUND');
  const agent = await getPgPool().query(
    `SELECT id FROM skills WHERE id = $1::uuid AND project_id = $2::uuid`,
    [input.toAgentId, input.projectId],
  );
  if (!agent.rows[0]) throw new AppError('Agent is not on this project', 422, 'FORBIDDEN');

  await getPgPool().query(
    `UPDATE path_owners SET owner_agent_id = $2::uuid, source = 'manual', updated_at = NOW() WHERE id = $1::uuid`,
    [input.pathOwnerId, input.toAgentId],
  );
  await recordHandoff({
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    ticketId: input.ticketId ?? row.last_ticket_id,
    pathOwnerId: row.id,
    fromAgentId: row.owner_agent_id,
    toAgentId: input.toAgentId,
    reason: 'user_reassign',
    handoverMd: input.handoverMd ?? handoverDoc({
      from: row.owner_agent_id,
      to: input.toAgentId,
      reason: 'user_reassign',
      paths: [],
      pathGlob: row.path_glob,
    }),
  });
  const refreshed = await getPgPool().query<PathOwnerRow>(
    `SELECT po.*, o.real_name AS owner_name, b.real_name AS backup_name
       FROM path_owners po
       JOIN skills o ON o.id = po.owner_agent_id
       LEFT JOIN skills b ON b.id = po.backup_agent_id
      WHERE po.id = $1::uuid`,
    [input.pathOwnerId],
  );
  return refreshed.rows[0]!;
}
