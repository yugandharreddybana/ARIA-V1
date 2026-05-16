/**
 * Token ledger — per (session_id, backend_id) running totals for the
 * Token Gateway's budget enforcement. Backed by Postgres `token_ledger`.
 */

import { Client } from 'pg';
import type { TokenLedgerRepository, SessionBudget } from './tokenGateway.service';

export class PgTokenLedgerRepository implements TokenLedgerRepository {
  constructor(private readonly client: Pick<Client, 'query'>) {}

  async reserve(sessionId: string, backendId: string, tokens: number): Promise<void> {
    await this.client.query(
      `INSERT INTO token_ledger (session_id, backend_id, tokens_used, tokens_reserved, last_updated_at)
       VALUES ($1::uuid, $2, 0, $3, NOW())
       ON CONFLICT (session_id, backend_id) DO UPDATE
         SET tokens_reserved = token_ledger.tokens_reserved + EXCLUDED.tokens_reserved,
             last_updated_at = NOW()`,
      [sessionId, backendId, tokens],
    );
  }

  async consume(sessionId: string, backendId: string, actualTokens: number, releasedReserved: number): Promise<void> {
    await this.client.query(
      `UPDATE token_ledger
          SET tokens_used     = tokens_used     + $3,
              tokens_reserved = GREATEST(0, tokens_reserved - $4),
              last_updated_at = NOW()
        WHERE session_id = $1::uuid AND backend_id = $2`,
      [sessionId, backendId, actualTokens, releasedReserved],
    );
  }

  async releaseReservation(sessionId: string, backendId: string, tokens: number): Promise<void> {
    await this.client.query(
      `UPDATE token_ledger
          SET tokens_reserved = GREATEST(0, tokens_reserved - $3),
              last_updated_at = NOW()
        WHERE session_id = $1::uuid AND backend_id = $2`,
      [sessionId, backendId, tokens],
    );
  }

  async getBudget(sessionId: string, maxTokens: number, warnRatio: number, hardRatio: number): Promise<SessionBudget> {
    const { rows } = await this.client.query<{ used: string; reserved: string }>(
      `SELECT COALESCE(SUM(tokens_used), 0)::text AS used,
              COALESCE(SUM(tokens_reserved), 0)::text AS reserved
         FROM token_ledger WHERE session_id = $1::uuid`,
      [sessionId],
    );
    const used = Number(rows[0]?.used ?? 0);
    const reserved = Number(rows[0]?.reserved ?? 0);
    const projected = used + reserved;
    let status: SessionBudget['status'] = 'ok';
    if (projected >= Math.floor(maxTokens * hardRatio)) status = 'hard_stop';
    else if (projected >= Math.floor(maxTokens * warnRatio)) status = 'warn';
    return { sessionId, maxTokens, used, reserved, warnRatio, hardRatio, status };
  }
}

/** In-memory fallback used when no Postgres client is configured (tests / dry-run). */
export class InMemoryTokenLedgerRepository implements TokenLedgerRepository {
  private map: Map<string, { used: number; reserved: number }> = new Map();
  private key(s: string, b: string): string { return `${s}::${b}`; }

  async reserve(sessionId: string, backendId: string, tokens: number): Promise<void> {
    const k = this.key(sessionId, backendId);
    const cur = this.map.get(k) ?? { used: 0, reserved: 0 };
    cur.reserved += tokens;
    this.map.set(k, cur);
  }
  async consume(sessionId: string, backendId: string, actualTokens: number, releasedReserved: number): Promise<void> {
    const k = this.key(sessionId, backendId);
    const cur = this.map.get(k) ?? { used: 0, reserved: 0 };
    cur.used += actualTokens;
    cur.reserved = Math.max(0, cur.reserved - releasedReserved);
    this.map.set(k, cur);
  }
  async releaseReservation(sessionId: string, backendId: string, tokens: number): Promise<void> {
    const k = this.key(sessionId, backendId);
    const cur = this.map.get(k) ?? { used: 0, reserved: 0 };
    cur.reserved = Math.max(0, cur.reserved - tokens);
    this.map.set(k, cur);
  }
  async getBudget(sessionId: string, maxTokens: number, warnRatio: number, hardRatio: number): Promise<SessionBudget> {
    let used = 0, reserved = 0;
    this.map.forEach((v, k) => { if (k.startsWith(`${sessionId}::`)) { used += v.used; reserved += v.reserved; } });
    const projected = used + reserved;
    let status: SessionBudget['status'] = 'ok';
    if (projected >= Math.floor(maxTokens * hardRatio)) status = 'hard_stop';
    else if (projected >= Math.floor(maxTokens * warnRatio)) status = 'warn';
    return { sessionId, maxTokens, used, reserved, warnRatio, hardRatio, status };
  }
}

import type { ReplayFrameRepository } from './tokenGateway.service';

export class InMemoryReplayFrameRepository implements ReplayFrameRepository {
  frames: Array<{ id: string; status: string; error: string | null }> = [];
  async insertQueued(): Promise<string> { const id = `frame_${this.frames.length+1}`; this.frames.push({ id, status: 'queued', error: null }); return id; }
  async markDispatched(id: string): Promise<void> { const f = this.frames.find(x => x.id === id); if (f) f.status = 'dispatched'; }
  async markCompleted(id: string, _f: { responseHash: string; responseFull: string; responseTokens: number; totalTokens: number; promptTokensActual: number }): Promise<void> {
    const f = this.frames.find(x => x.id === id);
    if (f) f.status = 'completed';
  }
  async markFailed(id: string, error: string): Promise<void> { const f = this.frames.find(x => x.id === id); if (f) { f.status = 'failed'; f.error = error; } }
  async markRejected(id: string, error: string): Promise<void> { const f = this.frames.find(x => x.id === id); if (f) { f.status = 'rejected'; f.error = error; } }
}
