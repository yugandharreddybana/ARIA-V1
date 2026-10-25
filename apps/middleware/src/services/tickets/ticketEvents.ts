import type { PoolClient } from 'pg';
import { getPgPool } from '../db.client';
import { canonicalDetail, eventHash, type EventHashInput } from './eventHash';

export const EVENT_TYPES = [
  'status_change',
  'agent_action',
  'progress',
  'communication',
  'run_ref',
  'owner_decision',
  'schedule',
  'evidence',
] as const;

export type TicketEventType = typeof EVENT_TYPES[number];
export type ActorKind = 'agent' | 'owner' | 'system' | 'human';

export interface TicketEventRow {
  id: string;
  workspace_id: string;
  project_id: string;
  ticket_id: string;
  seq: number;
  event_type: TicketEventType;
  actor_kind: ActorKind;
  agent_id: string | null;
  run_id: string | null;
  summary: string;
  detail: unknown;
  detail_canonical: string;
  model_id: string | null;
  tokens_total: number | null;
  pr_url: string | null;
  commit_sha: string | null;
  prev_hash: string | null;
  hash: string;
  created_at: Date;
}

export async function appendTicketEvent(input: {
  workspaceId: string;
  projectId: string;
  ticketId: string;
  eventType: TicketEventType;
  actorKind: ActorKind;
  agentId?: string | null;
  runId?: string | null;
  summary: string;
  detail?: unknown;
  modelId?: string | null;
  tokensTotal?: number | null;
  prUrl?: string | null;
  commitSha?: string | null;
}, client?: PoolClient): Promise<TicketEventRow> {
  const own = !client;
  const db = client ?? await getPgPool().connect();
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
    if (own) await db.query('BEGIN');
    else await db.query('SAVEPOINT ticket_event');
    await db.query(`SELECT pg_advisory_xact_lock(hashtext($1::text))`, [`events:${input.ticketId}`]);
    // Qualify seq. `SELECT seq::text ... ORDER BY seq` sorts the text alias ("9" > "10").
    const prior = await db.query<{ seq: string; hash: string }>(
      `SELECT t.seq::text AS seq, t.hash
         FROM ticket_events t
        WHERE t.ticket_id = $1::uuid
        ORDER BY t.seq DESC
        LIMIT 1`,
      [input.ticketId],
    );
    const seq = Number(prior.rows[0]?.seq ?? 0) + 1;
    const prevHash = prior.rows[0]?.hash ?? null;
    const detailCanonical = canonicalDetail(input.detail ?? {});
    const fields: EventHashInput = {
      ticketId: input.ticketId,
      seq,
      eventType: input.eventType,
      actorKind: input.actorKind,
      agentId: input.agentId ?? null,
      runId: input.runId ?? null,
      summary: input.summary,
      detailCanonical,
      modelId: input.modelId ?? null,
      tokensTotal: input.tokensTotal ?? null,
      prUrl: input.prUrl ?? null,
      commitSha: input.commitSha ?? null,
      prevHash,
    };
    const hash = eventHash(fields);
    const inserted = await db.query<TicketEventRow>(
      `INSERT INTO ticket_events (
         workspace_id, project_id, ticket_id, seq, event_type, actor_kind, agent_id, run_id,
         summary, detail, detail_canonical, model_id, tokens_total, pr_url, commit_sha, prev_hash, hash
       ) VALUES (
         $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7::uuid, $8::uuid,
         $9, $10::jsonb, $11, $12, $13, $14, $15, $16, $17
       ) RETURNING *`,
      [
        input.workspaceId, input.projectId, input.ticketId, seq, input.eventType, input.actorKind,
        input.agentId ?? null, input.runId ?? null, input.summary, JSON.stringify(input.detail ?? {}),
        detailCanonical, input.modelId ?? null, input.tokensTotal ?? null, input.prUrl ?? null,
        input.commitSha ?? null, prevHash, hash,
      ],
    );
    if (own) await db.query('COMMIT');
    else await db.query('RELEASE SAVEPOINT ticket_event');
    return inserted.rows[0];
    } catch (err) {
      if (own) await db.query('ROLLBACK');
      else await db.query('ROLLBACK TO SAVEPOINT ticket_event');
      const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
      if ((code === '23514' || code === '23505') && attempt < 2) continue;
      throw err;
    }
    }
    throw new Error('ticket event was not appended');
  } finally {
    if (own) db.release();
  }
}

export async function listTicketEvents(ticketId: string, filter: {
  eventType?: string;
  agentId?: string;
  afterSeq?: number;
  limit?: number;
}): Promise<TicketEventRow[]> {
  const clauses = ['ticket_id = $1::uuid'];
  const params: unknown[] = [ticketId];
  if (filter.eventType) {
    params.push(filter.eventType);
    clauses.push(`event_type = $${params.length}`);
  }
  if (filter.agentId) {
    params.push(filter.agentId);
    clauses.push(`agent_id = $${params.length}::uuid`);
  }
  if (filter.afterSeq) {
    params.push(filter.afterSeq);
    clauses.push(`seq > $${params.length}`);
  }
  params.push(Math.min(filter.limit ?? 100, 5000));
  const result = await getPgPool().query<TicketEventRow>(
    `SELECT * FROM ticket_events WHERE ${clauses.join(' AND ')} ORDER BY seq LIMIT $${params.length}`,
    params,
  );
  return result.rows;
}

export function verifyChain(rows: TicketEventRow[]): { ok: boolean; brokenAt: number | null } {
  let prev: string | null = null;
  for (const row of rows) {
    if (row.prev_hash !== prev) return { ok: false, brokenAt: Number(row.seq) };
    const hash = eventHash({
      ticketId: row.ticket_id,
      seq: Number(row.seq),
      eventType: row.event_type,
      actorKind: row.actor_kind,
      agentId: row.agent_id,
      runId: row.run_id,
      summary: row.summary,
      detailCanonical: row.detail_canonical,
      modelId: row.model_id,
      tokensTotal: row.tokens_total == null ? null : Number(row.tokens_total),
      prUrl: row.pr_url,
      commitSha: row.commit_sha,
      prevHash: row.prev_hash,
    });
    if (hash !== row.hash) return { ok: false, brokenAt: Number(row.seq) };
    prev = row.hash;
  }
  return { ok: true, brokenAt: null };
}

export function eventsToMarkdown(ticketKey: string, rows: TicketEventRow[], truncated = false): string {
  const lines = [`# ${ticketKey} activity`, ''];
  for (const row of rows) {
    lines.push(`## ${row.seq}. ${row.event_type} (${row.actor_kind})`);
    lines.push(row.summary);
    lines.push(`Hash: ${row.hash}`);
    lines.push(`Detail: ${row.detail_canonical}`);
    if (row.run_id) lines.push(`Run: ${row.run_id}`);
    if (row.pr_url) lines.push(`PR: ${row.pr_url}`);
    if (row.commit_sha) lines.push(`Commit: ${row.commit_sha}`);
    lines.push('');
  }
  if (truncated) lines.push('Export truncated. Request a later cursor to continue.');
  return lines.join('\n');
}

export async function agentMayAppend(ticketId: string, agentId: string): Promise<boolean> {
  const result = await getPgPool().query<{ ok: boolean }>(
    `SELECT (
       EXISTS (SELECT 1 FROM tickets t WHERE t.id = $1::uuid AND t.assigned_skill_id = $2::uuid)
       OR EXISTS (SELECT 1 FROM agent_runs r WHERE r.ticket_id = $1::uuid AND r.agent_id = $2::uuid)
       OR EXISTS (
         SELECT 1 FROM tickets t
         JOIN flow_owners fo ON fo.flow_id = t.flow_id
         WHERE t.id = $1::uuid AND fo.agent_id = $2::uuid
       )
     ) AS ok`,
    [ticketId, agentId],
  );
  return Boolean(result.rows[0]?.ok);
}
