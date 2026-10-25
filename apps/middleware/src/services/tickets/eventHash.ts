import { createHash } from 'node:crypto';

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) sorted[key] = sortValue(record[key]);
    return sorted;
  }
  return value;
}

export function canonicalDetail(detail: unknown): string {
  return JSON.stringify(sortValue(detail ?? {}));
}

export interface EventHashInput {
  ticketId: string;
  seq: number;
  eventType: string;
  actorKind: string;
  agentId: string | null;
  runId: string | null;
  summary: string;
  detailCanonical: string;
  modelId: string | null;
  tokensTotal: number | null;
  prUrl: string | null;
  commitSha: string | null;
  prevHash: string | null;
}

export function eventHash(fields: EventHashInput): string {
  const payload = [
    fields.ticketId,
    String(fields.seq),
    fields.eventType,
    fields.actorKind,
    fields.agentId ?? '',
    fields.runId ?? '',
    fields.summary,
    fields.detailCanonical,
    fields.modelId ?? '',
    fields.tokensTotal == null ? '' : String(fields.tokensTotal),
    fields.prUrl ?? '',
    fields.commitSha ?? '',
    fields.prevHash ?? '',
  ].join('\n');
  return createHash('sha256').update(payload).digest('hex');
}
