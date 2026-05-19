/**
 * V27.9 §18M — LSP-server-facing REST surface.
 *
 *   POST /api/lsp/locks            acquire a file lock (Redis SET NX EX, TTL ≤ 600s)
 *   POST /api/lsp/locks/release    release a held lock (holder check enforced)
 *   POST /api/lsp/locks/refresh    extend the TTL on a held lock
 *   GET  /api/lsp/locks/inspect    inspect by path (?path=...)
 *   POST /api/lsp/hover            return distilled Concept Graph summary for a symbol
 *   POST /api/lsp/diff/decisions   record an accept/reject decision on a ghost-text diff
 *   POST /api/lsp/tasks            inline task dispatch (/fix /test /explain /red-team etc.)
 *
 * The LSP server proxies all hover/diagnostics traffic through here so we share auth + rate
 * limiting with the rest of the dashboard surface.
 */

import type { Response, NextFunction } from 'express';
import { createHash } from 'node:crypto';
import { acquire, release, refresh, inspect } from '../services/fileLock.service';
import { distill } from '../services/distill.service';
import { getPgPool } from '../services/db.client';
import { lockAcquireSchema, lockReleaseSchema, lockRefreshSchema, hoverSchema, diffDecisionSchema, taskDispatchSchema } from '../schemas/lsp.schemas';
import type { AriaRequest } from '../middleware/auth.middleware';
import { AppError } from '../middleware/error.middleware';

function bearer(req: AriaRequest): string {
  const auth = req.headers.authorization;
  const t = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : undefined;
  if (!t) throw new AppError('Missing bearer token', 401);
  return t;
}

export async function acquireLock(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = lockAcquireSchema.parse(req.body);
    const lock = await acquire(parsed.path, parsed.agentId, parsed);
    if (!lock) {
      res.status(409).json({ success: false, error: 'Already locked', code: 'FILE_LOCKED' });
      return;
    }
    res.status(201).json({ success: true, data: lock });
  } catch (err) { next(err); }
}

export async function releaseLock(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = lockReleaseSchema.parse(req.body);
    const ok = await release(parsed.path, parsed.agentId);
    res.status(ok ? 200 : 404).json({ success: ok, data: { released: ok } });
  } catch (err) { next(err); }
}

export async function refreshLock(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = lockRefreshSchema.parse(req.body);
    const lock = await refresh(parsed.path, parsed.agentId, parsed.ttlSeconds);
    if (!lock) {
      res.status(404).json({ success: false, error: 'Not held by this agent', code: 'LOCK_NOT_HELD' });
      return;
    }
    res.json({ success: true, data: lock });
  } catch (err) { next(err); }
}

export async function inspectLock(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const path = typeof req.query.path === 'string' ? req.query.path : '';
    if (!path) throw new AppError('path required', 400);
    const lock = await inspect(path);
    res.json({ success: true, data: lock });
  } catch (err) { next(err); }
}

// In-memory LRU cache for hover responses (ADR-0016 p95 < 100 ms target). Keyed by
// `${projectId}|${filePath}|${symbol}`. TTL 5 minutes; capacity 256 entries — every
// keystroke that re-hovers the same symbol skips the distill round-trip.
const HOVER_CACHE_TTL_MS = 5 * 60_000;
const HOVER_CACHE_MAX    = 256;
const hoverCache = new Map<string, { value: unknown; expires: number }>();
function hoverCacheGet(key: string): unknown | null {
  const hit = hoverCache.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) { hoverCache.delete(key); return null; }
  // LRU bump
  hoverCache.delete(key);
  hoverCache.set(key, hit);
  return hit.value;
}
function hoverCacheSet(key: string, value: unknown): void {
  if (hoverCache.size >= HOVER_CACHE_MAX) {
    const oldest = hoverCache.keys().next().value;
    if (oldest) hoverCache.delete(oldest);
  }
  hoverCache.set(key, { value, expires: Date.now() + HOVER_CACHE_TTL_MS });
}
export function _resetHoverCacheForTests(): void { hoverCache.clear(); }

export async function hover(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = hoverSchema.parse(req.body);
    const cacheKey = `${parsed.projectId}|${parsed.filePath}|${parsed.symbol}`;
    const cached = hoverCacheGet(cacheKey);
    if (cached) { res.json({ success: true, data: cached, cached: true }); return; }

    const payload = await distill({
      projectId: parsed.projectId,
      agentId:   'lsp-hover',
      taskDescription: `Hover documentation for symbol \`${parsed.symbol}\` in ${parsed.filePath}`,
      maxAffectedSymbols: 1,
      maxModuleContext:   1,
      maxDomainConcepts:  1,
      maxDecisions:       2,
    }, bearer(req));
    const data = {
      symbol:   parsed.symbol,
      filePath: parsed.filePath,
      summary:  payload.affectedSymbols[0]?.summary ?? null,
      module:   payload.moduleContext[0]?.summary ?? null,
      domain:   payload.domainConcepts[0]?.summary ?? null,
      decisions: payload.governingDecisions,
      latencyMs: payload.durationMs,
    };
    hoverCacheSet(cacheKey, data);
    res.json({ success: true, data, cached: false });
  } catch (err) { next(err); }
}

export async function diffDecision(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = diffDecisionSchema.parse(req.body);
    await getPgPool().query(
      `INSERT INTO lsp_diff_decisions (agent_id, session_id, file_path, diff_hash, decision, decided_by, diff_excerpt)
       VALUES ($1, $2::uuid, $3, $4, $5, $6, $7)`,
      [parsed.agentId, parsed.sessionId ?? null, parsed.filePath, parsed.diffHash, parsed.decision, parsed.decidedBy, parsed.diffExcerpt ?? null]
    );
    res.status(201).json({ success: true });
  } catch (err) { next(err); }
}

export async function dispatchTask(req: AriaRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = taskDispatchSchema.parse(req.body);
    // Sprint 11 records the dispatch + returns a deterministic task id so clients can poll;
    // Sprint 14 wires the actual agent invocation through the Token Gateway behind the same
    // shape. Hash the request to give the client a stable id without touching the DB.
    const id = createHash('sha256')
      .update(JSON.stringify({ ...parsed, t: Date.now() }))
      .digest('hex')
      .slice(0, 16);
    res.status(202).json({
      success: true,
      data: { taskId: id, command: parsed.command, status: 'queued', queuedAt: new Date().toISOString() },
    });
  } catch (err) { next(err); }
}
