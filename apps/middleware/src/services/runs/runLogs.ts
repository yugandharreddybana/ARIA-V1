import { getPgPool } from '../db.client';
import { emitProject } from './hub';

const SECRET = /(?:cursor_[A-Za-z0-9]{12,}|ghp_[A-Za-z0-9]{12,}|github_pat_[A-Za-z0-9_]{12,}|sk-[A-Za-z0-9]{12,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----)/g;

export function redact(text: string): string {
  return text.replace(SECRET, '[redacted]').replace(/(token|api[_-]?key|authorization)\s*[:=]\s*\S+/gi, '$1=[redacted]').slice(0, 4000);
}

const buffers = new Map<string, { text: string; timer: NodeJS.Timeout | null }>();

export async function append(runId: string, kind: 'status' | 'assistant' | 'tool' | 'system' | 'error', text: string): Promise<void> {
  const clean = redact(text);
  if (kind === 'assistant' && !clean.includes('\n')) {
    const bucket = buffers.get(runId) ?? { text: '', timer: null };
    bucket.text += clean;
    if (!bucket.timer) {
      bucket.timer = setTimeout(() => { void flush(runId); }, 2000);
      bucket.timer.unref?.();
    }
    buffers.set(runId, bucket);
    return;
  }
  if (kind === 'assistant') {
    const bucket = buffers.get(runId);
    const combined = `${bucket?.text ?? ''}${clean}`;
    if (bucket?.timer) clearTimeout(bucket.timer);
    buffers.delete(runId);
    await write(runId, kind, combined);
    return;
  }
  await write(runId, kind, clean);
}

export async function flush(runId: string): Promise<void> {
  const bucket = buffers.get(runId);
  if (!bucket) return;
  if (bucket.timer) clearTimeout(bucket.timer);
  buffers.delete(runId);
  if (bucket.text) await write(runId, 'assistant', bucket.text);
}

async function write(runId: string, kind: string, message: string): Promise<void> {
  const pool = getPgPool();
  const count = await pool.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM agent_run_logs WHERE run_id = $1::uuid`, [runId]);
  if (Number(count.rows[0]?.n ?? 0) >= 2000 && kind !== 'status' && kind !== 'error') return;
  const inserted = await pool.query<{ seq: number; created_at: Date }>(
    `INSERT INTO agent_run_logs (run_id, seq, kind, message)
     SELECT $1::uuid, COALESCE(MAX(seq), 0) + 1, $2, $3 FROM agent_run_logs WHERE run_id = $1::uuid
     RETURNING seq, created_at`,
    [runId, kind, message],
  );
  const line = inserted.rows[0];
  const run = await pool.query<{ project_id: string }>(`SELECT project_id FROM agent_runs WHERE id = $1::uuid`, [runId]);
  const projectId = run.rows[0]?.project_id;
  if (projectId && line) {
    emitProject(projectId, 'run:log', {
      runId,
      lines: [{ seq: line.seq, kind, message, ts: new Date(line.created_at).toISOString() }],
    });
  }
}

export async function list(runId: string, afterSeq = 0, limit = 500): Promise<Array<{ seq: number; kind: string; message: string; ts: string }>> {
  const result = await getPgPool().query<{ seq: number; kind: string; message: string; created_at: Date }>(
    `SELECT seq, kind, message, created_at FROM agent_run_logs
      WHERE run_id = $1::uuid AND seq > $2
      ORDER BY seq LIMIT $3`,
    [runId, afterSeq, Math.min(limit, 500)],
  );
  return result.rows.map((row) => ({ seq: row.seq, kind: row.kind, message: row.message, ts: new Date(row.created_at).toISOString() }));
}
