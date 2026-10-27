import { getPgPool } from '../db.client';
import { emitProject } from './hub';

const SECRET = /(?:cursor_[A-Za-z0-9]{12,}|ghp_[A-Za-z0-9]{12,}|gho_[A-Za-z0-9]{12,}|ghs_[A-Za-z0-9]{12,}|ghu_[A-Za-z0-9]{12,}|ghr_[A-Za-z0-9]{12,}|github_pat_[A-Za-z0-9_]{12,}|sk-[A-Za-z0-9]{12,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----)/g;

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
  const client = await pool.connect();
  let line: { seq: number; created_at: Date } | undefined;
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await client.query('BEGIN');
        await client.query(`SELECT pg_advisory_xact_lock(hashtext($1::text))`, [`logs:${runId}`]);
        const inserted = await client.query<{ seq: number; created_at: Date }>(
          `INSERT INTO agent_run_logs (run_id, seq, kind, message)
           SELECT $1::uuid, COALESCE(MAX(seq), 0) + 1, $2, $3
             FROM agent_run_logs WHERE run_id = $1::uuid
            HAVING COUNT(*) < 2000 OR $2 IN ('status', 'error')
           RETURNING seq, created_at`,
          [runId, kind, message],
        );
        line = inserted.rows[0];
        await client.query('COMMIT');
        break;
      } catch (err) {
        await client.query('ROLLBACK');
        const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
        if (code !== '23505') throw err;
      }
    }
  } finally {
    client.release();
  }
  const run = await pool.query<{ project_id: string }>(`SELECT project_id FROM agent_runs WHERE id = $1::uuid`, [runId]);
  const projectId = run.rows[0]?.project_id;
  if (projectId && line) {
    emitProject(projectId, 'run:log', {
      runId,
      lines: [{ seq: line.seq, kind, message, ts: new Date(line.created_at).toISOString() }],
    });
  }
}

export async function list(
  runId: string,
  options: { afterSeq?: number; beforeSeq?: number; tail?: boolean; limit?: number } = {},
): Promise<Array<{ seq: number; kind: string; message: string; ts: string }>> {
  const cap = Math.min(Math.max(options.limit ?? 500, 1), 2000);
  const pool = getPgPool();
  if (options.beforeSeq != null) {
    const result = await pool.query<{ seq: number; kind: string; message: string; created_at: Date }>(
      `SELECT seq, kind, message, created_at FROM (
         SELECT seq, kind, message, created_at FROM agent_run_logs
          WHERE run_id = $1::uuid AND seq < $2
          ORDER BY seq DESC
          LIMIT $3
       ) earlier ORDER BY seq ASC`,
      [runId, options.beforeSeq, cap],
    );
    return result.rows.map(mapLine);
  }
  if (options.tail) {
    const result = await pool.query<{ seq: number; kind: string; message: string; created_at: Date }>(
      `SELECT seq, kind, message, created_at FROM (
         SELECT seq, kind, message, created_at FROM agent_run_logs
          WHERE run_id = $1::uuid
          ORDER BY seq DESC
          LIMIT $2
       ) latest ORDER BY seq ASC`,
      [runId, cap],
    );
    return result.rows.map(mapLine);
  }
  const result = await pool.query<{ seq: number; kind: string; message: string; created_at: Date }>(
    `SELECT seq, kind, message, created_at FROM agent_run_logs
      WHERE run_id = $1::uuid AND seq > $2
      ORDER BY seq LIMIT $3`,
    [runId, options.afterSeq ?? 0, cap],
  );
  return result.rows.map(mapLine);
}

function mapLine(row: { seq: number; kind: string; message: string; created_at: Date }): { seq: number; kind: string; message: string; ts: string } {
  return { seq: row.seq, kind: row.kind, message: row.message, ts: new Date(row.created_at).toISOString() };
}
