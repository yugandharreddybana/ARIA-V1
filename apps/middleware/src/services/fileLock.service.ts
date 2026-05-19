/**
 * V27.9 §18M — Redis-backed file lock with TTL (ADR-0017).
 *
 * Lock key:    `aria:lock:file:<repoRelPath>`
 * Lock value:  `<agentId>|<acquiredAt iso>|<sessionId?>`
 * Lock TTL:    60 s default; refreshable via `refresh()`.
 *
 * Acquisition uses Redis `SET NX EX` for atomicity. Release verifies the holder before
 * deleting so an expired holder can't accidentally release a lock newly acquired by another
 * agent.
 *
 * The same path is mirrored into the Postgres `file_locks` table on acquire so the dashboard
 * can list active locks without querying Redis directly.
 */

import Redis from 'ioredis';
import { validateEnv } from '../config/env';
import { getPgPool } from './db.client';

const LOCK_PREFIX = 'aria:lock:file:';

let redis: Redis | null = null;
function getRedis(): Redis {
  if (redis) return redis;
  const env = validateEnv();
  redis = new Redis(env.REDIS_URL, { lazyConnect: true });
  void redis.connect().catch(() => undefined);
  return redis;
}

export interface FileLockOwner {
  agentId: string;
  sessionId?: string;
  acquiredAt: string;
  expiresAt: string;
  ttlSeconds: number;
  reason?: string;
}

function encode(o: { agentId: string; acquiredAt: string; sessionId?: string }): string {
  return `${o.agentId}|${o.acquiredAt}|${o.sessionId ?? ''}`;
}
function decode(s: string): { agentId: string; acquiredAt: string; sessionId?: string } | null {
  const parts = s.split('|');
  if (parts.length < 2) return null;
  return { agentId: parts[0], acquiredAt: parts[1], sessionId: parts[2] || undefined };
}

export async function acquire(path: string, agentId: string, opts?: { ttlSeconds?: number; sessionId?: string; reason?: string }): Promise<FileLockOwner | null> {
  const ttl = Math.max(5, Math.min(600, opts?.ttlSeconds ?? 60));
  const acquiredAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ttl * 1_000).toISOString();
  const value = encode({ agentId, acquiredAt, sessionId: opts?.sessionId });
  const r = getRedis();
  // ioredis SET with NX + EX
  const ok = await r.set(LOCK_PREFIX + path, value, 'EX', ttl, 'NX');
  if (ok !== 'OK') return null;
  try {
    const pool = getPgPool();
    await pool.query(
      `INSERT INTO file_locks (path, agent_id, session_id, ttl_seconds, expires_at, reason)
       VALUES ($1, $2, $3::uuid, $4, $5, $6)
       ON CONFLICT (path) DO UPDATE SET
         agent_id    = EXCLUDED.agent_id,
         session_id  = EXCLUDED.session_id,
         ttl_seconds = EXCLUDED.ttl_seconds,
         expires_at  = EXCLUDED.expires_at,
         reason      = EXCLUDED.reason,
         acquired_at = NOW()`,
      [path, agentId, opts?.sessionId ?? null, ttl, expiresAt, opts?.reason ?? null]
    );
  } catch { /* mirror table is best-effort; Redis is authoritative */ }
  return { agentId, sessionId: opts?.sessionId, acquiredAt, expiresAt, ttlSeconds: ttl, reason: opts?.reason };
}

export async function release(path: string, agentId: string): Promise<boolean> {
  const r = getRedis();
  const cur = await r.get(LOCK_PREFIX + path);
  if (!cur) return false;
  const parsed = decode(cur);
  if (!parsed || parsed.agentId !== agentId) return false;
  await r.del(LOCK_PREFIX + path);
  try { await getPgPool().query(`DELETE FROM file_locks WHERE path = $1 AND agent_id = $2`, [path, agentId]); }
  catch { /* best-effort */ }
  return true;
}

export async function inspect(path: string): Promise<FileLockOwner | null> {
  const r = getRedis();
  const cur = await r.get(LOCK_PREFIX + path);
  if (!cur) return null;
  const parsed = decode(cur);
  if (!parsed) return null;
  const ttl = await r.ttl(LOCK_PREFIX + path);
  return {
    agentId: parsed.agentId,
    sessionId: parsed.sessionId,
    acquiredAt: parsed.acquiredAt,
    ttlSeconds: ttl > 0 ? ttl : 0,
    expiresAt: new Date(Date.now() + Math.max(0, ttl) * 1_000).toISOString(),
  };
}

export async function refresh(path: string, agentId: string, addSeconds: number): Promise<FileLockOwner | null> {
  const r = getRedis();
  const cur = await r.get(LOCK_PREFIX + path);
  if (!cur) return null;
  const parsed = decode(cur);
  if (!parsed || parsed.agentId !== agentId) return null;
  const newTtl = Math.max(5, Math.min(600, addSeconds));
  await r.expire(LOCK_PREFIX + path, newTtl);
  return inspect(path);
}
